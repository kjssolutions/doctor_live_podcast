import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { approvedForAdminWhere, doctorListWhere } from "@/lib/doctor-access";
import { prisma } from "@/lib/prisma";
import { deleteDoctorFlyer } from "@/lib/generate-doctor-flyer";
import { resolveAdminUser } from "@/lib/open-admin";
import { deleteObject } from "@/lib/spaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const adminUser = resolveAdminUser(session?.user);
    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      doctorId?: number | string;
    } | null;

    const doctorId = Number(body?.doctorId);
    if (!body?.doctorId || Number.isNaN(doctorId)) {
      return NextResponse.json({ error: "Invalid doctorId" }, { status: 400 });
    }

    const edited = await prisma.editedVideo.findFirst({
      where: {
        doctorId,
        doctor: {
          AND: [doctorListWhere(adminUser), approvedForAdminWhere()],
        },
      },
      include: { asset: true },
    });

    if (!edited) {
      return NextResponse.json({ error: "Merged video not found" }, { status: 404 });
    }

    await deleteDoctorFlyer(doctorId);

    try {
      const host = new URL(edited.asset.storageUrl).hostname.toLowerCase();
      const isSpacesHost =
        host.includes("digitaloceanspaces.com") ||
        host.includes("cdn.digitaloceanspaces.com");
      if (isSpacesHost) {
        await deleteObject(edited.asset.storageUrl);
      }
    } catch (cleanupError) {
      console.error("[edited-videos/delete] storage cleanup skipped", cleanupError);
    }

    await prisma.$transaction([
      prisma.editedVideo.delete({ where: { id: edited.id } }),
      prisma.asset.delete({ where: { id: edited.assetId } }),
      prisma.doctor.update({
        where: { id: doctorId },
        data: {
          postProductionStatus: "PROCESSING",
          spotifyUrl: null,
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[edited-videos/delete]", error);
    const message =
      error instanceof Error ? error.message : "Delete failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
