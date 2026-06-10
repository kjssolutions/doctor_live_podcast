"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ButtonLoadingContent } from "@/components/ui/button-loading";
import { getVideoDurationFromFile } from "@/lib/video-duration";

export function EditedVideoUpload({
  doctorId,
  variant = "default",
}: {
  doctorId: number;
  variant?: "default" | "light";
}) {
  const isLight = variant === "light";
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (isUploading) {
      return;
    }

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Please choose a video file first.");
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const durationSeconds = await getVideoDurationFromFile(file);

      const formData = new FormData();
      formData.append("doctorId", String(doctorId));
      formData.append("file", file);
      if (durationSeconds) {
        formData.append("durationSeconds", String(durationSeconds));
      }

      const response = await fetch("/api/admin/edited-videos/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        const hint =
          response.status === 500 && !data?.error
            ? " Server may need a restart (stop dev, run npm run dev:clean again)."
            : "";
        throw new Error((data?.error || `Upload failed (${response.status}).`) + hint);
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        accept="video/*"
        className={
          isLight
            ? "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-800"
            : "block w-full text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-white/20"
        }
        ref={inputRef}
        type="file"
      />
      <button
        className={
          isLight
            ? "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        }
        disabled={isUploading}
        onClick={() => void upload()}
        type="button"
      >
        <ButtonLoadingContent loading={isUploading} loadingText="Uploading…">
          Upload merged video
        </ButtonLoadingContent>
      </button>
      {error ? (
        <p className={`text-xs ${isLight ? "text-rose-600" : "text-rose-300"}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

