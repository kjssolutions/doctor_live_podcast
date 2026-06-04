import { NextResponse } from "next/server";

import { doctorAssetSnapshot } from "@/lib/doctor-asset-fields";
import { getActiveQuestions } from "@/lib/interviews";
import { prisma } from "@/lib/prisma";
import { isRecordingKeyForDoctor } from "@/lib/recording-upload";
import { buildStorageUrl, normalizeStorageUrlForDb } from "@/lib/spaces";
import { finalizeRecordingSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const parsed = finalizeRecordingSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid recording payload" }, { status: 400 });
  }

  const doctor = await prisma.doctor.findFirst({
    where: { interviewToken: parsed.data.token },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor link not found" }, { status: 404 });
  }

  if (!isRecordingKeyForDoctor(parsed.data.key, doctor.id)) {
    return NextResponse.json({ error: "Upload key mismatch" }, { status: 400 });
  }

  const question = await prisma.question.findFirst({
    where: { id: parsed.data.questionId, active: true },
  });

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const existingReady = await prisma.answerRecording.findFirst({
    where: {
      doctorId: doctor.id,
      questionId: question.id,
      status: "READY",
    },
    orderBy: { attemptNumber: "desc" },
    select: { id: true },
  });

  if (existingReady) {
    return NextResponse.json({
      recordingId: existingReady.id,
      alreadySubmitted: true,
    });
  }

  const latestAttempt = await prisma.answerRecording.findFirst({
    where: {
      doctorId: doctor.id,
      questionId: question.id,
    },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true },
  });
  const snapshot = doctorAssetSnapshot(doctor);
  const { doctorId: _doctorId, ...recordingDoctorFields } = snapshot;
  const storageUrl = normalizeStorageUrlForDb(buildStorageUrl(parsed.data.key));

  const recording = await prisma.answerRecording.create({
    data: {
      ...recordingDoctorFields,
      doctor: { connect: { id: doctor.id } },
      question: { connect: { id: question.id } },
      attemptNumber: (latestAttempt?.attemptNumber ?? 0) + 1,
      status: "READY",
      asset: {
        create: {
          ...snapshot,
          assetKind: "INTERVIEW_RECORDING",
          storageUrl,
          mimeType: parsed.data.mimeType,
          sizeBytes: parsed.data.sizeBytes,
          durationSeconds: parsed.data.durationSeconds ?? null,
        },
      },
    },
    include: { question: true },
  });

  const activeQuestions = await getActiveQuestions();
  const submittedQuestions = await prisma.answerRecording.findMany({
    where: { doctorId: doctor.id, status: "READY" },
    distinct: ["questionId"],
    select: { questionId: true },
  });

  if (submittedQuestions.length >= activeQuestions.length) {
    await prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        interviewStatus: "COMPLETED",
        completedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ recordingId: recording.id });
}
