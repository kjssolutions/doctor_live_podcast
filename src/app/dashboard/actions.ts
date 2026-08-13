"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { canCreateDoctor } from "@/lib/doctor-access";
import { generateDoctorThumb } from "@/lib/generate-doctor-thumb";
import { prisma } from "@/lib/prisma";
import { buildDoctorImageKey } from "@/lib/storage-keys";
import { normalizeStorageUrlForDb, uploadObject } from "@/lib/spaces";
import { createInterviewToken } from "@/lib/tokens";
import { doctorSchema } from "@/lib/validations";

export type CreateDoctorState = {
  error?: string;
  nameError?: string;
};

export async function createDoctorInterview(
  _prev: CreateDoctorState,
  formData: FormData,
): Promise<CreateDoctorState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!canCreateDoctor(session.user)) {
    redirect("/dashboard");
  }

  const parsedResult = doctorSchema.safeParse({
    doctorName: formData.get("doctorName"),
    doctorCode: formData.get("doctorCode"),
    specialty: formData.get("specialty"),
  });

  if (!parsedResult.success) {
    const issue = parsedResult.error.issues[0];
    if (issue?.path[0] === "doctorName") {
      return { nameError: issue.message };
    }

    return {
      error: issue?.message ?? "Please check the form fields.",
    };
  }

  const parsed = parsedResult.data;
  const doctorCode = parsed.doctorCode.trim();

  const existing = await prisma.doctor.findFirst({
    where: { doctorCode },
    select: { id: true },
  });

  if (existing) {
    return {
      error: "This doctor code already exists. Please enter a different code.",
    };
  }

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

  let doctor;
  try {
    doctor = await prisma.doctor.create({
      data: {
        doctorCode,
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
  } catch (error) {
    console.error("[createDoctor]", error);
    return {
      error: "This doctor code already exists. Please enter a different code.",
    };
  }

  if (hasImage && imageFile instanceof File) {
    const mimeType = imageFile.type || "image/jpeg";
    const key = buildDoctorImageKey(
      doctor.id,
      parsed.doctorName,
      doctorCode,
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
