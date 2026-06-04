import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DoctorProductionCells } from "@/components/doctor-production-cells";
import { RecordingModalPlayer } from "@/components/recording-modal-player";
import { EditedVideoUpload } from "@/components/edited-video-upload";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function groupLatestByQuestion(recordings: any[]) {
  const latest = new Map<string, any>();
  for (const r of recordings) {
    const existing = latest.get(r.questionId);
    if (!existing || r.attemptNumber > existing.attemptNumber) {
      latest.set(r.questionId, r);
    }
  }
  return Array.from(latest.values()).sort(
    (a, b) => (a.question?.order ?? 0) - (b.question?.order ?? 0),
  );
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Allow ADMIN and MR (MR sees only their doctors)
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

  return (
    <div className="space-y-6">
      <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/dashboard">
        Back to dashboard
      </Link>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-2 text-sm text-slate-400">
          Review doctors, play/download 4 answer clips, and upload the merged edited video.
        </p>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-300">
              <tr className="[&>th]:px-4 [&>th]:py-3">
                <th>MR</th>
                <th>MR ID</th>
                <th>Doctor</th>
                <th>Doctor ID</th>
                <th>Specialty</th>
                <th>Q1–Q4 videos</th>
                <th>Merged video</th>
                <th>Spotify URL</th>
                <th>Post-production</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {doctors.map((doctor) => {
                const latestRecordings = groupLatestByQuestion(doctor.recordings);
                const editedFileUrl = `/api/admin/edited-videos/file?doctorId=${doctor.id}`;
                const editedDownloadUrl = `/api/admin/edited-videos/file?doctorId=${doctor.id}&download=1`;

                return (
                  <tr className="[&>td]:px-4 [&>td]:py-4 align-top" key={doctor.id}>
                    <td className="whitespace-nowrap">
                      {doctor.createdBy?.empName ?? doctor.createdByEmployeeId ?? "-"}
                    </td>
                    <td className="whitespace-nowrap">{doctor.createdByEmployeeId ?? "-"}</td>
                    <td className="min-w-[220px]">
                      <div className="font-semibold">
                        {doctor.doctorName ?? doctor.doctorCode}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Status: {(doctor.interviewStatus ?? "SENT").replace("_", " ")}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{doctor.doctorCode}</td>
                    <td className="whitespace-nowrap">{doctor.specialty ?? "-"}</td>
                    <td className="min-w-[520px]">
                      <div className="grid gap-2 md:grid-cols-2">
                        {latestRecordings.slice(0, 4).map((r: any) => {
                          const fileUrl = `/api/recordings/file?recordingId=${r.id}`;
                          const downloadUrl = `/api/recordings/file?recordingId=${r.id}&download=1`;
                          const title = `Q${r.question.order}. ${r.question.title} (Attempt ${r.attemptNumber})`;
                          return (
                            <div
                              className="rounded-2xl border border-white/10 bg-white/5 p-3"
                              key={r.id}
                            >
                              <div className="text-xs font-semibold text-slate-200">{title}</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <RecordingModalPlayer
                                  title={title}
                                  fileUrl={fileUrl}
                                  downloadUrl={downloadUrl}
                                />
                                <a
                                  className="rounded-full bg-cyan-400 px-4 py-2 text-center text-xs font-semibold text-slate-950 hover:bg-cyan-300"
                                  href={downloadUrl}
                                >
                                  Download
                                </a>
                              </div>
                            </div>
                          );
                        })}
                        {latestRecordings.length === 0 ? (
                          <p className="text-slate-400">No submitted recordings yet.</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="min-w-[320px]">
                      {doctor.editedVideo ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="text-xs font-semibold text-slate-200">
                            Uploaded merged video
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <RecordingModalPlayer
                              title={`${doctor.doctorName ?? doctor.doctorCode} — merged video`}
                              fileUrl={editedFileUrl}
                              downloadUrl={editedDownloadUrl}
                            />
                            <a
                              className="rounded-full bg-cyan-400 px-4 py-2 text-center text-xs font-semibold text-slate-950 hover:bg-cyan-300"
                              href={editedDownloadUrl}
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-3">
                          <p className="text-xs text-slate-400">
                            Upload the final edited/merged clip (intro + 4 answers + ending).
                          </p>
                          <div className="mt-3">
                            <EditedVideoUpload doctorId={doctor.id} />
                          </div>
                        </div>
                      )}
                    </td>
                    <DoctorProductionCells
                      doctorId={doctor.id}
                      hasMergedVideo={Boolean(doctor.editedVideo)}
                      initialSpotifyUrl={doctor.spotifyUrl}
                      initialStatus={doctor.postProductionStatus}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

