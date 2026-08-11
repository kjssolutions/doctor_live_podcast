"use client";

import { MobileCameraHelp } from "@/app/interview/[token]/mobile-camera-help";
import {
  disposeBackgroundBlurSession,
  getBackgroundBlurSession,
  isAndroidDevice,
  isIosDevice,
} from "@/lib/background-blur";
import { describeCameraBlocker } from "@/lib/camera-access";
import { REFERENCE_VIDEO_SRC } from "@/lib/reference-video";
import {
  Aperture,
  CheckCircle2,
  CircleStop,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Timer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Mobile canvas+MediaRecorder can't keep up at full 1080×1920 (Android lag).
const USE_LITE_PORTRAIT = isIosDevice() || isAndroidDevice();
const PORTRAIT_WIDTH = USE_LITE_PORTRAIT ? 720 : 1080;
const PORTRAIT_HEIGHT = USE_LITE_PORTRAIT ? 1280 : 1920;
const CAPTURE_FPS = isAndroidDevice() ? 24 : 30;
const CAMERA_IDEAL_WIDTH = USE_LITE_PORTRAIT ? 1280 : 1920;
const CAMERA_IDEAL_HEIGHT = USE_LITE_PORTRAIT ? 720 : 1080;
const ANDROID_VIDEO_BITS_PER_SECOND = 2_500_000;

type Question = {
  id: string;
  title: string;
  prompt: string;
  order: number;
  avatarVideoUrl: string | null;
};

type Doctor = {
  name: string;
  specialty: string | null;
  imageUrl: string | null;
};

type UploadState = "idle" | "uploading" | "done" | "error";
type StepPhase = "watch" | "record" | "review";

function getQuestionVideoSrc(question: Question) {
  if (question.avatarVideoUrl) {
    return question.avatarVideoUrl;
  }
  return REFERENCE_VIDEO_SRC;
}

function findFirstPendingQuestionIndex(
  questions: Question[],
  accepted: Set<string>,
) {
  const index = questions.findIndex((q) => !accepted.has(q.id));
  return index >= 0 ? index : 0;
}

function getSupportedVideoMimeType() {
  const options = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4",
  ];

  return options.find((option) => MediaRecorder.isTypeSupported(option)) ?? "";
}

export function InterviewRecorder({
  token,
  doctor,
  questions,
  completedQuestionIds,
}: {
  token: string;
  doctor: Doctor;
  questions: Question[];
  completedQuestionIds: string[];
}) {
  const initialAccepted = useMemo(
    () => new Set(completedQuestionIds),
    [completedQuestionIds],
  );
  const pendingCount = questions.length - initialAccepted.size;
  const hasPartialProgress =
    initialAccepted.size > 0 && pendingCount > 0;

  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(() =>
    findFirstPendingQuestionIndex(questions, initialAccepted),
  );
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  // True between "Stop" press and recorder.onstop — prevents showing live camera
  // and "Start recording" button during that processing gap.
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPreparingCamera, setIsPreparingCamera] = useState(false);
  const [isSecureContext] = useState(() => window.isSecureContext);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewRequested, setIsPreviewRequested] = useState(false);
  const [blurEnabled, setBlurEnabled] = useState(false);
  const [blurLoading, setBlurLoading] = useState(false);
  const recordingSecondsRef = useRef(0);
  const blurEnabledRef = useRef(false);
  const [acceptedQuestionIds, setAcceptedQuestionIds] =
    useState(initialAccepted);
  const [stepPhase, setStepPhase] = useState<StepPhase>("watch");

  // Single video element for both live camera and recorded playback.
  // We swap between srcObject (live) and src (recorded) imperatively so React
  // never unmounts/remounts the element — that prevented playback from working.
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingMimeTypeRef = useRef("");
  const rawStreamRef = useRef<MediaStream | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const canvasVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasAnimationRef = useRef<number | null>(null);
  const stopDrawRef = useRef<(() => void) | null>(null);
  /** Bumps on every camera refresh so overlapping async rebuilds don't clobber each other. */
  const cameraGenRef = useRef(0);
  /** Prevents double-tap on Preview / Retake while async camera work runs. */
  const actionLockRef = useRef(false);
  // Stable ref so the unmount-only cleanup can stop tracks without stream in deps.
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);
  useEffect(() => {
    blurEnabledRef.current = blurEnabled;
  }, [blurEnabled]);

  function stopTracks(media: MediaStream | null | undefined) {
    media?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
  }

  function stopPortraitPipeline() {
    stopDrawRef.current?.();
    stopDrawRef.current = null;
    if (canvasAnimationRef.current !== null && canvasAnimationRef.current >= 0) {
      cancelAnimationFrame(canvasAnimationRef.current);
    }
    canvasAnimationRef.current = null;
    const sourceVideo = canvasVideoRef.current;
    if (sourceVideo) {
      sourceVideo.pause();
      sourceVideo.srcObject = null;
    }
    canvasVideoRef.current = null;
    stopTracks(captureStreamRef.current);
    captureStreamRef.current = null;
  }

  /** Safe play — ignore AbortError from overlapping pause()/load(). */
  function safePlay(video: HTMLVideoElement) {
    const result = video.play();
    if (result !== undefined) {
      void result.catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : "";
        if (name !== "AbortError" && name !== "NotAllowedError") {
          // ignore benign play races; surface nothing for AbortError
        }
      });
    }
  }

  function attachLiveToVideo(media: MediaStream) {
    const video = videoRef.current;
    if (!video) return;
    // Avoid pause()+play() churn when already showing this live stream.
    if (video.srcObject === media && !video.paused) {
      return;
    }
    if (video.src) {
      video.removeAttribute("src");
    }
    if (video.srcObject !== media) {
      video.srcObject = media;
    }
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    safePlay(video);
  }

  function attachPreviewToVideo(url: string, autoplay: boolean) {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject) {
      video.srcObject = null;
    }
    if (video.getAttribute("src") !== url) {
      video.src = url;
      video.load();
    }
    video.muted = false;
    video.playsInline = true;
    if (autoplay) {
      try {
        video.currentTime = 0;
      } catch {
        // ignore
      }
      safePlay(video);
    }
  }

  async function createPortraitRecordingStream(
    sourceStream: MediaStream,
  ): Promise<{
    stream: MediaStream;
    sourceVideo: HTMLVideoElement;
    stopDraw: () => void;
  }> {
    const sourceVideo = document.createElement("video");
    sourceVideo.srcObject = sourceStream;
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    sourceVideo.autoplay = true;

    try {
      await sourceVideo.play();
    } catch {
      // play() may fail before metadata is ready; drawing loop below still retries.
    }

    // Wait briefly for dimensions so the first drawn frames aren't empty/black.
    if (!sourceVideo.videoWidth) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        sourceVideo.addEventListener("loadeddata", done, { once: true });
        window.setTimeout(done, 800);
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = PORTRAIT_WIDTH;
    canvas.height = PORTRAIT_HEIGHT;
    const ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    } as CanvasRenderingContext2DSettings);
    if (!ctx) {
      throw new Error("Could not prepare portrait recorder.");
    }

    const blurSession = getBackgroundBlurSession();
    const frameIntervalMs = 1000 / CAPTURE_FPS;
    let lastDrawMs = 0;
    let rafId: number | null = null;
    let stopped = false;

    const drawFrame = (now: number) => {
      if (stopped) return;
      rafId = requestAnimationFrame(drawFrame);
      if (now - lastDrawMs < frameIntervalMs) {
        return;
      }
      lastDrawMs = now;
      // Keep source playing — mobile browsers sometimes pause background videos.
      if (sourceVideo.paused) {
        safePlay(sourceVideo);
      }
      blurSession.drawPortraitFrame({
        dest: ctx,
        sourceVideo,
        destWidth: PORTRAIT_WIDTH,
        destHeight: PORTRAIT_HEIGHT,
        blurEnabled: blurEnabledRef.current && blurSession.isReady(),
      });
    };

    rafId = requestAnimationFrame(drawFrame);

    const portraitStream = canvas.captureStream(CAPTURE_FPS);
    const audioTrack = sourceStream.getAudioTracks()[0];
    if (audioTrack && audioTrack.readyState === "live") {
      portraitStream.addTrack(audioTrack.clone());
    }

    return {
      stream: portraitStream,
      sourceVideo,
      stopDraw: () => {
        stopped = true;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
    };
  }

  /** Rebuild canvas capture stream from the existing camera (no re-prompt). */
  async function refreshPortraitStream() {
    const gen = ++cameraGenRef.current;
    const raw = rawStreamRef.current;
    const rawLive =
      raw &&
      raw.getTracks().length > 0 &&
      raw.getTracks().every((track) => track.readyState === "live");

    if (!rawLive) {
      return ensureCameraStream({ forceNew: true, gen });
    }

    let created:
      | {
          stream: MediaStream;
          sourceVideo: HTMLVideoElement;
          stopDraw: () => void;
        }
      | null = null;

    try {
      created = await createPortraitRecordingStream(raw);
      if (gen !== cameraGenRef.current) {
        // Newer refresh won — only dispose THIS attempt, never the newer pipeline.
        created.stopDraw();
        created.sourceVideo.pause();
        created.sourceVideo.srcObject = null;
        stopTracks(created.stream);
        return null;
      }

      // Commit: swap refs, then tear down the previous pipeline only.
      const oldCapture = captureStreamRef.current;
      const oldCanvasVideo = canvasVideoRef.current;
      const oldStopDraw = stopDrawRef.current;

      canvasVideoRef.current = created.sourceVideo;
      captureStreamRef.current = created.stream;
      stopDrawRef.current = created.stopDraw;
      canvasAnimationRef.current = -1;

      oldStopDraw?.();
      stopTracks(oldCapture);
      if (oldCanvasVideo) {
        oldCanvasVideo.pause();
        oldCanvasVideo.srcObject = null;
      }

      setStream(created.stream);
      return created.stream;
    } catch {
      if (created) {
        created.stopDraw();
        created.sourceVideo.pause();
        created.sourceVideo.srcObject = null;
        stopTracks(created.stream);
      }
      if (gen === cameraGenRef.current) {
        setError("Camera preview failed. Tap Start recording again.");
      }
      return null;
    }
  }

  // Count up every second while recording.
  useEffect(() => {
    if (!isRecording) {
      return;
    }

    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    const id = setInterval(() => {
      recordingSecondsRef.current += 1;
      setRecordingSeconds(recordingSecondsRef.current);
    }, 1000);

    return () => clearInterval(id);
  }, [isRecording]);

  const currentQuestion = questions[currentIndex];
  const isComplete = acceptedQuestionIds.size >= questions.length;
  const progress = useMemo(
    () => Math.round((acceptedQuestionIds.size / questions.length) * 100),
    [acceptedQuestionIds.size, questions.length],
  );

  // Each question starts with watch → record → review.
  useEffect(() => {
    setStepPhase("watch");
    setRecordedBlob(null);
    setUploadState("idle");
    setError(null);
    setIsProcessing(false);
    setIsPreviewRequested(false);
    setRecordedDuration(0);
    setRecordingSeconds(0);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive the single video element carefully — never pause()+play() thrash on
  // an already-attached live stream (causes AbortError and can freeze capture).
  useEffect(() => {
    if (stepPhase !== "record" && stepPhase !== "review") {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    if (stepPhase === "review" && previewUrl) {
      // Only (re)load when the URL changes; Preview button handles play.
      if (video.getAttribute("src") !== previewUrl) {
        attachPreviewToVideo(previewUrl, false);
      }
      if (isPreviewRequested && video.paused) {
        safePlay(video);
      }
    } else if (stepPhase === "record" && stream && !isRecording) {
      const live =
        stream.getTracks().length > 0 &&
        stream.getTracks().every((track) => track.readyState === "live");
      if (live) {
        attachLiveToVideo(stream);
      }
    }

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [stream, previewUrl, isPreviewRequested, stepPhase, isRecording]);

  // Stop camera tracks ONLY on unmount — never during retake or question changes.
  useEffect(() => {
    return () => {
      cameraGenRef.current += 1;
      stopPortraitPipeline();
      disposeBackgroundBlurSession();
      stopTracks(rawStreamRef.current);
      rawStreamRef.current = null;
      stopTracks(streamRef.current);
    };
  }, []);

  // Warm up live preview as soon as the doctor enters the record step.
  useEffect(() => {
    if (stepPhase !== "record" || isRecording || recordedBlob || isProcessing) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setIsPreparingCamera(true);
      const next = await refreshPortraitStream();
      if (!cancelled && next) {
        attachLiveToVideo(next);
      }
      if (!cancelled) {
        setIsPreparingCamera(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stepPhase, isRecording, recordedBlob, isProcessing, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startInterview() {
    setError(null);
    setIsStarting(true);

    const cameraBlocker = describeCameraBlocker();
    if (cameraBlocker) {
      setError(cameraBlocker);
      setIsStarting(false);
      return;
    }

    if (!window.MediaRecorder) {
      setError("Video recording is not supported in this browser. Please use Chrome or Safari.");
      setIsStarting(false);
      return;
    }

    try {
      setStarted(true);
      await fetch(`/api/interviews/${token}/start`, { method: "POST" });
    } finally {
      setIsStarting(false);
    }
  }

  async function ensureCameraStream(options?: {
    forceNew?: boolean;
    gen?: number;
  }) {
    const forceNew = options?.forceNew === true;
    const gen = options?.gen ?? ++cameraGenRef.current;
    const activeTracks = streamRef.current?.getTracks() ?? [];
    if (
      !forceNew &&
      streamRef.current &&
      activeTracks.length > 0 &&
      activeTracks.every((track) => track.readyState === "live") &&
      stopDrawRef.current
    ) {
      return streamRef.current;
    }

    let created:
      | {
          stream: MediaStream;
          sourceVideo: HTMLVideoElement;
          stopDraw: () => void;
        }
      | null = null;

    try {
      const existingRaw = rawStreamRef.current;
      const rawStillLive =
        existingRaw &&
        existingRaw.getTracks().length > 0 &&
        existingRaw.getTracks().every((track) => track.readyState === "live");

      let mediaStream: MediaStream;
      if (!forceNew && rawStillLive) {
        mediaStream = existingRaw;
      } else {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: CAMERA_IDEAL_WIDTH },
            height: { ideal: CAMERA_IDEAL_HEIGHT },
            frameRate: {
              ideal: CAPTURE_FPS,
              max: CAPTURE_FPS,
            },
            aspectRatio: { ideal: 9 / 16 },
          },
          audio: true,
        });
        if (gen !== cameraGenRef.current) {
          stopTracks(mediaStream);
          return null;
        }
        stopTracks(rawStreamRef.current);
        rawStreamRef.current = mediaStream;
      }

      created = await createPortraitRecordingStream(mediaStream);
      if (gen !== cameraGenRef.current) {
        created.stopDraw();
        created.sourceVideo.pause();
        created.sourceVideo.srcObject = null;
        stopTracks(created.stream);
        return null;
      }

      const oldCapture = captureStreamRef.current;
      const oldCanvasVideo = canvasVideoRef.current;
      const oldStopDraw = stopDrawRef.current;

      canvasVideoRef.current = created.sourceVideo;
      captureStreamRef.current = created.stream;
      stopDrawRef.current = created.stopDraw;
      canvasAnimationRef.current = -1;

      oldStopDraw?.();
      stopTracks(oldCapture);
      if (oldCanvasVideo) {
        oldCanvasVideo.pause();
        oldCanvasVideo.srcObject = null;
      }

      setStream(created.stream);
      return created.stream;
    } catch (cause) {
      if (created) {
        created.stopDraw();
        created.sourceVideo.pause();
        created.sourceVideo.srcObject = null;
        stopTracks(created.stream);
      }
      const name = cause instanceof DOMException ? cause.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Please allow camera and microphone access in your browser settings, then tap Start recording again.",
        );
      } else if (name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError(
          "Could not start camera. Use HTTPS on mobile or check browser permissions.",
        );
      }
      return null;
    }
  }

  async function toggleBlurBackground() {
    if (blurLoading) {
      return;
    }

    if (blurEnabled) {
      setBlurEnabled(false);
      blurEnabledRef.current = false;
      return;
    }

    setError(null);
    setBlurLoading(true);
    try {
      const camera = await ensureCameraStream();
      if (!camera) {
        return;
      }
      await getBackgroundBlurSession().ensureReady();
      setBlurEnabled(true);
      blurEnabledRef.current = true;
    } catch {
      setBlurEnabled(false);
      blurEnabledRef.current = false;
      setError(
        isIosDevice()
          ? "Background blur could not start on this iPhone/iPad. Try Safari, keep the page open a few seconds after tapping Blur, then try again. You can still record without blur."
          : "Background blur is not available on this device. You can still record without it.",
      );
    } finally {
      setBlurLoading(false);
    }
  }

  async function startRecording() {
    if (!currentQuestion || actionLockRef.current) {
      return;
    }
    actionLockRef.current = true;

    try {
      setError(null);
      setIsPreparingCamera(true);

      // Prefer an already-live warm preview; only rebuild if tracks died.
      let currentStream = streamRef.current;
      const live =
        currentStream &&
        currentStream.getTracks().length > 0 &&
        currentStream.getTracks().every((t) => t.readyState === "live") &&
        stopDrawRef.current;

      if (!live) {
        currentStream = await refreshPortraitStream();
      }
      setIsPreparingCamera(false);

      if (!currentStream) {
        return;
      }

      const liveTracks = currentStream.getTracks();
      if (
        liveTracks.length === 0 ||
        liveTracks.some((t) => t.readyState === "ended")
      ) {
        setError("Camera stream was disconnected. Tap Start recording again.");
        return;
      }

      // Keep source video playing for the whole recording (face freeze = source paused).
      if (canvasVideoRef.current?.paused) {
        safePlay(canvasVideoRef.current);
      }

      setIsProcessing(false);
      setIsPreviewRequested(false);
      setRecordedBlob(null);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      attachLiveToVideo(currentStream);

      const mimeType = getSupportedVideoMimeType();
      recordingMimeTypeRef.current = mimeType;
      chunksRef.current = [];

      let recorder: MediaRecorder;
      try {
        const recorderOptions: MediaRecorderOptions = {};
        if (mimeType) {
          recorderOptions.mimeType = mimeType;
        }
        if (isAndroidDevice()) {
          recorderOptions.videoBitsPerSecond = ANDROID_VIDEO_BITS_PER_SECOND;
        }
        recorder = new MediaRecorder(currentStream, recorderOptions);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not start recorder: ${err.message}`
            : "Could not start video recorder. Please reload and try again.",
        );
        return;
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError("Recording failed unexpectedly. Please stop and try again.");
        setIsRecording(false);
        setIsProcessing(false);
      };

      recorder.onstop = () => {
        const blobType =
          recordingMimeTypeRef.current || recorder.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });

        setIsProcessing(false);

        if (blob.size === 0) {
          setError(
            "No video was captured. Record for at least a few seconds, then stop.",
          );
          setRecordedBlob(null);
          setPreviewUrl(null);
          return;
        }

        setRecordedDuration(recordingSecondsRef.current);
        setRecordedBlob(blob);
        setIsPreviewRequested(false);
        setPreviewUrl(URL.createObjectURL(blob));
        setStepPhase("review");
      };

      recorderRef.current = recorder;
      try {
        recorder.start(1000);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Failed to start recording: ${err.message}`
            : "Failed to start recording. Please reload and try again.",
        );
        return;
      }
      setIsRecording(true);
    } finally {
      actionLockRef.current = false;
      setIsPreparingCamera(false);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
    setIsRecording(false);
    setIsProcessing(true); // hold UI until onstop fires
  }

  function previewRecording() {
    if (!previewUrl || actionLockRef.current) return;
    setIsPreviewRequested(true);
    const video = videoRef.current;
    if (!video) return;
    if (video.getAttribute("src") !== previewUrl) {
      attachPreviewToVideo(previewUrl, true);
      return;
    }
    try {
      video.currentTime = 0;
    } catch {
      // ignore
    }
    safePlay(video);
  }

  function retake() {
    if (actionLockRef.current || isPreparingCamera) return;
    // Stop any in-progress preview playback, discard clip, return to record.
    // Entering "record" triggers warm-up which rebuilds a fresh live preview.
    const video = videoRef.current;
    if (video) {
      video.pause();
      if (video.src) {
        video.removeAttribute("src");
      }
      video.srcObject = null;
    }
    setRecordedBlob(null);
    setUploadState("idle");
    setError(null);
    setIsProcessing(false);
    setIsPreviewRequested(false);
    setIsPlaying(false);
    setRecordedDuration(0);
    setRecordingSeconds(0);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setStepPhase("record");
  }

  function replayQuestion() {
    setStepPhase("watch");
  }

  async function acceptAnswer() {
    if (!recordedBlob || !currentQuestion) {
      return;
    }

    setUploadState("uploading");
    setError(null);

    try {
      const mimeType = recordedBlob.type || "video/webm";
      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.append("token", token);
      formData.append("questionId", currentQuestion.id);
      formData.append(
        "file",
        new File([recordedBlob], `answer.${extension}`, { type: mimeType }),
      );

      const uploadResponse = await fetch("/api/uploads/file", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed.");
      }

      const uploaded = (await uploadResponse.json()) as {
        key: string;
        mimeType: string;
        sizeBytes: number;
      };

      const finalizeResponse = await fetch("/api/recordings/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          questionId: currentQuestion.id,
          key: uploaded.key,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          ...(recordedDuration > 0
            ? { durationSeconds: recordedDuration }
            : {}),
        }),
      });

      if (!finalizeResponse.ok) {
        throw new Error("Could not save recording.");
      }

      const nextAccepted = new Set(acceptedQuestionIds);
      nextAccepted.add(currentQuestion.id);
      setAcceptedQuestionIds(nextAccepted);
      setUploadState("done");

      // Reset clip state for the next question without jumping to "record"
      // first (that remount race caused a black camera on Q2+).
      setRecordedBlob(null);
      setIsProcessing(false);
      setIsPreviewRequested(false);
      setRecordedDuration(0);
      setRecordingSeconds(0);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      setCurrentIndex(findFirstPendingQuestionIndex(questions, nextAccepted));
      // currentIndex effect sets stepPhase back to "watch".
    } catch (uploadError) {
      setUploadState("error");
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload your answer. Please try again.",
      );
    }
  }

  if (!started) {
    return (
      <section className="relative mx-auto flex min-h-[100dvh] max-w-xl flex-col">
        <div className="flex-1 overflow-y-auto px-6 pb-36 pt-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
            Doctor Live Podcast
          </p>
          {doctor.imageUrl ? (
            <div className="mx-auto mt-6 h-40 w-40 overflow-hidden rounded-full bg-slate-100 ring-2 ring-slate-200 sm:h-44 sm:w-44">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={doctor.name}
                className="h-full w-full object-cover"
                src={doctor.imageUrl}
              />
            </div>
          ) : null}
          <h1 className="mt-6 text-3xl font-bold text-slate-900 sm:text-4xl">
            Welcome, {doctor.name}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            {hasPartialProgress
              ? `You already submitted ${initialAccepted.size} of ${questions.length} answers. Continue from question ${currentIndex + 1} — only pending questions remain.`
              : "You will hear each podcast question, then record your answer on video. You can replay and retake before submitting."}
          </p>

          <div className="mx-auto mt-6 w-full max-w-lg text-left">
            <p className="mb-2 text-center text-[11px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
              Reference video
            </p>
            <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm sm:rounded-2xl">
              <video
                className="aspect-video w-full object-cover"
                controls
                playsInline
                preload="metadata"
                src={REFERENCE_VIDEO_SRC}
              />
            </div>
            <p className="mt-2 text-center text-xs leading-5 text-slate-500">
              Watch this sample first, then start your interview recording.
            </p>
          </div>

          {hasPartialProgress ? (
            <p className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              Your previous answers are saved. If the connection dropped, tap below
              to resume where you left off.
            </p>
          ) : null}
          {!isSecureContext ? (
            <MobileCameraHelp hostname={window.location.hostname} token={token} />
          ) : null}
          {error ? (
            <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="interview-footer-safe fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <button
            className="relative z-50 inline-flex w-full min-h-[52px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-4 text-lg font-semibold text-white hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isStarting}
            onClick={(event) => {
              event.preventDefault();
              void startInterview();
            }}
            type="button"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Opening camera…
              </>
            ) : hasPartialProgress ? (
              "Continue interview"
            ) : (
              "Start interview"
            )}
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">
            Tap the button above. Allow camera and microphone when asked.
          </p>
        </div>
      </section>
    );
  }

  if (isComplete) {
    return (
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
        <h1 className="mt-6 text-3xl font-bold text-slate-900">Interview complete</h1>
        <p className="mt-4 text-slate-600">
          Thank you. Your video answers were submitted successfully for review.
        </p>
      </section>
    );
  }

  const portraitFrameClass =
    "relative mx-auto w-full max-w-[min(100%,22rem)] sm:max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-lg";
  const landscapeFrameClass =
    "relative mx-auto w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm sm:rounded-2xl";
  const showCameraPlaceholder =
    stepPhase === "record" &&
    !isRecording &&
    !isProcessing &&
    (isPreparingCamera ||
      !stream ||
      stream.getTracks().some((track) => track.readyState !== "live"));

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-3 pb-[calc(9rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:pt-6">
      <header className="mb-4 sm:mb-5">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <h1 className="mt-1 truncate text-xl font-bold text-slate-900 sm:text-2xl">
              {currentQuestion.title}
            </h1>
          </div>
          <div className="w-20 shrink-0 rounded-full bg-slate-200 p-1 sm:w-32">
            <div
              className="h-2 rounded-full bg-slate-900 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="mt-3 flex gap-1.5 sm:mt-4 sm:gap-2">
          {(["watch", "record", "review"] as StepPhase[]).map((phase, index) => {
            const labels = ["Watch", "Record", "Review"];
            const isActive = stepPhase === phase;
            const isDone =
              (phase === "watch" && (stepPhase === "record" || stepPhase === "review")) ||
              (phase === "record" && stepPhase === "review");
            return (
              <div
                className={`flex-1 rounded-full px-1.5 py-1.5 text-center text-[10px] font-semibold sm:px-2 sm:text-xs ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : isDone
                      ? "bg-slate-200 text-slate-700"
                      : "bg-slate-100 text-slate-500"
                }`}
                key={phase}
              >
                {index + 1}. {labels[index]}
              </div>
            );
          })}
        </div>
      </header>

      <section className="flex-1">
        {stepPhase === "watch" ? (
          <div className="space-y-4 sm:space-y-5">
            <div className={landscapeFrameClass}>
              <video
                className="aspect-video w-full object-cover"
                controls
                playsInline
                preload="auto"
                src={getQuestionVideoSrc(currentQuestion)}
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Question</p>
              <p className="mt-2 text-sm leading-6 text-slate-700 sm:text-base sm:leading-7">
                {currentQuestion.prompt}
              </p>
            </div>
          </div>
        ) : null}

        {stepPhase === "record" || stepPhase === "review" ? (
          <div className={portraitFrameClass}>
            {/* Keep <video> mounted so retake/preview never lose the element ref. */}
            <video
              autoPlay
              className="aspect-[9/16] w-full bg-black object-cover"
              playsInline
              ref={videoRef}
            />

            {showCameraPlaceholder ? (
              <div className="absolute inset-0 flex aspect-[9/16] w-full items-center justify-center bg-slate-900/95 p-6 text-center text-slate-200">
                <p className="max-w-[16rem] text-sm leading-6">
                  {isPreparingCamera ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting camera…
                    </span>
                  ) : (
                    <>
                      Position yourself in frame. Tap{" "}
                      <span className="font-semibold text-white">Start recording</span>{" "}
                      when you are ready.
                    </>
                  )}
                </p>
              </div>
            ) : null}

            {isRecording ? (
              <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white sm:left-4 sm:top-4">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                {formatSeconds(recordingSeconds)}
              </div>
            ) : null}

            {stepPhase === "record" && stream && !isProcessing && !isPreparingCamera ? (
              <button
                aria-label={blurEnabled ? "Turn off background blur" : "Blur background"}
                aria-pressed={blurEnabled}
                className={`absolute right-3 top-3 inline-flex touch-manipulation items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition sm:right-4 sm:top-4 ${
                  blurEnabled
                    ? "bg-slate-900/95 ring-2 ring-white/40"
                    : "bg-black/55 hover:bg-black/70"
                }`}
                disabled={blurLoading}
                onClick={() => void toggleBlurBackground()}
                type="button"
              >
                {blurLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Aperture className="h-3.5 w-3.5" />
                )}
                {blurLoading ? "Preparing…" : blurEnabled ? "Blur on" : "Blur"}
              </button>
            ) : null}

            {stepPhase === "review" && previewUrl && recordedDuration > 0 ? (
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white sm:left-4 sm:top-4">
                <Timer className="h-3 w-3" />
                {formatSeconds(recordedDuration)}
              </div>
            ) : null}

            {stepPhase === "review" && previewUrl && !isProcessing ? (
              <button
                aria-label={isPlaying ? "Pause" : "Play preview"}
                className="absolute inset-0 flex items-center justify-center bg-black/10"
                onClick={() => {
                  if (!isPreviewRequested) {
                    previewRecording();
                    return;
                  }
                  const video = videoRef.current;
                  if (!video) return;
                  if (video.paused) {
                    void video.play();
                  } else {
                    video.pause();
                  }
                }}
                type="button"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm sm:h-16 sm:w-16">
                  {isPlaying ? (
                    <Pause className="h-6 w-6 text-white sm:h-7 sm:w-7" />
                  ) : (
                    <Play className="h-6 w-6 translate-x-0.5 text-white sm:h-7 sm:w-7" />
                  )}
                </span>
              </button>
            ) : null}

            {isProcessing ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
                <span className="ml-2 text-sm text-white">Processing…</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {stepPhase === "review" && recordedBlob && !isProcessing ? (
          <p className="mt-3 text-center text-sm text-slate-500 sm:mt-4">
            Preview your answer, retake if needed, then accept to continue.
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-700 sm:mt-4">
            {error}
          </p>
        ) : null}
      </section>

      <div className="interview-footer-safe fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4 sm:py-4">
        <div className="mx-auto flex max-w-lg flex-col gap-2.5 sm:gap-3">
          {stepPhase === "watch" ? (
            <button
              className="w-full min-h-[52px] touch-manipulation rounded-xl bg-slate-900 px-6 py-3.5 text-base font-semibold text-white hover:bg-slate-800 active:scale-[0.98] sm:py-4 sm:text-lg"
              onClick={() => setStepPhase("record")}
              type="button"
            >
              Record your answer
            </button>
          ) : null}

          {stepPhase === "record" && !isRecording && !isProcessing && !recordedBlob ? (
            <>
              <button
                className="inline-flex w-full min-h-[52px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-base font-semibold text-white hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:py-4 sm:text-lg"
                disabled={isPreparingCamera}
                onClick={() => void startRecording()}
                type="button"
              >
                {isPreparingCamera ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Starting camera…
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5" />
                    Start recording
                  </>
                )}
              </button>
              <button
                className="min-h-[40px] touch-manipulation text-sm font-medium text-slate-500 hover:text-slate-800"
                onClick={replayQuestion}
                type="button"
              >
                Replay question video
              </button>
            </>
          ) : null}

          {stepPhase === "record" && isRecording ? (
            <button
              className="w-full min-h-[52px] touch-manipulation rounded-xl bg-rose-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-rose-500 active:scale-[0.98] sm:py-4 sm:text-lg"
              onClick={stopRecording}
              type="button"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <CircleStop className="h-5 w-5" />
                Stop recording
              </span>
            </button>
          ) : null}

          {stepPhase === "review" && recordedBlob && !isProcessing ? (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <button
                  className="inline-flex min-h-[48px] touch-manipulation items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50 sm:px-4"
                  disabled={uploadState === "uploading"}
                  onClick={previewRecording}
                  type="button"
                >
                  <Play className="h-4 w-4 shrink-0" />
                  Preview
                </button>
                <button
                  className="inline-flex min-h-[48px] touch-manipulation items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50 sm:px-4"
                  disabled={uploadState === "uploading" || isPreparingCamera}
                  onClick={retake}
                  type="button"
                >
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  Retake
                </button>
              </div>
              <button
                className="inline-flex w-full min-h-[52px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:py-4 sm:text-lg"
                disabled={uploadState === "uploading"}
                onClick={() => void acceptAnswer()}
                type="button"
              >
                {uploadState === "uploading" ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Uploading…
                  </>
                ) : currentIndex + 1 < questions.length ? (
                  "Accept & next"
                ) : (
                  "Accept & finish"
                )}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
