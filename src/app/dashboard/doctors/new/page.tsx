import { createDoctorInterview } from "@/app/dashboard/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { ArrowLeft, Link2, UserPlus } from "lucide-react";
import Link from "next/link";

const inputClassName =
  "mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none ring-slate-300 placeholder:text-slate-400 focus:ring-2";

const labelClassName = "text-sm font-medium text-slate-700";

export default function NewDoctorPage() {
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-3xl">
        <div>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
            href="/dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
            Create Doctor
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Add doctor details and a profile photo. A secure interview recording
            link will be generated automatically.
          </p>
        </div>
      </div>

      <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-8 flex items-center gap-3 border-b border-slate-100 pb-6">
            <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Doctor details
              </h2>
              <p className="text-sm text-slate-500">
                All fields marked with * are required.
              </p>
            </div>
          </div>

          <form action={createDoctorInterview} className="grid gap-6">
            <div>
              <label className={labelClassName} htmlFor="doctorName">
                Doctor name *
              </label>
              <input
                className={inputClassName}
                id="doctorName"
                name="doctorName"
                placeholder="Dr. Priya Shah"
                required
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
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

            <div>
              <label className={labelClassName} htmlFor="image">
                Doctor photo
              </label>
              <input
                accept="image/png,image/jpeg,image/webp"
                className={`${inputClassName} file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800`}
                id="image"
                name="image"
                type="file"
              />
              <p className="mt-2 text-xs text-slate-400">
                PNG, JPG, or WebP. Used on the dashboard and interview page.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
              <Link
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                href="/dashboard"
              >
                Cancel
              </Link>
              <SubmitButton
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                loadingText="Creating link…"
              >
                <Link2 className="h-4 w-4" />
                Create secure link
              </SubmitButton>
            </div>
          </form>
      </section>
    </div>
  );
}
