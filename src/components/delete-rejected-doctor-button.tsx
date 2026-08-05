"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";

import { deleteRejectedDoctor } from "@/app/dashboard/actions";
import { ButtonSpinner } from "@/components/ui/button-loading";

export function DeleteRejectedDoctorButton({
  doctorId,
  show,
}: {
  doctorId: number;
  show: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!show) return null;

  return (
    <button
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this rejected doctor permanently?")) return;
        startTransition(async () => {
          await deleteRejectedDoctor(doctorId);
        });
      }}
      type="button"
    >
      {pending ? (
        <ButtonSpinner className="h-3.5 w-3.5" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      Delete
    </button>
  );
}
