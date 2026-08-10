import { CreateDoctorForm } from "@/components/create-doctor-form";
import { authOptions } from "@/lib/auth";
import { canCreateDoctor } from "@/lib/doctor-access";
import { ArrowLeft } from "lucide-react";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

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

      <CreateDoctorForm />
    </div>
  );
}
