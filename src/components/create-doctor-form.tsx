"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertCircle, Camera, Link2, UserRound } from "lucide-react";

import {
  createDoctorInterview,
  type CreateDoctorState,
} from "@/app/dashboard/actions";
import { DoctorPhotoCropper } from "@/components/doctor-photo-cropper";
import { SubmitButton } from "@/components/ui/submit-button";

const inputClassName =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#1a3a32]/40 focus:ring-4 focus:ring-[#1a3a32]/10";

const labelClassName = "text-sm font-semibold text-slate-700";

const initialState: CreateDoctorState = {};

function ErrorPopup({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  const dialogId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-labelledby={dialogId}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="alertdialog"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="px-5 pt-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3
            className="mt-3 text-base font-semibold text-slate-900"
            id={dialogId}
          >
            Entry already exists
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p>
        </div>
        <div className="px-5 py-4">
          <button
            autoFocus
            className="w-full rounded-xl bg-[#1a3a32] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#234f44]"
            onClick={onClose}
            type="button"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CreateDoctorForm() {
  const [state, formAction] = useActionState(createDoctorInterview, initialState);
  const [showErrorPopup, setShowErrorPopup] = useState(false);

  useEffect(() => {
    if (state.error) {
      setShowErrorPopup(true);
    }
  }, [state]);

  return (
    <>
      {showErrorPopup && state.error ? (
        <ErrorPopup
          message={state.error}
          onClose={() => setShowErrorPopup(false)}
        />
      ) : null}

      <form action={formAction} className="space-y-5 sm:space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-[#1a3a32]/[0.04] to-transparent px-4 py-4 sm:px-6 sm:py-5">
            <div className="rounded-xl bg-[#1a3a32] p-2.5 text-white shadow-sm">
              <UserRound className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
              Doctor details
            </h2>
          </div>

          <div className="grid gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6">
            <div>
              <label className={labelClassName} htmlFor="doctorName">
                Doctor name *
              </label>
              <input
                autoComplete="name"
                className={inputClassName}
                id="doctorName"
                name="doctorName"
                placeholder="Dr. Priya Shah"
                required
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
              <div>
                <label className={labelClassName} htmlFor="doctorCode">
                  Doctor code *
                </label>
                <input
                  aria-invalid={Boolean(state.error)}
                  className={`${inputClassName}${state.error ? " border-rose-300 focus:border-rose-400 focus:ring-rose-100" : ""}`}
                  id="doctorCode"
                  name="doctorCode"
                  placeholder="DOC-1024"
                  required
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="specialty">
                  Specialty *
                </label>
                <select
                  className={inputClassName}
                  defaultValue="Neurologist"
                  id="specialty"
                  name="specialty"
                  required
                >
                  <option value="Neurologist">Neurologist</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-[#1a3a32]/[0.04] to-transparent px-4 py-4 sm:px-6 sm:py-5">
            <div className="rounded-xl bg-[#1a3a32] p-2.5 text-white shadow-sm">
              <Camera className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
              Doctor photo *
            </h2>
          </div>

          <div className="px-4 py-5 sm:px-6 sm:py-6">
            <DoctorPhotoCropper name="image" required />
          </div>
        </section>

        <div className="sticky bottom-3 z-10 rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-[0_12px_40px_-16px_rgba(15,23,42,0.35)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:rounded-2xl sm:border sm:border-slate-200/80 sm:bg-white sm:px-5 sm:py-4 sm:shadow-sm">
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]"
              href="/dashboard"
            >
              Cancel
            </Link>
            <SubmitButton
              className="rounded-xl bg-[#1a3a32] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#234f44] active:scale-[0.99]"
              loadingText="Creating link…"
            >
              <Link2 className="h-4 w-4" />
              Create secure link
            </SubmitButton>
          </div>
        </div>
      </form>
    </>
  );
}
