import { NextResponse } from "next/server";

import {
  buildRecordingKey,
  findActiveQuestion,
  findDoctorForInterviewToken,
} from "@/lib/recording-upload";
import { createSignedUploadUrl } from "@/lib/spaces";
import { signUploadSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const parsed = signUploadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
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
    question.order,
    parsed.data.mimeType,
  );
  const signed = await createSignedUploadUrl({
    key,
    mimeType: parsed.data.mimeType,
  });

  return NextResponse.json({
    key,
    uploadUrl: signed.uploadUrl,
    headers: signed.headers,
  });
}
