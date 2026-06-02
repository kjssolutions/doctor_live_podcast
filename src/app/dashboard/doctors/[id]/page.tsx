import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CopyLinkButton } from "@/components/copy-link-button";
import { RecordingModalPlayer } from "@/components/recording-modal-player";
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
      createdBy: true,
      recordings: {
        include: { asset: true, question: true },
        orderBy: [{ question: { order: "asc" } }, { attemptNumber: "desc" }],
      },
      editedVideo: { include: { asset: true } },
    },
  });

  if (!doctor || !doctor.interviewToken) {
    notFound();
  }

  // Latest accepted attempt per question
  const latestByQuestion = new Map<string, (typeof doctor.recordings)[number]>();
  for (const r of doctor.recordings) {
    const prev = latestByQuestion.get(r.questionId);
    if (!prev || r.attemptNumber > prev.attemptNumber) {
      latestByQuestion.set(r.questionId, r);
    }
  }
  const latestRecordings = Array.from(latestByQuestion.values()).sort(
    (a, b) => (a.question.order ?? 0) - (b.question.order ?? 0),
  );

  const interviewUrl = absoluteUrlFromRequest(
    `/interview/${doctor.interviewToken}`,
    requestHeaders,
  );
  const doctorImageUrl = doctor.imageUrl
    ? await createSignedDownloadUrl(doctor.imageUrl)
    : null;

  // Fixed 4 question slots
  const Q_COUNT = 4;
  const questionSlots = Array.from({ length: Q_COUNT }, (_, i) => {
    const rec = latestRecordings.find((r) => r.question.order === i + 1) ?? null;
    return rec;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/dashboard">
          ← Back to dashboard
        </Link>
        <CopyLinkButton url={interviewUrl} />
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-4">
          <h1 className="text-xl font-bold">
            {doctor.doctorName ?? doctor.doctorCode}
          </h1>
          <p className="mt-1 text-sm text-slate-400">Doctor review — all details</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1100px" }}>
            {/* ─── Header ─── */}
            <thead className="bg-white/5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr className="[&>th]:px-4 [&>th]:py-3">
                <th>MR Name</th>
                <th>MR ID</th>
                <th>Doctor</th>
                <th>Code</th>
                <th>Specialty</th>
                <th>Interview Status</th>
                <th>Post-production Status</th>
                <th>Q1 Video</th>
                <th>Q2 Video</th>
                <th>Q3 Video</th>
                <th>Q4 Video</th>
                <th>Spotify link</th>
              </tr>
            </thead>

            {/* ─── Single data row ─── */}
            <tbody>
              <tr className="[&>td]:px-4 [&>td]:py-4 align-top">
                {/* MR Name */}
                <td className="whitespace-nowrap font-medium text-slate-200">
                  {doctor.createdBy?.empName ?? "—"}
                </td>

                {/* MR ID */}
                <td className="whitespace-nowrap text-slate-400">
                  {doctor.createdByEmployeeId ?? "—"}
                </td>

                {/* Doctor name + image */}
                <td className="min-w-[180px]">
                  <div className="flex items-center gap-3">
                    {doctorImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={doctor.doctorName ?? doctor.doctorCode}
                        className="h-10 w-10 shrink-0 rounded-xl object-cover"
                        src={doctorImageUrl}
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-slate-300">
                        {(doctor.doctorName ?? doctor.doctorCode).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold text-slate-100">
                      {doctor.doctorName ?? doctor.doctorCode}
                    </span>
                  </div>
                </td>

                {/* Doctor code */}
                <td className="whitespace-nowrap text-slate-400">{doctor.doctorCode}</td>

                {/* Specialty */}
                <td className="whitespace-nowrap text-slate-400">
                  {doctor.specialty ?? "—"}
                </td>

                {/* Status */}
                <td className="whitespace-nowrap">
                  <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                    {(doctor.interviewStatus ?? "SENT").replace("_", " ")}
                  </span>
                </td>

                {/* Post-production status from admin */}
                <td className="whitespace-nowrap">
                  <span className="inline-block rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                    {doctor.postProductionStatus === "PROCESSING"
                      ? "Processing"
                      : doctor.postProductionStatus === "DONE"
                        ? "Done"
                        : "Spotify"}
                  </span>
                </td>

                {/* Q1 – Q4 video cells */}
                {questionSlots.map((rec, idx) => (
                  <td className="min-w-[160px]" key={idx}>
                    {rec ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-slate-400">
                          {rec.question.title.length > 40
                            ? rec.question.title.slice(0, 40) + "…"
                            : rec.question.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          Attempt {rec.attemptNumber} ·{" "}
                          {(rec.asset.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <RecordingModalPlayer
                            downloadUrl={`/api/recordings/file?recordingId=${rec.id}&download=1`}
                            fileUrl={`/api/recordings/file?recordingId=${rec.id}`}
                            title={`Q${rec.question.order}. ${rec.question.title}`}
                          />
                          <a
                            className="rounded-full bg-cyan-400 px-3 py-1.5 text-center text-xs font-semibold text-slate-950 hover:bg-cyan-300"
                            href={`/api/recordings/file?recordingId=${rec.id}&download=1`}
                          >
                            Download
                          </a>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">No recording</span>
                    )}
                  </td>
                ))}

                {/* Spotify link (MR can view) */}
                <td className="min-w-[220px]">
                  {doctor.spotifyUrl ? (
                    <a
                      className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                      href={doctor.spotifyUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open Spotify
                    </a>
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
