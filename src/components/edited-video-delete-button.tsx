"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";

export function EditedVideoDeleteButton({
  doctorId,
  doctorLabel,
  variant = "default",
}: {
  doctorId: number;
  doctorLabel: string;
  variant?: "default" | "light";
}) {
  const isLight = variant === "light";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (isDeleting) {
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch("/api/admin/edited-videos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error || `Delete failed (${response.status}).`);
      }

      setOpen(false);
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete merged video.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <button
        aria-label={`Delete merged video for ${doctorLabel}`}
        className={
          isLight
            ? "inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            : "inline-flex items-center justify-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-center text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
        }
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </button>

      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Delete permanently"
        error={error}
        isLoading={isDeleting}
        loadingLabel="Deleting…"
        onCancel={() => {
          if (!isDeleting) {
            setOpen(false);
          }
        }}
        onConfirm={() => void confirmDelete()}
        open={open}
        title="Delete merged video?"
        variant={variant}
      >
        <p>
          This will permanently remove the merged video for{" "}
          <span className="font-semibold">{doctorLabel}</span> from the database
          and DigitalOcean storage.
        </p>
        <p className={isLight ? "text-slate-500" : "text-slate-400"}>
          Spotify URL and post-production status will be reset. You can upload a new
          merged video afterward.
        </p>
      </ConfirmDialog>
    </>
  );
}
