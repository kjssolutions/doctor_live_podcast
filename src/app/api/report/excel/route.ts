import { formatInterviewStatus } from "@/lib/interview-status";
import {
  formatPostProductionStatus,
  getDisplayPostProductionStatus,
} from "@/lib/post-production";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function latestByQuestion<
  T extends { questionId: string; attemptNumber: number; question: { order: number } },
>(recordings: T[]) {
  const latest = new Map<string, T>();
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

export async function GET() {
  const ExcelJS = (await import("exceljs")).default;

  const doctors = await prisma.doctor.findMany({
    where: { interviewToken: { not: null } },
    include: {
      createdBy: {
        select: {
          empEmployeeId: true,
          empName: true,
          empHeadquarters: true,
          area: true,
          region: true,
          zone: true,
          division: true,
        },
      },
      recordings: {
        include: {
          question: { select: { order: true, title: true } },
          asset: { select: { storageUrl: true, sizeBytes: true } },
        },
        orderBy: [{ question: { order: "asc" } }, { attemptNumber: "desc" }],
      },
      editedVideo: { select: { storageUrl: true, createdByEmployeeId: true } },
      flyer: { select: { id: true, storageUrl: true } },
    },
    orderBy: { id: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Doctor Live Podcast";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Doctors Report", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Doctor ID", key: "doctorCode", width: 16 },
    { header: "Doctor Name", key: "doctorName", width: 28 },
    { header: "Specialty", key: "specialty", width: 18 },
    { header: "MR Name", key: "mrName", width: 24 },
    { header: "MR ID", key: "mrId", width: 14 },
    { header: "MR Area", key: "mrArea", width: 16 },
    { header: "MR Region", key: "mrRegion", width: 16 },
    { header: "MR Zone", key: "mrZone", width: 12 },
    { header: "MR Division", key: "mrDivision", width: 14 },
    { header: "Interview Status", key: "interviewStatus", width: 16 },
    { header: "Post Production Status", key: "postStatus", width: 20 },
    { header: "Doctor Photo URL", key: "imageUrl", width: 40 },
    { header: "Thumbnail URL", key: "thumbUrl", width: 40 },
    { header: "Q1 Title", key: "q1Title", width: 22 },
    { header: "Q1 Video URL", key: "q1Url", width: 40 },
    { header: "Q2 Title", key: "q2Title", width: 22 },
    { header: "Q2 Video URL", key: "q2Url", width: 40 },
    { header: "Q3 Title", key: "q3Title", width: 22 },
    { header: "Q3 Video URL", key: "q3Url", width: 40 },
    { header: "Q4 Title", key: "q4Title", width: 22 },
    { header: "Q4 Video URL", key: "q4Url", width: 40 },
    { header: "Merged Video URL", key: "mergedUrl", width: 40 },
    { header: "Merged Created By Emp ID", key: "mergedBy", width: 18 },
    { header: "Spotify URL", key: "spotifyUrl", width: 40 },
    { header: "Flyer Ready", key: "flyerReady", width: 12 },
    { header: "Flyer URL", key: "flyerUrl", width: 40 },
    { header: "Podcast Created At", key: "createdAt", width: 22 },
    { header: "Completed At", key: "completedAt", width: 22 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1A3A32" },
  };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 22;

  for (const doctor of doctors) {
    const latest = latestByQuestion(doctor.recordings);
    const byOrder = new Map(latest.map((r) => [r.question.order, r]));
    const displayStatus = getDisplayPostProductionStatus(
      doctor.postProductionStatus,
      doctor.spotifyUrl,
    );

    const q = (order: number) => byOrder.get(order);

    sheet.addRow({
      id: doctor.id,
      doctorCode: doctor.doctorCode,
      doctorName: doctor.doctorName ?? "",
      specialty: doctor.specialty ?? "",
      mrName: doctor.createdBy?.empName ?? doctor.createdByEmployeeId ?? "",
      mrId: doctor.createdByEmployeeId ?? "",
      mrArea:
        doctor.createdBy?.area ??
        doctor.region ??
        doctor.empHeadquarters ??
        "",
      mrRegion: doctor.createdBy?.region ?? doctor.region ?? "",
      mrZone: doctor.createdBy?.zone ?? "",
      mrDivision: doctor.createdBy?.division ?? "",
      interviewStatus: formatInterviewStatus(doctor.interviewStatus),
      postStatus: formatPostProductionStatus(displayStatus),
      imageUrl: doctor.imageUrl ?? "",
      thumbUrl: doctor.thumbUrl ?? "",
      q1Title: q(1)?.question.title ?? "",
      q1Url: q(1)?.asset.storageUrl ?? "",
      q2Title: q(2)?.question.title ?? "",
      q2Url: q(2)?.asset.storageUrl ?? "",
      q3Title: q(3)?.question.title ?? "",
      q3Url: q(3)?.asset.storageUrl ?? "",
      q4Title: q(4)?.question.title ?? "",
      q4Url: q(4)?.asset.storageUrl ?? "",
      mergedUrl: doctor.editedVideo?.storageUrl ?? "",
      mergedBy: doctor.editedVideo?.createdByEmployeeId ?? "",
      spotifyUrl: doctor.spotifyUrl ?? "",
      flyerReady: doctor.flyer ? "Yes" : "No",
      flyerUrl: doctor.flyer?.storageUrl ?? "",
      createdAt: doctor.podcastCreatedAt
        ? doctor.podcastCreatedAt.toISOString()
        : "",
      completedAt: doctor.completedAt ? doctor.completedAt.toISOString() : "",
    });
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `doctor-live-podcast-report-${stamp}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
