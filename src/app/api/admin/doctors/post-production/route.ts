import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ALLOWED = new Set(["PROCESSING", "DONE", "SPOTIFY"]);

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { doctorId?: number; status?: string; spotifyUrl?: string | null }
    | null;

  const doctorId = Number(body?.doctorId);
  if (!doctorId || Number.isNaN(doctorId)) {
    return NextResponse.json({ error: "Invalid doctorId" }, { status: 400 });
  }

  const status = body?.status;
  if (status !== undefined && !ALLOWED.has(status)) {
    return NextResponse.json(
      { error: "Invalid status. Use PROCESSING | DONE | SPOTIFY" },
      { status: 400 },
    );
  }

  const spotifyUrl =
    typeof body?.spotifyUrl === "string"
      ? body.spotifyUrl.trim() || null
      : body?.spotifyUrl === null
        ? null
        : undefined;

  const doctor = await prisma.doctor.findFirst({
    where:
      session.user.role === "ADMIN"
        ? { id: doctorId }
        : { id: doctorId, createdByEmployeeId: session.user.id },
    select: {
      id: true,
      editedVideo: { select: { id: true } },
      postProductionStatus: true,
      spotifyUrl: true,
    },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  // Rules:
  // - Without merged video upload, nobody can set DONE/SPOTIFY.
  // - Without merged video upload, spotifyUrl cannot be saved (keeps workflow consistent).
  if (!doctor.editedVideo) {
    if (status === "DONE" || status === "SPOTIFY") {
      return NextResponse.json(
        { error: "Upload merged video first, then set Done/Spotify." },
        { status: 400 },
      );
    }
    if (spotifyUrl !== undefined && spotifyUrl) {
      return NextResponse.json(
        { error: "Upload merged video first, then add Spotify link." },
        { status: 400 },
      );
    }
  }

  // Validate spotifyUrl format whenever it is being set.
  if (spotifyUrl !== undefined && spotifyUrl) {
    if (!/^https?:\/\//i.test(spotifyUrl)) {
      return NextResponse.json(
        { error: "Spotify URL must start with http(s)://." },
        { status: 400 },
      );
    }
  }

  // If setting status SPOTIFY, require a spotifyUrl (either incoming or already saved).
  if (status === "SPOTIFY") {
    const nextUrl = spotifyUrl !== undefined ? spotifyUrl : doctor.spotifyUrl;
    if (!nextUrl) {
      return NextResponse.json(
        { error: "Spotify URL is required when status is SPOTIFY." },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.doctor.update({
    where: { id: doctorId },
    data: {
      ...(status !== undefined ? { postProductionStatus: status as any } : {}),
      ...(spotifyUrl !== undefined ? { spotifyUrl } : {}),
    },
    select: { id: true, postProductionStatus: true, spotifyUrl: true },
  });

  return NextResponse.json(updated);
}

