"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";

export function RecordingDeleteButton({
  recordingId,
  doctorLabel,
  questionLabel,
}: {
  recordingId: string;
  doctorLabel: string;
  questionLabel: string;
}) {
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
      const response = await fetch("/api/admin/recordings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId }),
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
          : "Could not delete recording.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <button
        aria-label={`Delete ${questionLabel} for ${doctorLabel}`}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-center text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
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
        onCancel={() => {
          if (!isDeleting) {
            setOpen(false);
          }
        }}
        onConfirm={() => void confirmDelete()}
        open={open}
        title="Delete answer recording?"
      >
        <p>
          This will permanently remove{" "}
          <span className="font-semibold text-slate-100">{questionLabel}</span> for{" "}
          <span className="font-semibold text-slate-100">{doctorLabel}</span> from
          the database and DigitalOcean storage.
        </p>
        <p className="text-slate-400">
          The doctor can use the same interview link to record and submit this
          question again.
        </p>
      </ConfirmDialog>
    </>
  );
}
