import { Readable } from "node:stream";

import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { makeZip, predictLength } from "client-zip";
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
import { recordingDownloadFilename } from "@/lib/storage-keys";
import { getSpacesClient, getSpacesConfig, parseStorageKey } from "@/lib/spaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTIONS = 4;

/** All latest Q1–Q4 answers of one doctor as a single ZIP, streamed file by file from Spaces. */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const url = new URL(request.url);
  const doctorId = Number(url.searchParams.get("doctorId"));

  if (!Number.isInteger(doctorId) || doctorId <= 0) {
    return NextResponse.json({ error: "Missing doctorId" }, { status: 400 });
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

  const doctor = await prisma.doctor.findFirst({
    where: { AND: [{ id: doctorId }, doctorWhere] },
    include: {
      recordings: {
        include: { question: true, asset: true },
        orderBy: [{ question: { order: "asc" } }, { attemptNumber: "desc" }],
      },
    },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const latestByQuestion = new Map<string, (typeof doctor.recordings)[number]>();
  for (const recording of doctor.recordings) {
    const existing = latestByQuestion.get(recording.questionId);
    if (!existing || recording.attemptNumber > existing.attemptNumber) {
      latestByQuestion.set(recording.questionId, recording);
    }
  }
  const recordings = Array.from(latestByQuestion.values())
    .sort((a, b) => a.question.order - b.question.order)
    .slice(0, MAX_QUESTIONS);

  if (recordings.length === 0) {
    return NextResponse.json({ error: "No answers recorded yet" }, { status: 404 });
  }

  const { bucket } = getSpacesConfig();
  const client = getSpacesClient();

  // Exact sizes from storage so the ZIP gets a correct Content-Length (download progress).
  const files = await Promise.all(
    recordings.map(async (recording) => {
      const key = parseStorageKey(recording.asset.storageUrl);
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        key,
        name: recordingDownloadFilename(
          doctor.doctorCode,
          recording.question.order,
          recording.asset.mimeType,
          recording.asset.storageUrl,
        ),
        size: head.ContentLength ?? 0,
        lastModified: head.LastModified ?? recording.createdAt,
      };
    }),
  );

  async function* zipEntries() {
    for (const file of files) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: file.key }),
      );
      if (!result.Body) {
        throw new Error(`Missing object ${file.key}`);
      }
      const input =
        result.Body instanceof Readable
          ? (Readable.toWeb(result.Body) as ReadableStream<Uint8Array>)
          : (result.Body.transformToWebStream() as ReadableStream<Uint8Array>);
      yield {
        name: file.name,
        lastModified: file.lastModified,
        size: file.size,
        input,
      };
    }
  }

  const safePart = (value: string | null | undefined) =>
    (value ?? "").trim().replace(/[^a-zA-Z0-9.-]+/g, "_").replace(/^_+|_+$/g, "");
  const code = safePart(doctor.doctorCode) || "doctor";
  const name = safePart(doctor.doctorName);
  const zipName = name ? `${code}_${name}.zip` : `${code}.zip`;
  const length = predictLength(
    files.map((file) => ({ name: file.name, size: file.size })),
  );

  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set("Content-Disposition", `attachment; filename="${zipName}"`);
  headers.set("Content-Length", String(length));
  headers.set("Cache-Control", "private, no-store");

  return new Response(makeZip(zipEntries()), { headers });
}
