import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

export function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) {
    return "mp4";
  }

  return "webm";
}

export function buildRecordingKey(
  doctorId: string | number,
  questionId: string,
  mimeType: string,
) {
  const extension = extensionForMimeType(mimeType);

  return [
    "recordings",
    String(doctorId),
    questionId,
    `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`,
  ].join("/");
}

export async function findDoctorForInterviewToken(token: string) {
  const doctor = await prisma.doctor.findFirst({
    where: { interviewToken: token },
  });

  if (!doctor) {
    return { error: "not_found" as const };
  }

  if (doctor.expiresAt && doctor.expiresAt < new Date()) {
    return { error: "expired" as const };
  }

  return { doctor };
}

export async function findActiveQuestion(questionId: string) {
  return prisma.question.findFirst({
    where: { id: questionId, active: true },
  });
}
