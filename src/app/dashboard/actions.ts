"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import {
  canApproveReject,
  canCreateDoctor,
  canDeleteRejected,
  doctorByIdWhere,
} from "@/lib/doctor-access";
import { generateDoctorThumb } from "@/lib/generate-doctor-thumb";
import { prisma } from "@/lib/prisma";
import { buildDoctorImageKey } from "@/lib/storage-keys";
import { deleteObject, normalizeStorageUrlForDb, uploadObject } from "@/lib/spaces";
import { createInterviewToken } from "@/lib/tokens";
import { doctorSchema } from "@/lib/validations";

export async function createDoctorInterview(formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!canCreateDoctor(session.user)) {
    redirect("/dashboard");
  }

  const parsed = doctorSchema.parse({
    doctorName: formData.get("doctorName"),
    doctorCode: formData.get("doctorCode"),
    specialty: formData.get("specialty"),
  });

  const imageFile = formData.get("image");
  const hasImage = imageFile instanceof File && imageFile.size > 0;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const employee = await prisma.employee.findUnique({
    where: { empEmployeeId: session.user.id },
  });

  const l1ManagerName = employee?.l1ManagerId
    ? (
        await prisma.employee.findUnique({
          where: { empEmployeeId: employee.l1ManagerId },
          select: { empName: true },
        })
      )?.empName ?? null
    : null;

  const doctor = await prisma.doctor.create({
    data: {
      doctorCode: parsed.doctorCode,
      doctorName: parsed.doctorName,
      specialty: parsed.specialty,
      imageUrl: null,
      thumbUrl: null,
      interviewToken: createInterviewToken(),
      interviewStatus: "SENT",
      postProductionStatus: "CREATED",
      createdByEmployeeId: session.user.id,
      empHeadquarters: employee?.empHeadquarters ?? null,
      region: employee?.region ?? null,
      l1Manager: l1ManagerName,
      l1ManagerId: employee?.l1ManagerId ?? null,
      expiresAt,
      podcastCreatedAt: new Date(),
    },
  });

  if (hasImage && imageFile instanceof File) {
    const mimeType = imageFile.type || "image/jpeg";
    const key = buildDoctorImageKey(
      doctor.id,
      parsed.doctorName,
      parsed.doctorCode,
      mimeType,
    );
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const storageUrl = normalizeStorageUrlForDb(
      await uploadObject({ key, body: buffer, mimeType }),
    );
    await prisma.doctor.update({
      where: { id: doctor.id },
      data: { imageUrl: storageUrl },
    });

    try {
      await generateDoctorThumb(doctor.id, { doctorImageBuffer: buffer });
    } catch (error) {
      console.error("[createDoctor] thumbnail generation failed", error);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  redirect("/dashboard");
}

export async function approveDoctor(doctorId: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  if (!canApproveReject(session.user)) {
    throw new Error("Not allowed to approve");
  }

  const doctor = await prisma.doctor.findFirst({
    where: {
      ...doctorByIdWhere(session.user, doctorId),
      postProductionStatus: "CREATED",
    },
    select: { id: true },
  });

  if (!doctor) {
    throw new Error("Doctor not found or not awaiting approval");
  }

  await prisma.doctor.update({
    where: { id: doctor.id },
    data: { postProductionStatus: "PROCESSING" },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/doctors/${doctorId}`);
  revalidatePath("/admin");
}

export async function rejectDoctor(doctorId: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  if (!canApproveReject(session.user)) {
    throw new Error("Not allowed to reject");
  }

  const doctor = await prisma.doctor.findFirst({
    where: {
      ...doctorByIdWhere(session.user, doctorId),
      postProductionStatus: "CREATED",
    },
    select: { id: true },
  });

  if (!doctor) {
    throw new Error("Doctor not found or not awaiting approval");
  }

  await prisma.doctor.update({
    where: { id: doctor.id },
    data: { postProductionStatus: "REJECTED" },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/doctors/${doctorId}`);
  revalidatePath("/admin");
}

export async function deleteRejectedDoctor(doctorId: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  if (!canDeleteRejected(session.user)) {
    throw new Error("Only Sales can delete rejected doctors");
  }

  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      createdByEmployeeId: session.user.id,
      postProductionStatus: "REJECTED",
    },
    include: {
      recordings: { include: { asset: true } },
      editedVideo: { include: { asset: true } },
      flyer: { include: { asset: true } },
    },
  });

  if (!doctor) {
    throw new Error("Rejected doctor not found");
  }

  const storageUrls = new Set<string>();
  if (doctor.imageUrl) storageUrls.add(doctor.imageUrl);
  if (doctor.thumbUrl) storageUrls.add(doctor.thumbUrl);
  for (const rec of doctor.recordings) {
    if (rec.asset?.storageUrl) storageUrls.add(rec.asset.storageUrl);
  }
  if (doctor.editedVideo?.storageUrl) {
    storageUrls.add(doctor.editedVideo.storageUrl);
  }
  if (doctor.editedVideo?.asset?.storageUrl) {
    storageUrls.add(doctor.editedVideo.asset.storageUrl);
  }
  if (doctor.flyer?.storageUrl) storageUrls.add(doctor.flyer.storageUrl);
  if (doctor.flyer?.asset?.storageUrl) {
    storageUrls.add(doctor.flyer.asset.storageUrl);
  }

  const assetIds = [
    ...doctor.recordings.map((r) => r.assetId),
    doctor.editedVideo?.assetId,
    doctor.flyer?.assetId,
  ].filter((id): id is string => Boolean(id));

  await prisma.$transaction(async (tx) => {
    await tx.answerRecording.deleteMany({ where: { doctorId } });
    await tx.editedVideo.deleteMany({ where: { doctorId } });
    await tx.flyer.deleteMany({ where: { doctorId } });
    if (assetIds.length) {
      await tx.asset.deleteMany({ where: { id: { in: assetIds } } });
    }
    await tx.asset.deleteMany({ where: { doctorId } });
    await tx.doctor.delete({ where: { id: doctorId } });
  });

  for (const url of storageUrls) {
    try {
      await deleteObject(url);
    } catch (error) {
      console.error("[deleteRejectedDoctor] storage cleanup", url, error);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin");
}
