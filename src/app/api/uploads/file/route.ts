import { NextResponse } from "next/server";

import {
  buildRecordingKey,
  findActiveQuestion,
  findDoctorForInterviewToken,
} from "@/lib/recording-upload";
import { uploadObject } from "@/lib/spaces";
import { signUploadSchema } from "@/lib/validations";

export const runtime = "nodejs";

const MAX_BYTES = 250 * 1024 * 1024;

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing recording file" }, { status: 400 });
  }

  const mimeType = file.type || "video/webm";
  const sizeBytes = file.size;

  const parsed = signUploadSchema.safeParse({
    token,
    questionId,
    mimeType,
    sizeBytes,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }

  if (sizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Recording is too large" }, { status: 413 });
  }

  const doctorResult = await findDoctorForInterviewToken(parsed.data.token);

  if ("error" in doctorResult) {
    if (doctorResult.error === "expired") {
      return NextResponse.json({ error: "Interview link expired" }, { status: 410 });
    }

    return NextResponse.json({ error: "Doctor link not found" }, { status: 404 });
  }

  const question = await findActiveQuestion(parsed.data.questionId);

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const key = buildRecordingKey(
    doctorResult.doctor.id,
    question.id,
    parsed.data.mimeType,
  );

  const body = Buffer.from(await file.arrayBuffer());
  await uploadObject({
    key,
    body,
    mimeType: parsed.data.mimeType,
  });

  return NextResponse.json({
    key,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
  });
}
