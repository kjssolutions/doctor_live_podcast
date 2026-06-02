import Link from "next/link";

import { createDoctorInterview } from "@/app/dashboard/actions";

export default function NewDoctorPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/dashboard">
        Back to dashboard
      </Link>
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <p className="text-sm font-medium text-cyan-300">Create doctor link</p>
        <h1 className="mt-2 text-3xl font-bold">Doctor details</h1>
        <p className="mt-2 text-slate-400">
          Fill doctor details and upload a photo. A secure interview link is
          saved in the doctor table.
        </p>

        <form
          action={createDoctorInterview}
          className="mt-8 grid gap-5"
          encType="multipart/form-data"
        >
          <div>
            <label className="text-sm font-medium" htmlFor="doctorName">
              Doctor name
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none ring-cyan-400/30 focus:ring-4"
              id="doctorName"
              name="doctorName"
              placeholder="Dr. Priya Shah"
              required
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="doctorCode">
                Doctor code
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none ring-cyan-400/30 focus:ring-4"
                id="doctorCode"
                name="doctorCode"
                placeholder="DOC-1024"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="specialty">
                Specialty
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none ring-cyan-400/30 focus:ring-4"
                id="specialty"
                name="specialty"
                placeholder="Cardiologist"
                required
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="image">
              Doctor image
            </label>
            <input
              accept="image/png,image/jpeg,image/webp"
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:font-semibold file:text-slate-950"
              id="image"
              name="image"
              type="file"
            />
          </div>
          <button
            className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300"
            type="submit"
          >
            Create secure link
          </button>
        </form>
      </section>
    </div>
  );
}
