"use client";

import { MobileCameraHelp } from "@/app/interview/[token]/mobile-camera-help";
import { describeCameraBlocker } from "@/lib/camera-access";
import { CheckCircle2, CircleStop, Loader2, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const PORTRAIT_WIDTH = 1080;
const PORTRAIT_HEIGHT = 1920;

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
};

type UploadState = "idle" | "uploading" | "done" | "error";
type StepPhase = "watch" | "record" | "review";

function getQuestionVideoSrc(question: Question) {
  if (question.avatarVideoUrl) {
    return question.avatarVideoUrl;
  }
  return `/Videos/question${question.order}.mp4`;
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
  const recordingSecondsRef = useRef(0);
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
  // Stable ref so the unmount-only cleanup can stop tracks without stream in deps.
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  function stopPortraitPipeline() {
    if (canvasAnimationRef.current !== null) {
      cancelAnimationFrame(canvasAnimationRef.current);
      canvasAnimationRef.current = null;
    }
    canvasVideoRef.current?.pause();
    canvasVideoRef.current = null;
    captureStreamRef.current?.getTracks().forEach((track) => track.stop());
    captureStreamRef.current = null;
  }

  async function createPortraitRecordingStream(
    sourceStream: MediaStream,
  ): Promise<MediaStream> {
    const sourceVideo = document.createElement("video");
    sourceVideo.srcObject = sourceStream;
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    sourceVideo.autoplay = true;
    canvasVideoRef.current = sourceVideo;

    try {
      await sourceVideo.play();
    } catch {
      // play() may fail before metadata is ready; drawing loop below still retries.
    }

    const canvas = document.createElement("canvas");
    canvas.width = PORTRAIT_WIDTH;
    canvas.height = PORTRAIT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not prepare portrait recorder.");
    }

    const drawFrame = () => {
      const sourceWidth = sourceVideo.videoWidth || 1280;
      const sourceHeight = sourceVideo.videoHeight || 720;
      const scale = Math.max(
        PORTRAIT_WIDTH / sourceWidth,
        PORTRAIT_HEIGHT / sourceHeight,
      );
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const offsetX = (PORTRAIT_WIDTH - drawWidth) / 2;
      const offsetY = (PORTRAIT_HEIGHT - drawHeight) / 2;

      ctx.clearRect(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
      // Mirror frames before encoding so stored video keeps selfie orientation.
      ctx.save();
      ctx.translate(PORTRAIT_WIDTH, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sourceVideo, offsetX, offsetY, drawWidth, drawHeight);
      ctx.restore();
      canvasAnimationRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    const portraitStream = canvas.captureStream(30);
    const audioTrack = sourceStream.getAudioTracks()[0];
    if (audioTrack) {
      portraitStream.addTrack(audioTrack);
    }

    captureStreamRef.current = portraitStream;
    return portraitStream;
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

  // Drive the single video element: recorded clip takes priority over live feed.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    if (previewUrl) {
      // Show the recorded clip paused until the user taps Preview.
      video.srcObject = null;
      video.src = previewUrl;
      video.muted = false;
      video.load();
      if (isPreviewRequested) {
        void video.play().catch(() => {
          // Overlay play button allows manual play if autoplay is blocked.
        });
      } else {
        video.pause();
      }
    } else if (stream) {
      // Show the live camera.
      video.pause();
      video.removeAttribute("src");
      video.srcObject = stream;
      video.muted = true;
      void video.play().catch(() => {
        // Autoplay may need a user gesture; recording still works.
      });
    }

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [stream, previewUrl, isPreviewRequested]);

  // Stop camera tracks ONLY on unmount — never during retake or question changes.
  useEffect(() => {
    return () => {
      stopPortraitPipeline();
      rawStreamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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

  async function ensureCameraStream() {
    const activeTracks = stream?.getTracks() ?? [];
    if (
      stream &&
      activeTracks.length > 0 &&
      activeTracks.every((track) => track.readyState === "live")
    ) {
      return stream;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 9 / 16 },
        },
        audio: true,
      });
      rawStreamRef.current?.getTracks().forEach((track) => track.stop());
      rawStreamRef.current = mediaStream;
      stopPortraitPipeline();
      const portraitStream = await createPortraitRecordingStream(mediaStream);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setStream(portraitStream);
      return portraitStream;
    } catch (cause) {
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

  async function startRecording() {
    if (!currentQuestion) {
      return;
    }

    setIsPreparingCamera(true);
    const currentStream = await ensureCameraStream();
    setIsPreparingCamera(false);
    if (!currentStream) {
      return;
    }

    const liveTracks = currentStream.getTracks();
    if (liveTracks.length === 0 || liveTracks.some((t) => t.readyState === "ended")) {
      setError("Camera stream was disconnected. Please reload the page and try again.");
      return;
    }

    setError(null);
    setIsProcessing(false);
    setIsPreviewRequested(false);
    setRecordedBlob(null);

    // Revoke any previous clip URL and clear the video src so we return to live.
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      // Switch the element back to live immediately (effect won't run until after render).
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        void video.play().catch(() => {});
      }
    }

    const mimeType = getSupportedVideoMimeType();
    recordingMimeTypeRef.current = mimeType;
    chunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(currentStream, mimeType ? { mimeType } : undefined);
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
        setError("No video was captured. Record for at least a few seconds, then stop.");
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
    setIsPreviewRequested(true);
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      void video.play().catch(() => {});
    }
  }

  function retake() {
    // Do not stop the stream — just discard the recorded clip.
    setRecordedBlob(null);
    setUploadState("idle");
    setError(null);
    setIsProcessing(false);
    setIsPreviewRequested(false);
    setRecordedDuration(0);
    setRecordingSeconds(0);
    setStepPhase("record");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      // Switch the video element back to live immediately.
      const video = videoRef.current;
      if (video && stream) {
        video.srcObject = stream;
        video.muted = true;
        void video.play().catch(() => {});
      }
    }
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
      retake();

      setCurrentIndex(findFirstPendingQuestionIndex(questions, nextAccepted));
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
          <h1 className="mt-6 text-3xl font-bold text-slate-900 sm:text-4xl">
            Welcome, {doctor.name}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            {hasPartialProgress
              ? `You already submitted ${initialAccepted.size} of ${questions.length} answers. Continue from question ${currentIndex + 1} — only pending questions remain.`
              : "You will hear each podcast question, then record your answer on video. You can replay and retake before submitting."}
          </p>
          {hasPartialProgress ? (
            <p className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              Your previous answers are saved. If the connection dropped, tap below
              to resume where you left off.
            </p>
          ) : null}
          {doctor.specialty ? (
            <p className="mt-2 text-sm text-slate-500">{doctor.specialty}</p>
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
    "relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-lg";

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 pb-36 pt-6">
      <header className="mb-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              {currentQuestion.title}
            </h1>
          </div>
          <div className="w-24 shrink-0 rounded-full bg-slate-200 p-1 sm:w-32">
            <div
              className="h-2 rounded-full bg-slate-900 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          {(["watch", "record", "review"] as StepPhase[]).map((phase, index) => {
            const labels = ["Watch", "Record", "Review"];
            const isActive = stepPhase === phase;
            const isDone =
              (phase === "watch" && (stepPhase === "record" || stepPhase === "review")) ||
              (phase === "record" && stepPhase === "review");
            return (
              <div
                className={`flex-1 rounded-full px-2 py-1.5 text-center text-[11px] font-semibold sm:text-xs ${
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
          <div className="space-y-5">
            <div className={portraitFrameClass}>
              <video
                className="aspect-[9/16] w-full bg-black object-contain"
                controls
                playsInline
                preload="auto"
                src={getQuestionVideoSrc(currentQuestion)}
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Question</p>
              <p className="mt-2 text-base leading-7 text-slate-700">
                {currentQuestion.prompt}
              </p>
            </div>
          </div>
        ) : null}

        {stepPhase === "record" || stepPhase === "review" ? (
          <div className={portraitFrameClass}>
            {stepPhase === "record" &&
            !stream &&
            !previewUrl &&
            !isProcessing &&
            !isRecording ? (
              <div className="flex aspect-[9/16] w-full items-center justify-center bg-slate-900 p-8 text-center text-slate-200">
                <p className="max-w-[16rem] text-sm leading-6">
                  Position yourself in frame. Tap{" "}
                  <span className="font-semibold text-white">Start recording</span>{" "}
                  when you are ready.
                </p>
              </div>
            ) : (
              <video
                autoPlay
                className="aspect-[9/16] w-full bg-black object-cover"
                playsInline
                ref={videoRef}
              />
            )}

            {isRecording ? (
              <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                {formatSeconds(recordingSeconds)}
              </div>
            ) : null}

            {stepPhase === "review" && previewUrl && recordedDuration > 0 ? (
              <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
                <Timer className="h-3 w-3" />
                {formatSeconds(recordedDuration)}
              </div>
            ) : null}

            {stepPhase === "review" && previewUrl && !isProcessing && isPreviewRequested ? (
              <button
                aria-label={isPlaying ? "Pause" : "Play"}
                className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 focus:opacity-100"
                onClick={() => {
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
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                  {isPlaying ? (
                    <Pause className="h-7 w-7 text-white" />
                  ) : (
                    <Play className="h-7 w-7 translate-x-0.5 text-white" />
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
          <p className="mt-4 text-center text-sm text-slate-500">
            Preview your answer, retake if needed, then accept to continue.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </section>

      <div className="interview-footer-safe fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-3">
          {stepPhase === "watch" ? (
            <button
              className="w-full min-h-[52px] touch-manipulation rounded-xl bg-slate-900 px-6 py-4 text-lg font-semibold text-white hover:bg-slate-800 active:scale-[0.98]"
              onClick={() => setStepPhase("record")}
              type="button"
            >
              Record your answer
            </button>
          ) : null}

          {stepPhase === "record" && !isRecording && !isProcessing && !recordedBlob ? (
            <>
              <button
                className="inline-flex w-full min-h-[52px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-4 text-lg font-semibold text-white hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
                className="text-sm font-medium text-slate-500 hover:text-slate-800"
                onClick={replayQuestion}
                type="button"
              >
                Replay question video
              </button>
            </>
          ) : null}

          {stepPhase === "record" && isRecording ? (
            <button
              className="w-full min-h-[52px] touch-manipulation rounded-xl bg-rose-600 px-6 py-4 text-lg font-semibold text-white hover:bg-rose-500 active:scale-[0.98]"
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
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={previewRecording}
                  type="button"
                >
                  <Play className="h-4 w-4" />
                  Preview
                </button>
                <button
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={retake}
                  type="button"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retake
                </button>
              </div>
              <button
                className="inline-flex w-full min-h-[52px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-lg font-semibold text-white hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
                  "Accept and next question"
                ) : (
                  "Accept and finish"
                )}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
