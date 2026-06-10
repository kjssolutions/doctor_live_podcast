"use client";

import { Download, Play, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export function RecordingModalPlayer({
  title,
  fileUrl,
  downloadUrl,
  variant = "default",
}: {
  title: string;
  fileUrl: string;
  downloadUrl: string;
  variant?: "default" | "light";
}) {
  const isLight = variant === "light";
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    // Focus the close button for accessibility.
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      // Stop playback when closing.
      videoRef.current?.pause();
      return;
    }

    // Autoplay when opening; user still has controls.
    void videoRef.current?.play().catch(() => {});
  }, [open]);

  return (
    <>
      <button
        className={
          isLight
            ? "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            : "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-center text-sm font-semibold text-slate-100 hover:bg-white/10"
        }
        onClick={() => setOpen(true)}
        type="button"
      >
        <Play className="h-4 w-4" />
        Play
      </button>

      {open ? (
        <div
          aria-labelledby={dialogId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          onMouseDown={(event) => {
            // Close only when clicking the backdrop, not the modal content.
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div
            className={
              isLight
                ? "w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                : "w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl"
            }
          >
            <header
              className={
                isLight
                  ? "flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"
                  : "flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4"
              }
            >
              <h3
                className={`truncate text-sm font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}
                id={dialogId}
              >
                {title}
              </h3>
              <div className="flex items-center gap-2">
                <a
                  className={
                    isLight
                      ? "inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      : "inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
                  }
                  href={downloadUrl}
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
                <button
                  aria-label="Close"
                  className={
                    isLight
                      ? "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      : "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                  }
                  onClick={() => setOpen(false)}
                  ref={closeButtonRef}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="bg-black">
              <video
                className="max-h-[75vh] w-full"
                controls
                playsInline
                ref={videoRef}
                src={fileUrl}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

