import { renderDoctorThumb } from "@/lib/thumb-template";
import { prisma } from "@/lib/prisma";
import { buildThumbnailKey } from "@/lib/storage-keys";
import { deleteObject, normalizeStorageUrlForDb, uploadObject } from "@/lib/spaces";

/**
 * Generate podcast thumb, upload to Spaces, store full URL on doctor_table.thumb_url.
 */
export async function generateDoctorThumb(
  doctorId: number,
  options?: { doctorImageBuffer?: Buffer | null },
) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
  });

  if (!doctor) {
    throw new Error("Doctor not found");
  }

  if (!options?.doctorImageBuffer && !doctor.imageUrl) {
    throw new Error("Doctor photo is required to generate a thumbnail");
  }

  const jpegBuffer = await renderDoctorThumb({
    doctorImageUrl: doctor.imageUrl,
    doctorImageBuffer: options?.doctorImageBuffer,
  });

  const key = buildThumbnailKey(doctor.id, doctor.doctorName, doctor.doctorCode);
  const storageUrl = normalizeStorageUrlForDb(
    await uploadObject({
      key,
      body: jpegBuffer,
      mimeType: "image/jpeg",
    }),
  );

  const previousThumbUrl = doctor.thumbUrl;

  await prisma.doctor.update({
    where: { id: doctor.id },
    data: { thumbUrl: storageUrl },
  });

  if (previousThumbUrl && previousThumbUrl !== storageUrl) {
    try {
      await deleteObject(previousThumbUrl);
    } catch (error) {
      console.error("[thumb/generate] old storage cleanup failed", error);
    }
  }

  return { thumbUrl: storageUrl };
}
