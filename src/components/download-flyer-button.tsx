"use client";

import { Download } from "lucide-react";

export function DownloadFlyerButton() {
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        className="inline-flex w-[11rem] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
        onClick={() => {
          // Placeholder — flyer download will be implemented later.
        }}
        type="button"
      >
        <Download className="h-4 w-4" />
        Download flyer
      </button>
    </div>
  );
}
