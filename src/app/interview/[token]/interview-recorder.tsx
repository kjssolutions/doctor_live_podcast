"use client";

import { MobileCameraHelp } from "@/app/interview/[token]/mobile-camera-help";
import { describeCameraBlocker } from "@/lib/camera-access";
import { CheckCircle2, CircleStop, Play, RotateCcw, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSecureContext] = useState(() => window.isSecureContext);
  const [acceptedQuestionIds, setAcceptedQuestionIds] = useState(
    () => new Set(completedQuestionIds),
  );
  const previewRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const currentQuestion = questions[currentIndex];
  const isComplete = acceptedQuestionIds.size >= questions.length;
  const progress = useMemo(
    () => Math.round((acceptedQuestionIds.size / questions.length) * 100),
    [acceptedQuestionIds.size, questions.length],
  );

  useEffect(() => {
    if (previewRef.current && stream && !previewUrl) {
      previewRef.current.srcObject = stream;
    }
  }, [stream, previewUrl]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, stream]);

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
      const name =
        cause instanceof DOMException ? cause.name : "";
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

    setError(null);
    setRecordedBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    const mimeType = getSupportedVideoMimeType();

    chunksRef.current = [];
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeType || recorder.mimeType || "video/webm",
      });
      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    };
    recorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
  }

  function retake() {
    setRecordedBlob(null);
    setUploadState("idle");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  async function acceptAnswer() {
    if (!recordedBlob || !currentQuestion) {
      return;
    }

    setUploadState("uploading");
    setError(null);

    try {
      const signResponse = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          questionId: currentQuestion.id,
          mimeType: recordedBlob.type || "video/webm",
          sizeBytes: recordedBlob.size,
        }),
      });

      if (!signResponse.ok) {
        throw new Error("Could not prepare upload.");
      }

      const signedUpload = (await signResponse.json()) as {
        key: string;
        uploadUrl: string;
        headers: Record<string, string>;
      };

      const uploadResponse = await fetch(signedUpload.uploadUrl, {
        method: "PUT",
        headers: signedUpload.headers,
        body: recordedBlob,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed.");
      }

      const finalizeResponse = await fetch("/api/recordings/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          questionId: currentQuestion.id,
          key: signedUpload.key,
          mimeType: recordedBlob.type || "video/webm",
          sizeBytes: recordedBlob.size,
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

      const nextIndex = questions.findIndex((question, index) => {
        return index > currentIndex && !nextAccepted.has(question.id);
      });
      if (nextIndex >= 0) {
        setCurrentIndex(nextIndex);
      }
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
            You will hear each podcast question, then record your answer on video.
            You can replay and retake before submitting.
          </p>
          {doctor.specialty ? (
            <p className="mt-2 text-sm text-slate-500">{doctor.specialty}</p>
          ) : null}
          {!isSecureContext ? (
            <MobileCameraHelp
              hostname={window.location.hostname}
              token={token}
            />
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
            {isStarting ? "Opening camera…" : "Start interview"}
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

          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black">
            {previewUrl ? (
              <video
                className="aspect-[9/16] max-h-[58vh] w-full object-cover"
                controls
                playsInline
                src={previewUrl}
              />
            ) : (
              <video
                autoPlay
                className="aspect-[9/16] max-h-[58vh] w-full object-cover"
                muted
                playsInline
                ref={previewRef}
              />
            )}
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {!isRecording && !recordedBlob ? (
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
            {recordedBlob ? (
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
                  onClick={acceptAnswer}
                  type="button"
                >
                  {uploadState === "uploading" ? "Uploading..." : "Accept and continue"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
