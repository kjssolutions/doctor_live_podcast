"use client";

import { Download } from "lucide-react";

export function DownloadFlyerButton({
  doctorId,
  ready,
}: {
  doctorId: number;
  ready: boolean;
}) {
  const downloadUrl = `/api/flyers/file?doctorId=${doctorId}&download=1`;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        className="inline-flex w-[11rem] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!ready}
        onClick={() => {
          if (ready) {
            window.location.href = downloadUrl;
          }
        }}
        title={
          ready
            ? "Download podcast flyer"
            : "Flyer will be available after admin publishes the Spotify link"
        }
        type="button"
      >
        <Download className="h-4 w-4" />
        Download flyer
      </button>
      {!ready ? (
        <p className="max-w-[11rem] text-xs text-slate-500">
          Pending Spotify publish
        </p>
      ) : null}
    </div>
  );
}
