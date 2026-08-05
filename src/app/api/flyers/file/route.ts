import { Readable } from "node:stream";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { doctorListWhere } from "@/lib/doctor-access";
import { generateDoctorFlyer } from "@/lib/generate-doctor-flyer";
import { prisma } from "@/lib/prisma";
import { getSpacesClient, getSpacesConfig, parseStorageKey } from "@/lib/spaces";

export const runtime = "nodejs";

function safeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function isPdfAsset(mimeType: string | null | undefined, storageUrl: string) {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("pdf")) return true;
  return /\.pdf($|\?)/i.test(storageUrl);
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

  let flyer = await prisma.flyer.findFirst({
    where: {
      doctorId,
      doctor: doctorListWhere(session.user),
    },
    include: {
      doctor: true,
      asset: true,
    },
  });

  if (!flyer) {
    return NextResponse.json({ error: "Flyer not found" }, { status: 404 });
  }

  // Old flyers were JPEG — regenerate as PDF before download.
  if (!isPdfAsset(flyer.asset.mimeType, flyer.storageUrl)) {
    if (!flyer.doctor.spotifyUrl) {
      return NextResponse.json(
        { error: "Spotify URL missing. Re-save Spotify URL to generate PDF flyer." },
        { status: 409 },
      );
    }

    try {
      await generateDoctorFlyer(doctorId);
      flyer = await prisma.flyer.findFirst({
        where: { doctorId: flyer.doctorId },
        include: { doctor: true, asset: true },
      });
      if (!flyer) {
        return NextResponse.json({ error: "Flyer not found" }, { status: 404 });
      }
    } catch (error) {
      console.error("[flyers/file] PDF regenerate failed", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not regenerate flyer PDF. Re-save Spotify URL and try again.",
        },
        { status: 500 },
      );
    }
  }

  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: parseStorageKey(flyer.asset.storageUrl),
    }),
  );

  if (!result.Body) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const doctorLabel = flyer.doctor.doctorName ?? flyer.doctor.doctorCode;
  const filename = safeFilename(`${doctorLabel}-podcast-flyer.pdf`);

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  headers.set(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${filename}"`,
  );

  const body =
    result.Body instanceof Readable ? Readable.toWeb(result.Body) : (result.Body as unknown);

  return new Response(body as any, { headers });
}
