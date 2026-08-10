import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { doctorAssetSnapshot } from "@/lib/doctor-asset-fields";
import { approvedForAdminWhere, doctorByIdWhere } from "@/lib/doctor-access";
import { prisma } from "@/lib/prisma";
import { resolveAdminUser } from "@/lib/open-admin";
import { deleteObject, isFullStorageUrl } from "@/lib/spaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeMergedVideoUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function safeDeleteManagedObject(storageUrl: string) {
  if (!isFullStorageUrl(storageUrl)) {
    return;
  }

  try {
    const host = new URL(storageUrl).hostname.toLowerCase();
    const isSpacesHost =
      host.includes("digitaloceanspaces.com") ||
      host.includes("cdn.digitaloceanspaces.com");
    if (!isSpacesHost) {
      return;
    }
    await deleteObject(storageUrl);
  } catch (error) {
    console.error("[edited-videos/upload] old storage cleanup failed", error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const adminUser = resolveAdminUser(session?.user);
    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      doctorId?: number | string;
      url?: string;
    } | null;

    const doctorId = Number(body?.doctorId);
    if (!body?.doctorId || Number.isNaN(doctorId)) {
      return NextResponse.json({ error: "Invalid doctorId" }, { status: 400 });
    }

    const storageUrl = normalizeMergedVideoUrl(String(body?.url ?? ""));
    if (!storageUrl) {
      return NextResponse.json(
        { error: "Enter a valid http(s) video URL." },
        { status: 400 },
      );
    }

    if (storageUrl.length > 1024) {
      return NextResponse.json(
        { error: "URL is too long (max 1024 characters)." },
        { status: 400 },
      );
    }

    const doctor = await prisma.doctor.findFirst({
      where: {
        AND: [doctorByIdWhere(adminUser, doctorId), approvedForAdminWhere()],
      },
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

    // Prefer logged-in emp_employee_id; otherwise MR who created the doctor.
    let createdByEmployeeId: string | null = null;
    const candidateIds = [session?.user?.id, doctor.createdByEmployeeId].filter(
      (id): id is string => Boolean(id?.trim()),
    );
    for (const candidateId of candidateIds) {
      const employee = await prisma.employee.findUnique({
        where: { empEmployeeId: candidateId },
        select: { empEmployeeId: true },
      });
      if (employee) {
        createdByEmployeeId = employee.empEmployeeId;
        break;
      }
    }

    const snapshot = doctorAssetSnapshot(doctor);
    const assetPayload = {
      ...snapshot,
      assetKind: "EDITED_VIDEO" as const,
      storageUrl,
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      durationSeconds: null as number | null,
    };

    const existingEdited = await prisma.editedVideo.findUnique({
      where: { doctorId: doctor.id },
      select: { id: true, assetId: true, storageUrl: true },
    });

    if (existingEdited) {
      const previousUrl = existingEdited.storageUrl;
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
          createdByEmployeeId,
        },
      });

      if (previousUrl && previousUrl !== storageUrl) {
        await safeDeleteManagedObject(previousUrl);
      }

      return NextResponse.json({
        editedVideoId: existingEdited.id,
        assetId: existingEdited.assetId,
        storageUrl,
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
        createdByEmployeeId,
      },
      select: { id: true },
    });

    return NextResponse.json({
      editedVideoId: editedVideo.id,
      assetId: asset.id,
      storageUrl,
    });
  } catch (error) {
    console.error("[edited-videos/upload]", error);
    const message =
      error instanceof Error ? error.message : "Save failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
