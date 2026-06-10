"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { ButtonLoadingContent } from "@/components/ui/button-loading";

export function DownloadFlyerButton({
  doctorId,
  ready,
  interviewCompleted = true,
  variant = "default",
}: {
  doctorId: number;
  ready: boolean;
  interviewCompleted?: boolean;
  variant?: "default" | "dashboard";
}) {
  const [downloading, setDownloading] = useState(false);

  const buttonClassName =
    variant === "dashboard"
      ? "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      : "inline-flex w-[11rem] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";
  const downloadUrl = `/api/flyers/file?doctorId=${doctorId}&download=1`;
  const canDownload = interviewCompleted && ready;
  const helperText = !interviewCompleted
    ? "Complete all recordings first"
    : !ready
      ? "Pending Spotify publish"
      : null;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        className={buttonClassName}
        disabled={!canDownload || downloading}
        onClick={() => {
          if (!canDownload || downloading) {
            return;
          }

          setDownloading(true);
          window.location.href = downloadUrl;
          window.setTimeout(() => setDownloading(false), 4000);
        }}
        title={
          canDownload
            ? "Download podcast flyer"
            : helperText ?? "Flyer not available yet"
        }
        type="button"
      >
        <ButtonLoadingContent loading={downloading} loadingText="Downloading…">
          <>
            <Download className="h-4 w-4" />
            Download flyer
          </>
        </ButtonLoadingContent>
      </button>
      {helperText ? (
        <p className="max-w-full text-xs text-slate-500 sm:max-w-[11rem]">{helperText}</p>
      ) : null}
    </div>
  );
}
