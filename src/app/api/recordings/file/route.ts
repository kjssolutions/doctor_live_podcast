import { Readable } from "node:stream";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  approvedForAdminWhere,
  canViewAnswers,
  doctorListWhere,
} from "@/lib/doctor-access";
import { ADMIN_OPEN_WITHOUT_LOGIN, resolveAdminUser } from "@/lib/open-admin";
import { prisma } from "@/lib/prisma";
import { recordingDownloadFilename, recordingVideoDownloadMeta } from "@/lib/storage-keys";
import { getSpacesClient, getSpacesConfig, parseStorageKey } from "@/lib/spaces";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const url = new URL(request.url);
  const recordingId = url.searchParams.get("recordingId") ?? "";
  const download = url.searchParams.get("download") === "1";

  if (!recordingId) {
    return NextResponse.json({ error: "Missing recordingId" }, { status: 400 });
  }

  let doctorWhere;
  if (session?.user && canViewAnswers(session.user)) {
    doctorWhere = doctorListWhere(session.user);
  } else if (ADMIN_OPEN_WITHOUT_LOGIN) {
    const adminUser = resolveAdminUser(null);
    doctorWhere = {
      AND: [doctorListWhere(adminUser!), approvedForAdminWhere()],
    };
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recording = await prisma.answerRecording.findFirst({
    where: {
      id: recordingId,
      doctor: doctorWhere,
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
      Key: parseStorageKey(recording.asset.storageUrl),
    }),
  );

  if (!result.Body) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const mimeType = recording.asset.mimeType || "";
  const { contentType } = recordingVideoDownloadMeta(
    mimeType,
    recording.asset.storageUrl,
  );
  const filename = recordingDownloadFilename(
    recording.doctor.doctorCode,
    recording.question.order,
    mimeType,
    recording.asset.storageUrl,
  );

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  headers.set(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${filename}"`,
  );

  headers.set("Accept-Ranges", "bytes");

  const body =
    result.Body instanceof Readable
      ? Readable.toWeb(result.Body)
      : (result.Body as unknown);

  return new Response(body as any, { headers });
}
