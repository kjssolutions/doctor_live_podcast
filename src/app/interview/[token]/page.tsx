import { notFound } from "next/navigation";

import { InterviewRecorderLoader } from "@/app/interview/[token]/interview-recorder-loader";
import { getActiveQuestions, getDoctorByInterviewToken } from "@/lib/interviews";
import { prisma } from "@/lib/prisma";

export default async function PublicInterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const doctor = await getDoctorByInterviewToken(token);

  if (!doctor) {
    notFound();
  }

  if (doctor.expiresAt && doctor.expiresAt < new Date()) {
    await prisma.doctor.update({
      where: { id: doctor.id },
      data: { interviewStatus: "EXPIRED" },
    });

    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 text-center">
        <h1 className="text-4xl font-bold">This link has expired</h1>
        <p className="mt-4 text-slate-400">
          Please ask your MR contact to create a new podcast interview link.
        </p>
      </main>
    );
  }

  if (!doctor.openedAt && doctor.interviewStatus !== "COMPLETED") {
    await prisma.doctor.update({
      where: { id: doctor.id },
      data: { interviewStatus: "OPENED", openedAt: new Date() },
    });
  }

  const questions = await getActiveQuestions();

  if (questions.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 text-center">
        <h1 className="text-4xl font-bold">Interview not ready</h1>
        <p className="mt-4 text-slate-400">
          No active questions are configured. Run npm run db:setup-local and npm
          run prisma:seed.
        </p>
      </main>
    );
  }

  return (
    <InterviewRecorderLoader
      completedQuestionIds={doctor.recordings.map(
        (recording) => recording.questionId,
      )}
      doctor={{
        name: doctor.doctorName ?? doctor.doctorCode,
        specialty: doctor.specialty,
      }}
      questions={questions.map((question) => ({
        id: question.id,
        title: question.title,
        prompt: question.prompt,
        order: question.order,
        avatarVideoUrl: question.avatarVideoUrl,
      }))}
      token={token}
    />
  );
}
