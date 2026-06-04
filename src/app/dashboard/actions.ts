"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDoctorImageKey } from "@/lib/storage-keys";
import { normalizeStorageUrlForDb, uploadObject } from "@/lib/spaces";
import { createInterviewToken } from "@/lib/tokens";
import { doctorSchema } from "@/lib/validations";

export async function createDoctorInterview(formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
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

  const doctor = await prisma.doctor.create({
    data: {
      doctorCode: parsed.doctorCode,
      doctorName: parsed.doctorName,
      specialty: parsed.specialty,
      imageUrl: null,
      interviewToken: createInterviewToken(),
      interviewStatus: "SENT",
      createdByEmployeeId: session.user.id,
      empHeadquarters: employee?.empHeadquarters ?? null,
      region: employee?.region ?? null,
      l1Manager: employee?.l1Manager ?? null,
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
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
