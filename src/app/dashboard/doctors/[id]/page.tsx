import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CopyLinkButton } from "@/components/copy-link-button";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSignedDownloadUrl } from "@/lib/spaces";
import { absoluteUrlFromRequest } from "@/lib/utils";

export default async function DoctorReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  const requestHeaders = await headers();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const doctorId = Number(id);

  if (Number.isNaN(doctorId)) {
    notFound();
  }

  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      interviewToken: { not: null },
      ...(session.user.role === "ADMIN"
        ? {}
        : { createdByEmployeeId: session.user.id }),
    },
    include: {
      recordings: {
        include: {
          asset: true,
          question: true,
        },
        orderBy: [{ question: { order: "asc" } }, { attemptNumber: "desc" }],
      },
    },
  });

  if (!doctor || !doctor.interviewToken) {
    notFound();
  }

  const recordingDownloads = await Promise.all(
    doctor.recordings.map(async (recording) => ({
      recording,
      downloadUrl: await createSignedDownloadUrl(recording.asset.key),
    })),
  );

  const interviewUrl = absoluteUrlFromRequest(
    `/interview/${doctor.interviewToken}`,
    requestHeaders,
  );
  const doctorImageUrl = doctor.imageUrl
    ? await createSignedDownloadUrl(doctor.imageUrl)
    : null;

  return (
    <div className="space-y-6">
      <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/dashboard">
        Back to dashboard
      </Link>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-4">
            {doctorImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={doctor.doctorName ?? doctor.doctorCode}
                className="h-24 w-24 rounded-2xl object-cover"
                src={doctorImageUrl}
              />
            ) : null}
            <div>
              <p className="text-sm font-medium text-cyan-300">Doctor review</p>
              <h1 className="mt-2 text-3xl font-bold">
                {doctor.doctorName ?? doctor.doctorCode}
              </h1>
              <p className="mt-2 text-slate-400">
                {doctor.doctorCode} · {doctor.specialty ?? "Specialty not provided"}
              </p>
            </div>
          </div>
          <CopyLinkButton url={interviewUrl} />
        </div>
        <div className="mt-6 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-slate-500">Status</p>
            <p className="mt-1 font-semibold">
              {(doctor.interviewStatus ?? "SENT").replace("_", " ")}
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-slate-500">Recordings</p>
            <p className="mt-1 font-semibold">{doctor.recordings.length}</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-slate-500">Completed</p>
            <p className="mt-1 font-semibold">
              {doctor.completedAt
                ? doctor.completedAt.toLocaleString()
                : "Not complete"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-semibold">Submitted video answers</h2>
        </div>
        {recordingDownloads.length === 0 ? (
          <p className="px-6 py-10 text-center text-slate-400">
            The doctor has not submitted any accepted recordings yet.
          </p>
        ) : (
          <div className="divide-y divide-white/10">
            {recordingDownloads.map(({ recording, downloadUrl }) => (
              <article
                className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_auto]"
                key={recording.id}
              >
                <div>
                  <p className="font-semibold">
                    Q{recording.question.order}. {recording.question.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Attempt {recording.attemptNumber} ·{" "}
                    {(recording.asset.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <a
                  className="rounded-full bg-cyan-400 px-4 py-2 text-center text-sm font-semibold text-slate-950 hover:bg-cyan-300"
                  href={downloadUrl}
                >
                  Download clip
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
