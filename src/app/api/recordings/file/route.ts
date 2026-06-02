import { Readable } from "node:stream";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSpacesClient, getSpacesConfig } from "@/lib/spaces";

export const runtime = "nodejs";

function safeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const recordingId = url.searchParams.get("recordingId") ?? "";
  const download = url.searchParams.get("download") === "1";

  if (!recordingId) {
    return NextResponse.json({ error: "Missing recordingId" }, { status: 400 });
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
      doctor: true,
      question: true,
      asset: true,
    },
  });

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: recording.asset.key,
    }),
  );

  if (!result.Body) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const doctorLabel = recording.doctor.doctorName ?? recording.doctor.doctorCode;
  const filename = safeFilename(
    `${doctorLabel}-q${recording.question.order}-${recording.question.title}-attempt${recording.attemptNumber}.${recording.asset.mimeType.includes("mp4") ? "mp4" : "webm"}`,
  );

  const headers = new Headers();
  headers.set("Content-Type", recording.asset.mimeType || "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  if (download) {
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  } else {
    headers.set("Content-Disposition", `inline; filename="${filename}"`);
  }

  // Best-effort: allow seeking/playing in <video> without caching issues.
  headers.set("Accept-Ranges", "bytes");

  const body =
    result.Body instanceof Readable
      ? Readable.toWeb(result.Body)
      : (result.Body as unknown);

  // Next.js route handlers accept web streams at runtime, but TypeScript's
  // lib.dom vs node:stream/web types don't line up cleanly. Cast for TS.
  return new Response(body as any, { headers });
}

