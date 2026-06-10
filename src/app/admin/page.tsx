import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clapperboard, Music2, Video } from "lucide-react";

import {
  AdminDoctorsPanel,
  type AdminDoctorRow,
} from "@/components/admin-doctors-panel";
import { authOptions } from "@/lib/auth";
import { getDisplayPostProductionStatus } from "@/lib/post-production";
import { prisma } from "@/lib/prisma";

function groupLatestByQuestion(
  recordings: Array<{
    id: string;
    questionId: string;
    attemptNumber: number;
    question: { order: number; title: string };
  }>,
) {
  const latest = new Map<string, (typeof recordings)[number]>();
  for (const recording of recordings) {
    const existing = latest.get(recording.questionId);
    if (!existing || recording.attemptNumber > existing.attemptNumber) {
      latest.set(recording.questionId, recording);
    }
  }
  return Array.from(latest.values()).sort(
    (a, b) => a.question.order - b.question.order,
  );
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const doctors = await prisma.doctor.findMany({
    where:
      session.user.role === "ADMIN"
        ? { interviewToken: { not: null } }
        : { interviewToken: { not: null }, createdByEmployeeId: session.user.id },
    include: {
      createdBy: true,
      recordings: {
        include: { question: true, asset: true },
        orderBy: [{ question: { order: "asc" } }, { attemptNumber: "desc" }],
      },
      editedVideo: { include: { asset: true } },
    },
    orderBy: [{ id: "asc" }],
  });

  const rows: AdminDoctorRow[] = doctors.map((doctor) => {
    const latestRecordings = groupLatestByQuestion(doctor.recordings);
    return {
      id: doctor.id,
      doctorName: doctor.doctorName ?? doctor.doctorCode,
      doctorCode: doctor.doctorCode,
      specialty: doctor.specialty,
      interviewStatus: doctor.interviewStatus ?? "SENT",
      mrName: doctor.createdBy?.empName ?? doctor.createdByEmployeeId ?? "—",
      mrId: doctor.createdByEmployeeId,
      hasMergedVideo: Boolean(doctor.editedVideo),
      postProductionStatus: doctor.postProductionStatus,
      spotifyUrl: doctor.spotifyUrl,
      recordings: latestRecordings.slice(0, 4).map((recording) => ({
        id: recording.id,
        title: `Q${recording.question.order}. ${recording.question.title}`,
        fileUrl: `/api/recordings/file?recordingId=${recording.id}`,
        downloadUrl: `/api/recordings/file?recordingId=${recording.id}&download=1`,
      })),
      editedFileUrl: `/api/admin/edited-videos/file?doctorId=${doctor.id}`,
      editedDownloadUrl: `/api/admin/edited-videos/file?doctorId=${doctor.id}&download=1`,
    };
  });

  const withRecordings = rows.filter((row) => row.recordings.length > 0).length;
  const withMerged = rows.filter((row) => row.hasMergedVideo).length;
  const spotifyDone = rows.filter(
    (row) =>
      getDisplayPostProductionStatus(row.postProductionStatus, row.spotifyUrl) ===
      "SPOTIFY",
  ).length;

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
            href="/dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
            Post-production
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Review answer clips, upload merged videos, and manage Spotify
            publishing status.
          </p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Total doctors</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{rows.length}</p>
            </div>
            <Video className="h-5 w-5 text-slate-400" />
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">With recordings</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{withRecordings}</p>
            </div>
            <Clapperboard className="h-5 w-5 text-slate-400" />
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Merged uploaded</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{withMerged}</p>
            </div>
            <Clapperboard className="h-5 w-5 text-slate-400" />
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Spotify done</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{spotifyDone}</p>
            </div>
            <Music2 className="h-5 w-5 text-slate-400" />
          </div>
        </article>
      </div>

      <AdminDoctorsPanel doctors={rows} />
    </div>
  );
}
