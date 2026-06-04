import { prisma } from "@/lib/prisma";

export async function getActiveQuestions() {
  return prisma.question.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });
}

export async function getDoctorByInterviewToken(token: string) {
  return prisma.doctor.findFirst({
    where: { interviewToken: token },
    include: {
      recordings: {
        where: { status: "READY" },
        distinct: ["questionId"],
        select: { questionId: true },
      },
    },
  });
}

export async function markDoctorInterviewStarted(token: string) {
  const doctor = await prisma.doctor.findFirst({
    where: { interviewToken: token },
    select: { interviewStatus: true, openedAt: true, startedAt: true },
  });

  if (!doctor) {
    return null;
  }

  return prisma.doctor.updateMany({
    where: { interviewToken: token },
    data: {
      interviewStatus:
        doctor.interviewStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
      openedAt: doctor.openedAt ?? new Date(),
      startedAt: doctor.startedAt ?? new Date(),
    },
  });
}
