"use client";

import { useTransition } from "react";

import { approveDoctor, rejectDoctor } from "@/app/dashboard/actions";
import { ButtonSpinner } from "@/components/ui/button-loading";

export function ManagerApproveRejectButtons({
  doctorId,
  show,
}: {
  doctorId: number;
  show: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!show) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await approveDoctor(doctorId);
          });
        }}
        type="button"
      >
        {pending ? <ButtonSpinner className="h-3.5 w-3.5" /> : null}
        Approve
      </button>
      <button
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Reject this doctor entry?")) return;
          startTransition(async () => {
            await rejectDoctor(doctorId);
          });
        }}
        type="button"
      >
        Reject
      </button>
    </div>
  );
}
