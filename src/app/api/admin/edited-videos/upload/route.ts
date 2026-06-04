import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { doctorAssetSnapshot } from "@/lib/doctor-asset-fields";
import { prisma } from "@/lib/prisma";
import { buildEditedVideoKey } from "@/lib/storage-keys";
import { uploadObject } from "@/lib/spaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 500 * 1024 * 1024;

function parseDurationSeconds(raw: string) {
  const value = Number(raw);
  if (!raw || Number.isNaN(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const doctorIdRaw = String(formData.get("doctorId") ?? "");
    const file = formData.get("file");
    const durationSeconds = parseDurationSeconds(
      String(formData.get("durationSeconds") ?? ""),
    );

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
      return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 413 });
    }

    const doctor = await prisma.doctor.findFirst({
      where:
        session.user.role === "ADMIN"
          ? { id: doctorId }
          : { id: doctorId, createdByEmployeeId: session.user.id },
      select: {
        id: true,
        doctorName: true,
        doctorCode: true,
        createdByEmployeeId: true,
      },
    });

    if (!doctor) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }

    const mimeType = file.type || "video/mp4";
    const key = buildEditedVideoKey(
      doctor.id,
      doctor.doctorName,
      doctor.doctorCode,
      mimeType,
    );

    const body = Buffer.from(await file.arrayBuffer());
    const storageUrl = await uploadObject({ key, body, mimeType });
    const snapshot = doctorAssetSnapshot(doctor);

    const assetPayload = {
      ...snapshot,
      assetKind: "EDITED_VIDEO" as const,
      storageUrl,
      mimeType,
      sizeBytes: body.length,
      durationSeconds,
    };

    const existingEdited = await prisma.editedVideo.findUnique({
      where: { doctorId: doctor.id },
      select: { id: true, assetId: true },
    });

    if (existingEdited) {
      await prisma.asset.update({
        where: { id: existingEdited.assetId },
        data: assetPayload,
      });

      await prisma.editedVideo.update({
        where: { doctorId: doctor.id },
        data: {
          doctorCode: snapshot.doctorCode,
          doctorName: snapshot.doctorName,
          storageUrl,
          createdByEmployeeId: session.user.id,
        },
      });

      return NextResponse.json({
        editedVideoId: existingEdited.id,
        assetId: existingEdited.assetId,
        storageUrl,
        durationSeconds,
      });
    }

    const asset = await prisma.asset.create({
      data: assetPayload,
      select: { id: true },
    });

    const editedVideo = await prisma.editedVideo.create({
      data: {
        doctorId: doctor.id,
        doctorCode: snapshot.doctorCode,
        doctorName: snapshot.doctorName,
        assetId: asset.id,
        storageUrl,
        createdByEmployeeId: session.user.id,
      },
      select: { id: true },
    });

    return NextResponse.json({
      editedVideoId: editedVideo.id,
      assetId: asset.id,
      storageUrl,
      durationSeconds,
    });
  } catch (error) {
    console.error("[edited-videos/upload]", error);
    const message =
      error instanceof Error ? error.message : "Upload failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
