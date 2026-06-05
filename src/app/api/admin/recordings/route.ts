import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getActiveQuestions } from "@/lib/interviews";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/spaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      recordingId?: string;
    } | null;

    const recordingId = body?.recordingId?.trim();
    if (!recordingId) {
      return NextResponse.json({ error: "Invalid recordingId" }, { status: 400 });
    }

    const recording = await prisma.answerRecording.findFirst({
      where: {
        id: recordingId,
        doctor:
          session.user.role === "ADMIN"
            ? {}
            : { createdByEmployeeId: session.user.id },
      },
      include: {
        asset: true,
        question: true,
      },
    });

    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    await deleteObject(recording.asset.storageUrl);

    await prisma.$transaction(async (tx) => {
      await tx.answerRecording.delete({ where: { id: recording.id } });
      await tx.asset.delete({ where: { id: recording.assetId } });

      const activeQuestions = await getActiveQuestions();
      const submittedQuestions = await tx.answerRecording.findMany({
        where: { doctorId: recording.doctorId, status: "READY" },
        distinct: ["questionId"],
        select: { questionId: true },
      });

      if (submittedQuestions.length < activeQuestions.length) {
        await tx.doctor.update({
          where: { id: recording.doctorId },
          data: {
            interviewStatus: "IN_PROGRESS",
            completedAt: null,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      questionOrder: recording.question.order,
    });
  } catch (error) {
    console.error("[admin/recordings/delete]", error);
    const message =
      error instanceof Error ? error.message : "Delete failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
