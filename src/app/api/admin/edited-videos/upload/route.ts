import crypto from "node:crypto";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAssetLocation, uploadObject } from "@/lib/spaces";

export const runtime = "nodejs";

const MAX_BYTES = 500 * 1024 * 1024;

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return "bin";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const doctorIdRaw = String(formData.get("doctorId") ?? "");
  const file = formData.get("file");

  const doctorId = Number(doctorIdRaw);
  if (!doctorIdRaw || Number.isNaN(doctorId)) {
    return NextResponse.json({ error: "Invalid doctorId" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const doctor = await prisma.doctor.findFirst({
    where:
      session.user.role === "ADMIN"
        ? { id: doctorId }
        : { id: doctorId, createdByEmployeeId: session.user.id },
    select: { id: true },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const mimeType = file.type || "video/mp4";
  const extension = extensionForMimeType(mimeType);
  const key = [
    "edited-videos",
    doctor.id,
    `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`,
  ].join("/");

  const body = Buffer.from(await file.arrayBuffer());
  await uploadObject({ key, body, mimeType });

  const assetLocation = getAssetLocation();

  const asset = await prisma.asset.create({
    data: {
      key,
      bucket: assetLocation.bucket,
      endpoint: assetLocation.endpoint,
      mimeType,
      sizeBytes: body.length,
      durationSeconds: null,
    },
    select: { id: true, key: true, mimeType: true, sizeBytes: true },
  });

  const editedVideo = await prisma.editedVideo.upsert({
    where: { doctorId: doctor.id },
    update: {
      assetId: asset.id,
      createdByEmployeeId: session.user.id,
    },
    create: {
      doctorId: doctor.id,
      assetId: asset.id,
      createdByEmployeeId: session.user.id,
    },
    select: { id: true },
  });

  return NextResponse.json({
    editedVideoId: editedVideo.id,
    assetId: asset.id,
  });
}

