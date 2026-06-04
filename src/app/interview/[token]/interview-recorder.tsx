"use client";

import { MobileCameraHelp } from "@/app/interview/[token]/mobile-camera-help";
import { describeCameraBlocker } from "@/lib/camera-access";
import { CheckCircle2, CircleStop, Loader2, Pause, Play, RotateCcw, Timer, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

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
  const [isSecureContext] = useState(() => window.isSecureContext);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const recordingSecondsRef = useRef(0);
  const [acceptedQuestionIds, setAcceptedQuestionIds] =
    useState(initialAccepted);

  // Single video element for both live camera and recorded playback.
  // We swap between srcObject (live) and src (recorded) imperatively so React
  // never unmounts/remounts the element — that prevented playback from working.
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingMimeTypeRef = useRef("");
  // Stable ref so the unmount-only cleanup can stop tracks without stream in deps.
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

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
      // Show the recorded clip.
      video.srcObject = null;
      video.src = previewUrl;
      video.muted = false;
      video.load();
      void video.play().catch(() => {
        // Controls allow manual play if autoplay is blocked.
      });
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
  }, [stream, previewUrl]);

  // Stop camera tracks ONLY on unmount — never during retake or question changes.
  useEffect(() => {
    return () => {
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
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: true,
      });
      setStream(mediaStream);
      setStarted(true);
      await fetch(`/api/interviews/${token}/start`, { method: "POST" });
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Please allow camera and microphone access in your browser settings, then tap Start again.",
        );
      } else if (name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError(
          "Could not start camera. Use HTTPS on mobile or check browser permissions.",
        );
      }
    } finally {
      setIsStarting(false);
    }
  }

  function startRecording() {
    if (!stream || !currentQuestion) {
      return;
    }

    const liveTracks = stream.getTracks();
    if (liveTracks.length === 0 || liveTracks.some((t) => t.readyState === "ended")) {
      setError("Camera stream was disconnected. Please reload the page and try again.");
      return;
    }

    setError(null);
    setIsProcessing(false);
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
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
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
      setPreviewUrl(URL.createObjectURL(blob));
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

  function retake() {
    // Do not stop the stream — just discard the recorded clip.
    setRecordedBlob(null);
    setUploadState("idle");
    setError(null);
    setIsProcessing(false);
    setRecordedDuration(0);
    setRecordingSeconds(0);

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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Doctor Live Podcast
          </p>
          <h1 className="mt-6 text-3xl font-bold sm:text-4xl">
            Welcome, {doctor.name}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            {hasPartialProgress
              ? `You already submitted ${initialAccepted.size} of ${questions.length} answers. Continue from question ${currentIndex + 1} — only pending questions remain.`
              : "You will hear each podcast question, then record your answer on video. You can replay and retake before submitting."}
          </p>
          {hasPartialProgress ? (
            <p className="mt-3 rounded-xl bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
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
            <p className="mt-6 rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
        </div>

        <div className="interview-footer-safe fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/95 px-6 py-4 backdrop-blur">
          <button
            className="relative z-50 w-full min-h-[52px] touch-manipulation rounded-2xl bg-cyan-400 px-6 py-4 text-lg font-semibold text-slate-950 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isStarting}
            onClick={(event) => {
              event.preventDefault();
              void startInterview();
            }}
            type="button"
          >
            {isStarting
              ? "Opening camera…"
              : hasPartialProgress
                ? "Continue interview"
                : "Start interview"}
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
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-300" />
        <h1 className="mt-6 text-4xl font-bold">Interview complete</h1>
        <p className="mt-4 text-slate-300">
          Thank you. Your video answers were submitted successfully for review.
        </p>
      </section>
    );
  }

  // showLive kept for the controls layout but we no longer flip the video —
  // mirroring was confusing (left hand appeared on right side).
  const showLive = !previewUrl && !isProcessing;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-cyan-300">
            Question {currentIndex + 1} of {questions.length}
          </p>
          <h1 className="text-xl font-semibold">{currentQuestion.title}</h1>
        </div>
        <div className="w-32 rounded-full bg-white/10 p-1">
          <div
            className="h-2 rounded-full bg-cyan-400"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1fr]">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900">
          {currentQuestion.avatarVideoUrl ? (
            <video
              className="aspect-[9/16] w-full object-cover"
              controls
              playsInline
              src={currentQuestion.avatarVideoUrl}
            />
          ) : (
            <div className="flex aspect-[9/16] flex-col items-center justify-center bg-gradient-to-b from-cyan-400 to-blue-700 p-8 text-center text-slate-950">
              <Video className="h-14 w-14" />
              <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em]">
                AI Avatar Prompt
              </p>
              <p className="mt-4 text-2xl font-bold">{currentQuestion.title}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-medium text-cyan-300">Question text</p>
            <p className="mt-3 text-xl leading-8">{currentQuestion.prompt}</p>
          </div>

          {/* Single video element — swapped between live (srcObject) and
              recorded (src) imperatively, never unmounted.
              Flipped horizontally so left hand always appears on the left. */}
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black">
            <video
              autoPlay
              className="aspect-[9/16] max-h-[58vh] w-full scale-x-[-1] object-cover"
              playsInline
              ref={videoRef}
            />

            {/* Recording timer — top-left */}
            {isRecording ? (
              <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                {formatSeconds(recordingSeconds)}
              </div>
            ) : null}

            {/* Recorded duration badge — top-left, shown when clip is ready */}
            {previewUrl && recordedDuration > 0 ? (
              <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
                <Timer className="h-3 w-3" />
                {formatSeconds(recordedDuration)}
              </div>
            ) : null}

            {/* Play / Pause overlay — only on recorded clip, centred */}
            {previewUrl && !isProcessing ? (
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

          {recordedBlob && !isRecording && !isProcessing ? (
            <p className="text-sm text-slate-400">
              Preview your answer above. Retake if needed, or accept to continue.
            </p>
          ) : null}

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {!isRecording && !isProcessing && !recordedBlob ? (
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300"
                onClick={startRecording}
                type="button"
              >
                <Play className="h-4 w-4" />
                Start recording
              </button>
            ) : null}

            {isRecording ? (
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-400 px-5 py-3 font-semibold text-slate-950 hover:bg-rose-300"
                onClick={stopRecording}
                type="button"
              >
                <CircleStop className="h-4 w-4" />
                Stop recording
              </button>
            ) : null}

            {recordedBlob && !isProcessing ? (
              <>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 font-semibold hover:bg-white/10"
                  onClick={retake}
                  type="button"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retake
                </button>
                <button
                  className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                  disabled={uploadState === "uploading"}
                  onClick={() => void acceptAnswer()}
                  type="button"
                >
                  {uploadState === "uploading" ? "Uploading…" : "Accept and continue"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
