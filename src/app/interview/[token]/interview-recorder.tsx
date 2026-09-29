"use client";

import { MobileCameraHelp } from "@/app/interview/[token]/mobile-camera-help";
import {
  disposeBackgroundBlurSession,
  getBackgroundBlurSession,
  isAndroidDevice,
  isIosDevice,
} from "@/lib/background-blur";
import { describeCameraBlocker } from "@/lib/camera-access";
import { getQuestionVideoSrc } from "@/lib/question-videos";
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
/** capture = live question + doctor camera; review = doctor answer preview */
type StepPhase = "capture" | "review";

function findFirstPendingQuestionIndex(
  questions: Question[],
  accepted: Set<string>,
) {
  const index = questions.findIndex((q) => !accepted.has(q.id));
  return index >= 0 ? index : 0;
}

function getSupportedVideoMimeType() {
  const options = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
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
  const [stepPhase, setStepPhase] = useState<StepPhase>("capture");
  /** Bumped by Retake so capture can restart even when already on "capture". */
  const [captureRestartKey, setCaptureRestartKey] = useState(0);
  /** True while the question video is auto-playing (once per question). */
  const [questionPlaying, setQuestionPlaying] = useState(true);
  const [questionNeedsTap, setQuestionNeedsTap] = useState(false);

  // Single video element for both live camera and recorded playback.
  // We swap between srcObject (live) and src (recorded) imperatively so React
  // never unmounts/remounts the element — that prevented playback from working.
  const videoRef = useRef<HTMLVideoElement>(null);
  const questionVideoRef = useRef<HTMLVideoElement>(null);
  const questionEndedHandledRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingMimeTypeRef = useRef("");
  const rawStreamRef = useRef<MediaStream | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const canvasVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasAnimationRef = useRef<number | null>(null);
  const stopDrawRef = useRef<(() => void) | null>(null);
  const pendingRecordStreamRef = useRef<MediaStream | null>(null);
  /** Audio track actually sent to MediaRecorder (mic clone on the canvas stream). */
  const recordingAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  /** Bumps on every camera refresh so overlapping async rebuilds don't clobber each other. */
  const cameraGenRef = useRef(0);
  /** Bumps when a capture session should be abandoned (stop / question change). */
  const captureGenRef = useRef(0);
  /** After Stop, do not auto-restart capture until Retake or next question. */
  const userStoppedRef = useRef(false);
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

  function setAnswerMicEnabled(enabled: boolean) {
    const tracks = new Set<MediaStreamTrack>();
    if (recordingAudioTrackRef.current) {
      tracks.add(recordingAudioTrackRef.current);
    }
    captureStreamRef.current?.getAudioTracks().forEach((track) => tracks.add(track));
    rawStreamRef.current?.getAudioTracks().forEach((track) => tracks.add(track));
    streamRef.current?.getAudioTracks().forEach((track) => tracks.add(track));
    tracks.forEach((track) => {
      if (track.readyState === "live") {
        track.enabled = enabled;
      }
    });
  }

  function ensureDoctorMicLive(media: MediaStream | null | undefined) {
    media?.getAudioTracks().forEach((track) => {
      if (track.readyState === "live") {
        track.enabled = true;
      }
    });
    setAnswerMicEnabled(true);
  }

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

  /** Bottom UI shows doctor camera; the canvas stream records doctor only. */
  function attachDoctorLivePreview() {
    const raw = rawStreamRef.current;
    if (raw) {
      attachLiveToVideo(raw);
      return;
    }
    if (streamRef.current) {
      attachLiveToVideo(streamRef.current);
    }
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

    const portraitStream = canvas.captureStream(CAPTURE_FPS);
    const canvasTrack = portraitStream.getVideoTracks()[0] as MediaStreamTrack & {
      requestFrame?: () => void;
    };
    const audioTrack = sourceStream.getAudioTracks()[0];
    if (audioTrack && audioTrack.readyState === "live") {
      audioTrack.enabled = true;
      const cloned = audioTrack.clone();
      cloned.enabled = true;
      portraitStream.addTrack(cloned);
    }

    const drawFrame = (now: number) => {
      if (stopped) return;
      rafId = requestAnimationFrame(drawFrame);
      if (now - lastDrawMs < frameIntervalMs) {
        return;
      }
      lastDrawMs = now;
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
      canvasTrack.requestFrame?.();
    };

    rafId = requestAnimationFrame(drawFrame);

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

  function discardActiveRecorder() {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }
    // Detach handlers so a late onstop cannot open Review with a stale blob.
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
  }

  // Reset per-question state when moving to another question.
  useEffect(() => {
    captureGenRef.current += 1;
    userStoppedRef.current = false;
    discardActiveRecorder();
    chunksRef.current = [];
    pendingRecordStreamRef.current = null;
    setStepPhase("capture");
    setQuestionPlaying(true);
    setQuestionNeedsTap(false);
    questionEndedHandledRef.current = false;
    setRecordedBlob(null);
    setUploadState("idle");
    setError(null);
    setIsProcessing(false);
    setIsRecording(false);
    setIsPreviewRequested(false);
    setRecordedDuration(0);
    setRecordingSeconds(0);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive doctor preview / review playback on the single video element.
  useEffect(() => {
    if (stepPhase !== "capture" && stepPhase !== "review") {
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
      if (video.getAttribute("src") !== previewUrl) {
        attachPreviewToVideo(previewUrl, false);
      }
      if (isPreviewRequested && video.paused) {
        safePlay(video);
      }
    } else if (stepPhase === "capture" && !isRecording && !isProcessing) {
      attachDoctorLivePreview();
    }

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [stream, previewUrl, isPreviewRequested, stepPhase, isRecording, isProcessing]);

  // Stop camera tracks ONLY on unmount — never during retake or question changes.
  useEffect(() => {
    return () => {
      cameraGenRef.current += 1;
      captureGenRef.current += 1;
      stopPortraitPipeline();
      disposeBackgroundBlurSession();
      stopTracks(rawStreamRef.current);
      rawStreamRef.current = null;
      stopTracks(streamRef.current);
    };
  }, []);

  // Each question: start doctor recording, play question on the live top screen.
  // Do NOT depend on isProcessing / recordedBlob — Stop used to flip those and
  // restart recording forever (felt like Stop / Preview / Next were broken).
  useEffect(() => {
    if (!started || stepPhase !== "capture") {
      return;
    }
    if (userStoppedRef.current) {
      return;
    }

    const gen = ++captureGenRef.current;
    let cancelled = false;

    const isStale = () =>
      cancelled || gen !== captureGenRef.current || userStoppedRef.current;

    void (async () => {
      setError(null);
      setIsPreparingCamera(true);
      questionEndedHandledRef.current = false;

      const next = await refreshPortraitStream();
      if (isStale()) {
        setIsPreparingCamera(false);
        return;
      }

      if (!next) {
        setIsPreparingCamera(false);
        return;
      }

      attachDoctorLivePreview();
      pendingRecordStreamRef.current = next;
      setIsPreparingCamera(false);

      // Start doctor-only recording as soon as the question begins (video + mic).
      const startedOk = await beginDoctorRecording(next);
      if (isStale() || !startedOk) return;

      const qVideo = questionVideoRef.current;
      if (!qVideo || !currentQuestion) {
        return;
      }

      const src = getQuestionVideoSrc(currentQuestion.order);
      if (qVideo.getAttribute("src") !== src) {
        qVideo.src = src;
      }
      try {
        qVideo.currentTime = 0;
      } catch {
        // ignore
      }

      setQuestionPlaying(true);
      setQuestionNeedsTap(false);
      try {
        await qVideo.play();
      } catch {
        if (!isStale()) {
          setQuestionNeedsTap(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [started, stepPhase, currentIndex, captureRestartKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function onQuestionVideoEnded() {
    if (questionEndedHandledRef.current) {
      return;
    }
    questionEndedHandledRef.current = true;
    setQuestionPlaying(false);
    setQuestionNeedsTap(false);
    // Keep doctor mic live for the answer portion.
    ensureDoctorMicLive(rawStreamRef.current);
    ensureDoctorMicLive(captureStreamRef.current);
    const video = questionVideoRef.current;
    if (video) {
      try {
        video.pause();
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = Math.max(0, video.duration - 0.08);
        }
      } catch {
        // Keep the last question frame on the live top screen.
      }
    }
  }

  async function playQuestionFromTap() {
    const video = questionVideoRef.current;
    if (!video) return;
    setQuestionNeedsTap(false);
    questionEndedHandledRef.current = false;

    const current =
      pendingRecordStreamRef.current ??
      captureStreamRef.current ??
      streamRef.current;
    if (current && !recorderRef.current && !userStoppedRef.current) {
      const startedOk = await beginDoctorRecording(current);
      if (!startedOk) return;
    }

    try {
      await video.play();
    } catch {
      setQuestionNeedsTap(true);
      return;
    }
    setQuestionPlaying(true);
  }

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
          audio: {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
          },
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

  async function beginDoctorRecording(currentStream: MediaStream) {
    if (actionLockRef.current || recorderRef.current) {
      return false;
    }
    if (userStoppedRef.current) {
      return false;
    }
    actionLockRef.current = true;

    try {
      setError(null);

      const liveTracks = currentStream.getTracks();
      if (
        liveTracks.length === 0 ||
        liveTracks.some((t) => t.readyState === "ended")
      ) {
        setError("Camera stream was disconnected. Please reload and try again.");
        return false;
      }

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

      attachDoctorLivePreview();

      // Prefer a fresh clone of the live mic so voice is always in the file.
      const rawMic =
        rawStreamRef.current?.getAudioTracks().find((t) => t.readyState === "live") ??
        null;
      if (rawMic) {
        rawMic.enabled = true;
      }
      const streamMic =
        currentStream.getAudioTracks().find((t) => t.readyState === "live") ??
        captureStreamRef.current
          ?.getAudioTracks()
          .find((t) => t.readyState === "live") ??
        null;

      let audioTrack: MediaStreamTrack | null = null;
      if (rawMic) {
        audioTrack = rawMic.clone();
        audioTrack.enabled = true;
      } else if (streamMic) {
        streamMic.enabled = true;
        audioTrack = streamMic;
      }

      recordingAudioTrackRef.current = audioTrack;
      if (!audioTrack) {
        setError(
          "Microphone is not available. Allow mic access and tap Record again.",
        );
        return false;
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      if (userStoppedRef.current) {
        return false;
      }

      const mimeType = getSupportedVideoMimeType();
      recordingMimeTypeRef.current = mimeType;
      chunksRef.current = [];

      // Doctor screen only (canvas video) + doctor mic (always on).
      const recordStream = new MediaStream();
      const videoTrack = currentStream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== "live") {
        setError("Camera stream was disconnected. Please reload and try again.");
        return false;
      }
      recordStream.addTrack(videoTrack);
      recordStream.addTrack(audioTrack);

      let recorder: MediaRecorder;
      try {
        const recorderOptions: MediaRecorderOptions = {};
        if (mimeType) {
          recorderOptions.mimeType = mimeType;
        }
        if (isAndroidDevice()) {
          recorderOptions.videoBitsPerSecond = ANDROID_VIDEO_BITS_PER_SECOND;
        }
        recorder = new MediaRecorder(recordStream, recorderOptions);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not start recorder: ${err.message}`
            : "Could not start video recorder. Please reload and try again.",
        );
        return false;
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        recorderRef.current = null;
        userStoppedRef.current = true;
        setError("Recording failed unexpectedly. Please try again.");
        setIsRecording(false);
        setIsProcessing(false);
      };

      recorder.onstop = () => {
        recorderRef.current = null;
        finalizeRecordingFromChunks(recorder.mimeType);
      };

      recorderRef.current = recorder;
      try {
        recorder.start(250);
      } catch (err) {
        recorderRef.current = null;
        setError(
          err instanceof Error
            ? `Failed to start recording: ${err.message}`
            : "Failed to start recording. Please reload and try again.",
        );
        return false;
      }

      setIsRecording(true);
      ensureDoctorMicLive(rawStreamRef.current);
      ensureDoctorMicLive(recordStream);
      return true;
    } finally {
      actionLockRef.current = false;
    }
  }

  function finalizeRecordingFromChunks(recorderMimeType?: string) {
    const blobType =
      recordingMimeTypeRef.current || recorderMimeType || "video/webm";
    const blob = new Blob(chunksRef.current, { type: blobType });

    setIsRecording(false);
    setIsProcessing(false);

    if (blob.size === 0) {
      setError(
        "No video was captured. Keep answering for a few seconds, then tap Stop again (or Retake).",
      );
      setRecordedBlob(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      return;
    }

    setRecordedDuration(recordingSecondsRef.current);
    setRecordedBlob(blob);
    setIsPreviewRequested(false);
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setStepPhase("review");
    setError(null);
    setAnswerMicEnabled(true);
  }

  function stopRecording() {
    // Block session effect from auto-starting again after Stop.
    userStoppedRef.current = true;
    captureGenRef.current += 1;

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsRecording(false);
      if (chunksRef.current.length > 0) {
        finalizeRecordingFromChunks();
        return;
      }
      setIsProcessing(false);
      setError("Recording was not active. Tap Retake to record again.");
      return;
    }

    setIsRecording(false);
    setIsProcessing(true);

    try {
      if (recorder.state === "recording") {
        recorder.requestData();
      }
    } catch {
      // ignore
    }

    try {
      recorder.stop();
    } catch {
      recorderRef.current = null;
      if (chunksRef.current.length > 0) {
        finalizeRecordingFromChunks();
      } else {
        setIsProcessing(false);
        setError("Could not stop recording. Please tap Retake and try again.");
      }
    }
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
    discardActiveRecorder();
    userStoppedRef.current = false;
    chunksRef.current = [];
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
    setIsRecording(false);
    setIsPreviewRequested(false);
    setIsPlaying(false);
    setRecordedDuration(0);
    setRecordingSeconds(0);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    questionEndedHandledRef.current = false;
    setQuestionNeedsTap(false);
    setQuestionPlaying(true);
    setStepPhase("capture");
    setCaptureRestartKey((key) => key + 1);
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
      // currentIndex effect resets to capture + question auto-play.
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
              : "You will see the question on top and yourself on the bottom. Recording starts with the question and saves only your screen and voice. Stop when you finish, then preview."}
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

  const splitPaneClass =
    "relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-black shadow-sm";
  const showCameraPlaceholder =
    stepPhase === "capture" &&
    !isRecording &&
    !isProcessing &&
    (isPreparingCamera ||
      !stream ||
      stream.getTracks().some((track) => track.readyState !== "live"));

  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-lg flex-col px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pt-4">
      <header className="mb-2 shrink-0 sm:mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-500 uppercase sm:text-xs">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <h1 className="mt-0.5 truncate text-lg font-bold text-slate-900 sm:text-xl">
              {currentQuestion.title}
            </h1>
          </div>
          <div className="w-16 shrink-0 rounded-full bg-slate-200 p-1 sm:w-28">
            <div
              className="h-2 rounded-full bg-slate-900 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="mt-2 flex gap-1.5 sm:gap-2">
          {(["capture", "review"] as StepPhase[]).map((phase, index) => {
            const labels = ["Record", "Review"];
            const isActive = stepPhase === phase;
            const isDone = phase === "capture" && stepPhase === "review";
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

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        {stepPhase === "capture" ? (
          <div className={`${splitPaneClass} flex-[1_1_50%]`}>
            <video
              className="h-full w-full bg-black object-contain object-top"
              muted={false}
              onEnded={onQuestionVideoEnded}
              playsInline
              preload="auto"
              ref={questionVideoRef}
              src={getQuestionVideoSrc(currentQuestion.order)}
            />
            <div className="absolute top-2 left-2 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white uppercase">
              Question
            </div>
            {questionPlaying ? (
              <div className="absolute right-2 bottom-2 rounded-full bg-sky-600/90 px-2.5 py-1 text-[10px] font-semibold text-white">
                Playing…
              </div>
            ) : (
              <div className="absolute right-2 bottom-2 rounded-full bg-slate-700/90 px-2.5 py-1 text-[10px] font-semibold text-white">
                Question done
              </div>
            )}
            {questionNeedsTap ? (
              <button
                className="absolute inset-0 flex items-center justify-center bg-black/45"
                onClick={playQuestionFromTap}
                type="button"
              >
                <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900">
                  Tap to play question
                </span>
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Doctor live camera (capture) / answer preview (review) */}
        <div
          className={`${splitPaneClass} ${
            stepPhase === "review"
              ? "mx-auto w-full max-w-sm flex-[1_1_auto]"
              : "flex-[1_1_50%]"
          }`}
        >
          <video
            autoPlay
            className={`w-full bg-black ${
              stepPhase === "review"
                ? "aspect-[9/16] h-auto object-contain"
                : "h-full object-cover"
            }`}
            muted={false}
            playsInline
            ref={videoRef}
          />

          {stepPhase === "review" ? (
            <div className="absolute top-2 right-2 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white uppercase">
              Your answer
            </div>
          ) : null}

          {stepPhase === "capture" ? (
            <div className="absolute top-2 left-2 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white uppercase">
              Your answer
            </div>
          ) : null}

          {showCameraPlaceholder ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-4 text-center text-slate-200">
              <p className="max-w-[14rem] text-xs leading-5 sm:text-sm">
                {isPreparingCamera ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting camera…
                  </span>
                ) : (
                  "Position yourself — only your answer is recorded."
                )}
              </p>
            </div>
          ) : null}

          {isRecording ? (
            <div className="absolute top-2 right-2 inline-flex items-center gap-2 rounded-full bg-rose-500/90 px-2.5 py-1 text-[11px] font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              REC {formatSeconds(recordingSeconds)}
            </div>
          ) : null}

          {stepPhase === "capture" &&
          stream &&
          !isProcessing &&
          !isPreparingCamera ? (
            <button
              aria-label={
                blurEnabled ? "Turn off background blur" : "Blur background"
              }
              aria-pressed={blurEnabled}
              className={`absolute bottom-2 right-2 inline-flex touch-manipulation items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white transition ${
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
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
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
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                {isPlaying ? (
                  <Pause className="h-6 w-6 text-white" />
                ) : (
                  <Play className="h-6 w-6 translate-x-0.5 text-white" />
                )}
              </span>
            </button>
          ) : null}

          {isProcessing ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-7 w-7 animate-spin text-white" />
              <span className="ml-2 text-sm text-white">Processing…</span>
            </div>
          ) : null}
        </div>

        {stepPhase === "capture" ? (
          <p className="shrink-0 text-center text-[11px] leading-4 text-slate-500 sm:text-xs">
            {isPreparingCamera
              ? "Starting camera…"
              : questionPlaying
                ? "Recording your screen + voice. Watch the question on top."
                : isRecording
                  ? "Speak your answer, then tap Stop."
                  : "Preparing…"}
          </p>
        ) : null}

        {stepPhase === "review" && recordedBlob && !isProcessing ? (
          <p className="shrink-0 text-center text-sm text-slate-500">
            Preview is your answer only. Retake if needed, then accept.
          </p>
        ) : null}

        {error ? (
          <p className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </section>

      <div className="interview-footer-safe fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4 sm:py-4">
        <div className="mx-auto flex max-w-lg flex-col gap-2.5 sm:gap-3">
          {stepPhase === "capture" && isPreparingCamera ? (
            <p className="inline-flex items-center justify-center gap-2 py-2 text-center text-sm font-medium text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting your answer recording…
            </p>
          ) : null}

          {stepPhase === "capture" && isRecording ? (
            <button
              className="w-full min-h-[52px] touch-manipulation rounded-xl bg-rose-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-rose-500 active:scale-[0.98]"
              onClick={stopRecording}
              type="button"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <CircleStop className="h-5 w-5" />
                Stop recording
              </span>
            </button>
          ) : null}

          {stepPhase === "capture" &&
          !isRecording &&
          !isPreparingCamera &&
          !isProcessing &&
          error ? (
            <button
              className="inline-flex w-full min-h-[52px] touch-manipulation items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
              onClick={retake}
              type="button"
            >
              <RotateCcw className="h-5 w-5" />
              Record again
            </button>
          ) : null}

          {stepPhase === "review" && recordedBlob && !isProcessing ? (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <button
                  className="inline-flex min-h-[48px] touch-manipulation items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
                  disabled={uploadState === "uploading"}
                  onClick={previewRecording}
                  type="button"
                >
                  <Play className="h-4 w-4 shrink-0" />
                  Preview
                </button>
                <button
                  className="inline-flex min-h-[48px] touch-manipulation items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
                  disabled={uploadState === "uploading" || isPreparingCamera}
                  onClick={retake}
                  type="button"
                >
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  Retake
                </button>
              </div>
              <button
                className="inline-flex w-full min-h-[52px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
