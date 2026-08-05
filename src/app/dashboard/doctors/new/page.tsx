import { createDoctorInterview } from "@/app/dashboard/actions";
import { DoctorPhotoCropper } from "@/components/doctor-photo-cropper";
import { SubmitButton } from "@/components/ui/submit-button";
import { authOptions } from "@/lib/auth";
import { canCreateDoctor } from "@/lib/doctor-access";
import { ArrowLeft, Camera, Link2, UserRound } from "lucide-react";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

const inputClassName =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#1a3a32]/40 focus:ring-4 focus:ring-[#1a3a32]/10";

const labelClassName = "text-sm font-semibold text-slate-700";

export default async function NewDoctorPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!canCreateDoctor(session.user)) redirect("/dashboard");

  return (
    <div className="relative mx-auto max-w-4xl space-y-5 sm:space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 -z-10 h-56 rounded-[2rem] bg-[radial-gradient(ellipse_80%_70%_at_20%_0%,rgba(26,58,50,0.08),transparent_55%),radial-gradient(ellipse_60%_50%_at_100%_20%,rgba(35,79,68,0.06),transparent_50%)]"
      />

      <div>
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-medium text-slate-500 transition hover:bg-white/80 hover:text-slate-800"
          href="/dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Create Doctor
        </h1>
      </div>

      <form action={createDoctorInterview} className="space-y-5 sm:space-y-6">
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
                  className={inputClassName}
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
                <input
                  className={inputClassName}
                  id="specialty"
                  name="specialty"
                  placeholder="Cardiologist"
                  required
                />
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
    </div>
  );
}
