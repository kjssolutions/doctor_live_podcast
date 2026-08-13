import {
  AdminDoctorsPanel,
  type AdminDoctorRow,
} from "@/components/admin-doctors-panel";
import { AdminStats } from "@/components/admin-stats";
import { approvedForAdminWhere } from "@/lib/doctor-access";
import { getDisplayPostProductionStatus } from "@/lib/post-production";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
  const doctors = await prisma.doctor.findMany({
    where: {
      interviewToken: { not: null },
      ...approvedForAdminWhere(),
    },
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
      imageUrl: doctor.imageUrl,
      thumbUrl: doctor.thumbUrl,
      hasMergedVideo: Boolean(doctor.editedVideo),
      postProductionStatus: doctor.postProductionStatus,
      spotifyUrl: doctor.spotifyUrl,
      recordings: latestRecordings.slice(0, 4).map((recording) => ({
        id: recording.id,
        title: `Q${recording.question.order}. ${recording.question.title}`,
        order: recording.question.order,
        fileUrl: `/api/recordings/file?recordingId=${recording.id}`,
        downloadUrl: `/api/recordings/file?recordingId=${recording.id}&download=1`,
      })),
      editedFileUrl: doctor.editedVideo?.storageUrl ?? "",
      editedDownloadUrl: doctor.editedVideo?.storageUrl ?? "",
    };
  });

  const withMerged = rows.filter((row) => row.hasMergedVideo).length;
  const spotifyDone = rows.filter(
    (row) =>
      getDisplayPostProductionStatus(row.postProductionStatus, row.spotifyUrl) ===
      "SPOTIFY",
  ).length;

  return (
    <div className="space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex items-end gap-3">
          <span className="mb-1.5 h-8 w-1 rounded-full bg-slate-900" aria-hidden />
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em] text-slate-400 uppercase">
              Workspace
            </p>
            <h1 className="mt-0.5 text-3xl font-bold tracking-[-0.03em] text-slate-900 sm:text-[2.35rem]">
              Admin
            </h1>
          </div>
        </div>
      </header>

      <AdminStats
        spotifyDone={spotifyDone}
        total={rows.length}
        withMerged={withMerged}
      />

      <AdminDoctorsPanel doctors={rows} />
    </div>
  );
}
