import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { createSignedUploadUrl } from "@/lib/spaces";
import { signUploadSchema } from "@/lib/validations";

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) {
    return "mp4";
  }

  return "webm";
}

export async function POST(request: Request) {
  const parsed = signUploadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }

  const doctor = await prisma.doctor.findFirst({
    where: { interviewToken: parsed.data.token },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor link not found" }, { status: 404 });
  }

  if (doctor.expiresAt && doctor.expiresAt < new Date()) {
    return NextResponse.json({ error: "Interview link expired" }, { status: 410 });
  }

  const question = await prisma.question.findFirst({
    where: { id: parsed.data.questionId, active: true },
  });

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const extension = extensionForMimeType(parsed.data.mimeType);
  const key = [
    "recordings",
    doctor.id,
    question.id,
    `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`,
  ].join("/");
  const uploadUrl = await createSignedUploadUrl({
    key,
    mimeType: parsed.data.mimeType,
  });

  return NextResponse.json({
    key,
    uploadUrl,
    headers: {
      "Content-Type": parsed.data.mimeType,
    },
  });
}
