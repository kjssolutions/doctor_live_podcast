import { Readable } from "node:stream";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSpacesClient, getSpacesConfig, parseStorageKey } from "@/lib/spaces";

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
  const doctorIdRaw = url.searchParams.get("doctorId") ?? "";
  const download = url.searchParams.get("download") === "1";

  const doctorId = Number(doctorIdRaw);
  if (!doctorIdRaw || Number.isNaN(doctorId)) {
    return NextResponse.json({ error: "Invalid doctorId" }, { status: 400 });
  }

  const edited = await prisma.editedVideo.findFirst({
    where: {
      doctorId,
      doctor:
        session.user.role === "ADMIN"
          ? {}
          : { createdByEmployeeId: session.user.id },
    },
    include: {
      doctor: true,
      asset: true,
    },
  });

  if (!edited) {
    return NextResponse.json({ error: "Edited video not found" }, { status: 404 });
  }

  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: parseStorageKey(edited.asset.storageUrl),
    }),
  );

  if (!result.Body) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const doctorLabel = edited.doctor.doctorName ?? edited.doctor.doctorCode;
  const ext = edited.asset.mimeType.includes("mp4") ? "mp4" : "webm";
  const filename = safeFilename(`${doctorLabel}-edited.${ext}`);

  const headers = new Headers();
  headers.set("Content-Type", edited.asset.mimeType || "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  headers.set(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${filename}"`,
  );
  headers.set("Accept-Ranges", "bytes");

  const body =
    result.Body instanceof Readable ? Readable.toWeb(result.Body) : (result.Body as unknown);

  return new Response(body as any, { headers });
}

