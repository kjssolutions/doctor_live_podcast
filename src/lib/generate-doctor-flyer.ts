import { doctorAssetSnapshot } from "@/lib/doctor-asset-fields";
import { renderDoctorFlyer } from "@/lib/flyer-template";
import { prisma } from "@/lib/prisma";
import { buildFlyerKey } from "@/lib/storage-keys";
import { deleteObject, uploadObject } from "@/lib/spaces";

export async function deleteDoctorFlyer(doctorId: number) {
  const existing = await prisma.flyer.findUnique({
    where: { doctorId },
    include: { asset: true },
  });

  if (!existing) {
    return;
  }

  try {
    await deleteObject(existing.asset.storageUrl);
  } catch (error) {
    console.error("[flyer/delete] storage cleanup failed", error);
  }

  await prisma.$transaction([
    prisma.flyer.delete({ where: { id: existing.id } }),
    prisma.asset.delete({ where: { id: existing.assetId } }),
  ]);
}

export async function generateDoctorFlyer(doctorId: number) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { flyer: { include: { asset: true } } },
  });

  if (!doctor) {
    throw new Error("Doctor not found");
  }

  if (!doctor.spotifyUrl) {
    throw new Error("Spotify URL is required to generate a flyer");
  }

  const jpegBuffer = await renderDoctorFlyer({
    doctorName: doctor.doctorName ?? doctor.doctorCode,
    spotifyUrl: doctor.spotifyUrl,
    doctorImageUrl: doctor.imageUrl,
  });

  const key = buildFlyerKey(doctor.id, doctor.doctorName, doctor.doctorCode);
  const storageUrl = await uploadObject({
    key,
    body: jpegBuffer,
    mimeType: "image/jpeg",
  });

  const snapshot = doctorAssetSnapshot(doctor);
  const assetPayload = {
    ...snapshot,
    assetKind: "FLYER" as const,
    storageUrl,
    mimeType: "image/jpeg",
    sizeBytes: jpegBuffer.length,
    durationSeconds: null,
  };

  if (doctor.flyer) {
    const previousStorageUrl = doctor.flyer.asset.storageUrl;

    await prisma.asset.update({
      where: { id: doctor.flyer.assetId },
      data: assetPayload,
    });

    await prisma.flyer.update({
      where: { doctorId: doctor.id },
      data: {
        doctorCode: snapshot.doctorCode,
        doctorName: snapshot.doctorName,
        spotifyUrl: doctor.spotifyUrl,
        storageUrl,
      },
    });

    if (previousStorageUrl !== storageUrl) {
      try {
        await deleteObject(previousStorageUrl);
      } catch (error) {
        console.error("[flyer/generate] old storage cleanup failed", error);
      }
    }

    return prisma.flyer.findUniqueOrThrow({
      where: { doctorId: doctor.id },
      select: { id: true, storageUrl: true, spotifyUrl: true },
    });
  }

  const asset = await prisma.asset.create({
    data: assetPayload,
    select: { id: true },
  });

  const flyer = await prisma.flyer.create({
    data: {
      doctorId: doctor.id,
      doctorCode: snapshot.doctorCode,
      doctorName: snapshot.doctorName,
      assetId: asset.id,
      spotifyUrl: doctor.spotifyUrl,
      storageUrl,
    },
    select: { id: true, storageUrl: true, spotifyUrl: true },
  });

  return flyer;
}
