"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/spaces";
import { createInterviewToken } from "@/lib/tokens";
import { doctorSchema } from "@/lib/validations";

function imageExtension(file: File) {
  if (file.type.includes("png")) {
    return "png";
  }
  if (file.type.includes("jpeg") || file.type.includes("jpg")) {
    return "jpg";
  }
  if (file.type.includes("webp")) {
    return "webp";
  }
  return "jpg";
}

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

  let imageUrl: string | null = null;
  const imageFile = formData.get("image");

  if (imageFile instanceof File && imageFile.size > 0) {
    const extension = imageExtension(imageFile);
    const key = `doctors/${parsed.doctorCode.trim()}-${Date.now()}.${extension}`;
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    await uploadObject({
      key,
      body: buffer,
      mimeType: imageFile.type || "image/jpeg",
    });
    imageUrl = key;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const employee = await prisma.employee.findUnique({
    where: { empEmployeeId: session.user.id },
  });

  await prisma.doctor.create({
    data: {
      doctorCode: parsed.doctorCode,
      doctorName: parsed.doctorName,
      specialty: parsed.specialty,
      imageUrl,
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

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
