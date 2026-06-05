"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isLoading = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    cancelButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) {
        onCancel();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isLoading, onCancel]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div
      aria-labelledby={dialogId}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="alertdialog"
      onMouseDown={(event) => {
        if (!isLoading && event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <header className="border-b border-white/10 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-100" id={dialogId}>
            {title}
          </h3>
        </header>

        <div className="space-y-3 px-5 py-4 text-sm text-slate-300">{children}</div>

        {error ? (
          <p className="px-5 pb-2 text-sm text-rose-300">{error}</p>
        ) : null}

        <footer className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-60"
            disabled={isLoading}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-60"
            disabled={isLoading}
            onClick={onConfirm}
            type="button"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
