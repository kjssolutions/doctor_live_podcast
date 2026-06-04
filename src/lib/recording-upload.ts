import { prisma } from "@/lib/prisma";

export {
  buildRecordingKey,
  extensionForMimeType,
  isRecordingKeyForDoctor,
} from "@/lib/storage-keys";

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
