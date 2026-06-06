import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteDoctorFlyer } from "@/lib/generate-doctor-flyer";
import { deleteObject } from "@/lib/spaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
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
        doctor:
          session.user.role === "ADMIN"
            ? {}
            : { createdByEmployeeId: session.user.id },
      },
      include: { asset: true },
    });

    if (!edited) {
      return NextResponse.json({ error: "Merged video not found" }, { status: 404 });
    }

    await deleteObject(edited.asset.storageUrl);
    await deleteDoctorFlyer(doctorId);

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
