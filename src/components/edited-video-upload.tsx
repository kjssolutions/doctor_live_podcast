"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { getVideoDurationFromFile } from "@/lib/video-duration";

export function EditedVideoUpload({ doctorId }: { doctorId: number }) {
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
        className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-white/20"
        ref={inputRef}
        type="file"
      />
      <button
        className="w-full rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
        disabled={isUploading}
        onClick={() => void upload()}
        type="button"
      >
        {isUploading ? "Uploading…" : "Upload merged video"}
      </button>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

