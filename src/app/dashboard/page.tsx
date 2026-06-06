import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CopyLinkButton } from "@/components/copy-link-button";
import { DownloadFlyerButton } from "@/components/download-flyer-button";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { absoluteUrlFromRequest } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  SENT: "bg-sky-400/10 text-sky-200 ring-sky-400/20",
  OPENED: "bg-amber-400/10 text-amber-200 ring-amber-400/20",
  IN_PROGRESS: "bg-violet-400/10 text-violet-200 ring-violet-400/20",
  COMPLETED: "bg-emerald-400/10 text-emerald-200 ring-emerald-400/20",
  EXPIRED: "bg-rose-400/10 text-rose-200 ring-rose-400/20",
  DRAFT: "bg-slate-400/10 text-slate-200 ring-slate-400/20",
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const requestHeaders = await headers();

  if (!session?.user) {
    redirect("/login");
  }

  const doctors = await prisma.doctor.findMany({
    where: {
      interviewToken: { not: null },
      ...(session.user.role === "ADMIN"
        ? {}
        : { createdByEmployeeId: session.user.id }),
    },
    include: {
      recordings: true,
      flyer: { select: { id: true } },
    },
    orderBy: { podcastCreatedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-300">MR Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold">Doctor interview links</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Podcast links you created (legacy doctor_table rows without a link
            are hidden).
          </p>
        </div>
        <Link
          className="rounded-full bg-cyan-400 px-5 py-3 text-center font-semibold text-slate-950 hover:bg-cyan-300"
          href="/dashboard/doctors/new"
        >
          Create link
        </Link>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-semibold">Created list</h2>
        </div>
        {doctors.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400">
            No podcast links yet. Create a doctor entry to generate a link.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {doctors.map((doctor) => {
              const url = absoluteUrlFromRequest(
                `/interview/${doctor.interviewToken}`,
                requestHeaders,
              );
              const allVideosRecorded = doctor.interviewStatus === "COMPLETED";
              const flyerReady = Boolean(doctor.flyer);
              return (
                <article
                  className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_auto_auto]"
                  key={doctor.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold">
                        {doctor.doctorName ?? doctor.doctorCode}
                      </h3>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                          statusStyles[doctor.interviewStatus ?? "SENT"]
                        }`}
                      >
                        {(doctor.interviewStatus ?? "SENT").replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {doctor.doctorCode} · {doctor.specialty ?? "No specialty"}
                    </p>
                    <p className="mt-2 break-all text-xs text-slate-500">{url}</p>
                  </div>
                  <div className="flex items-center text-sm text-slate-300">
                    {doctor.recordings.length} recordings
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {allVideosRecorded ? (
                      <DownloadFlyerButton doctorId={doctor.id} ready={flyerReady} />
                    ) : (
                      <CopyLinkButton url={url} />
                    )}
                    <Link
                      className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
                      href={`/dashboard/doctors/${doctor.id}`}
                    >
                      Review
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
