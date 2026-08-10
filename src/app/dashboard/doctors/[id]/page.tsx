import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, User } from "lucide-react";

import { CopyLinkButton } from "@/components/copy-link-button";
import { DownloadFlyerButton } from "@/components/download-flyer-button";
import { RecordingModalPlayer } from "@/components/recording-modal-player";
import { authOptions } from "@/lib/auth";
import {
  canViewAnswers,
  doctorByIdWhere,
} from "@/lib/doctor-access";
import {
  formatInterviewStatus,
  interviewStatusBadgeClass,
} from "@/lib/interview-status";
import {
  formatPostProductionStatus,
  getDisplayPostProductionStatus,
} from "@/lib/post-production";
import { prisma } from "@/lib/prisma";
import { normalizeStorageUrlForDb } from "@/lib/spaces";
import { absoluteUrlFromRequest } from "@/lib/utils";

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
        {label}
      </p>
      <div className="mt-1 text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

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

  if (!canViewAnswers(session.user)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const doctorId = Number(id);

  if (Number.isNaN(doctorId)) {
    notFound();
  }

  const doctor = await prisma.doctor.findFirst({
    where: {
      interviewToken: { not: null },
      ...doctorByIdWhere(session.user, doctorId),
    },
    include: {
      createdBy: true,
      flyer: { select: { id: true } },
      recordings: {
        include: { asset: true, question: true },
        orderBy: [{ question: { order: "asc" } }, { attemptNumber: "desc" }],
      },
    },
  });

  if (!doctor || !doctor.interviewToken) {
    notFound();
  }

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
    ? normalizeStorageUrlForDb(doctor.imageUrl)
    : null;

  const Q_COUNT = 4;
  const questionSlots = Array.from({ length: Q_COUNT }, (_, i) => {
    return latestRecordings.find((r) => r.question.order === i + 1) ?? null;
  });

  const displayPostProductionStatus = getDisplayPostProductionStatus(
    doctor.postProductionStatus,
    doctor.spotifyUrl,
  );

  const interviewCompleted = doctor.interviewStatus === "COMPLETED";
  const doctorLabel = doctor.doctorName ?? doctor.doctorCode;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
          href="/dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <CopyLinkButton url={interviewUrl} variant="light" />
          <DownloadFlyerButton
            doctorId={doctor.id}
            interviewCompleted={interviewCompleted}
            ready={Boolean(doctor.flyer)}
            variant="dashboard"
          />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
              {doctorImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={doctorLabel}
                  className="h-full w-full object-cover"
                  src={doctorImageUrl}
                />
              ) : (
                <User className="h-7 w-7 text-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                  #{doctor.id}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${interviewStatusBadgeClass(doctor.interviewStatus)}`}
                >
                  {formatInterviewStatus(doctor.interviewStatus)}
                </span>
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                  {formatPostProductionStatus(displayPostProductionStatus)}
                </span>
              </div>
              <h1 className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {doctorLabel}
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {doctor.doctorCode}
                {doctor.specialty ? ` · ${doctor.specialty}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-100 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <DetailItem label="MR name">
            {doctor.createdBy?.empName ?? "—"}
          </DetailItem>
          <DetailItem label="MR ID">
            {doctor.createdByEmployeeId ?? "—"}
          </DetailItem>
          <DetailItem label="Area">
            {doctor.region ?? doctor.empHeadquarters ?? "—"}
          </DetailItem>
          <DetailItem label="Doctor code">{doctor.doctorCode}</DetailItem>
        </div>

        <div className="px-4 py-5 sm:px-6">
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Interview recordings
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {questionSlots.map((rec, idx) => (
              <div
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5"
                key={idx}
              >
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Q{idx + 1}
                </p>
                {rec ? (
                  <>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {rec.question.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Attempt {rec.attemptNumber} ·{" "}
                      {(rec.asset.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <RecordingModalPlayer
                        downloadUrl={`/api/recordings/file?recordingId=${rec.id}&download=1`}
                        fileUrl={`/api/recordings/file?recordingId=${rec.id}`}
                        title={`Q${rec.question.order}. ${rec.question.title}`}
                        variant="light"
                      />
                      <a
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        href={`/api/recordings/file?recordingId=${rec.id}&download=1`}
                      >
                        Download
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-400 italic">No recording yet</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
