import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { deleteDoctorFlyer, generateDoctorFlyer } from "@/lib/generate-doctor-flyer";
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

  const effectiveSpotifyUrl =
    spotifyUrl !== undefined ? spotifyUrl : doctor.spotifyUrl;

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

  if (spotifyUrl !== undefined && spotifyUrl) {
    if (!/^https?:\/\//i.test(spotifyUrl)) {
      return NextResponse.json(
        { error: "Spotify URL must start with http(s)://." },
        { status: 400 },
      );
    }
  }

  // Hierarchy: Processing → Done → Spotify. Cannot step down while URL exists.
  if (
    effectiveSpotifyUrl &&
    (status === "DONE" || status === "PROCESSING")
  ) {
    return NextResponse.json(
      {
        error:
          "Cannot change to Processing or Done while Spotify URL exists. Remove the link first.",
      },
      { status: 400 },
    );
  }

  if (status === "SPOTIFY" && !effectiveSpotifyUrl) {
    return NextResponse.json(
      { error: "Spotify URL is required when status is SPOTIFY." },
      { status: 400 },
    );
  }

  const data: {
    postProductionStatus?: "PROCESSING" | "DONE" | "SPOTIFY";
    spotifyUrl?: string | null;
  } = {};

  if (spotifyUrl !== undefined) {
    data.spotifyUrl = spotifyUrl;
    if (spotifyUrl) {
      // Saving a link always moves workflow to Spotify.
      data.postProductionStatus = "SPOTIFY";
    } else if (doctor.postProductionStatus === "SPOTIFY") {
      // Clearing link after publish → back to Done.
      data.postProductionStatus = "DONE";
    }
  }

  if (status !== undefined) {
    data.postProductionStatus = status as "PROCESSING" | "DONE" | "SPOTIFY";
  }

  const updated = await prisma.doctor.update({
    where: { id: doctorId },
    data,
    select: { id: true, postProductionStatus: true, spotifyUrl: true },
  });

  let flyerReady = false;

  try {
    const shouldGenerateFlyer =
      updated.postProductionStatus === "SPOTIFY" && Boolean(updated.spotifyUrl);

    if (shouldGenerateFlyer) {
      await generateDoctorFlyer(doctorId);
      flyerReady = true;
    } else if (
      spotifyUrl !== undefined &&
      !updated.spotifyUrl
    ) {
      await deleteDoctorFlyer(doctorId);
    }
  } catch (flyerError) {
    console.error("[post-production/flyer]", flyerError);
    const message =
      flyerError instanceof Error
        ? flyerError.message
        : "Flyer generation failed";
    return NextResponse.json(
      {
        error: `${message}. Spotify URL was saved, but the flyer could not be generated. Try saving again.`,
        postProductionStatus: updated.postProductionStatus,
        spotifyUrl: updated.spotifyUrl,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ...updated, flyerReady });
}
