import crypto from "node:crypto";

/** Root folder in DigitalOcean Spaces for this app */
export const STORAGE_ROOT = "doctor_live_podcast";

export const STORAGE_FOLDERS = {
  doctorImage: "Doctor image",
  recording: "recording",
  editVideo: "Edit video",
} as const;

export function sanitizeStorageSegment(value: string) {
  const normalized = value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized.slice(0, 80) || "doctor";
}

export function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return "bin";
}

function doctorFileLabel(
  doctorId: number,
  doctorName: string | null | undefined,
  doctorCode: string,
) {
  const namePart = sanitizeStorageSegment(doctorName ?? "doctor");
  const codePart = sanitizeStorageSegment(doctorCode);
  return `${doctorId}_${namePart}_${codePart}`;
}

/** doctor_live_podcast/Doctor image/{id}_{name}_{code}.{ext} */
export function buildDoctorImageKey(
  doctorId: number,
  doctorName: string,
  doctorCode: string,
  mimeType: string,
) {
  const extension = extensionForMimeType(mimeType);
  const label = doctorFileLabel(doctorId, doctorName, doctorCode);
  return `${STORAGE_ROOT}/${STORAGE_FOLDERS.doctorImage}/${label}.${extension}`;
}

/** doctor_live_podcast/recording/{doctorId}/q{order}_{questionId}_{timestamp}.{ext} */
export function buildRecordingKey(
  doctorId: number | string,
  questionId: string,
  questionOrder: number,
  mimeType: string,
) {
  const extension = extensionForMimeType(mimeType);
  const questionSlug = sanitizeStorageSegment(questionId).slice(0, 24);

  return [
    STORAGE_ROOT,
    STORAGE_FOLDERS.recording,
    String(doctorId),
    `q${questionOrder}_${questionSlug}_${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${extension}`,
  ].join("/");
}

/** doctor_live_podcast/Edit video/{id}_{name}_{code}_edited_{timestamp}.{ext} */
export function buildEditedVideoKey(
  doctorId: number,
  doctorName: string | null | undefined,
  doctorCode: string,
  mimeType: string,
) {
  const extension = extensionForMimeType(mimeType);
  const label = doctorFileLabel(doctorId, doctorName, doctorCode);

  return `${STORAGE_ROOT}/${STORAGE_FOLDERS.editVideo}/${label}_edited_${Date.now()}.${extension}`;
}

import { parseStorageKey } from "@/lib/spaces";

const LEGACY_RECORDING_PREFIX = "recordings/";

export function isRecordingKeyForDoctor(
  storageUrlOrKey: string,
  doctorId: number | string,
) {
  const key = parseStorageKey(storageUrlOrKey);
  const id = String(doctorId);
  const newPrefix = `${STORAGE_ROOT}/${STORAGE_FOLDERS.recording}/${id}/`;
  const legacyPrefix = `${LEGACY_RECORDING_PREFIX}${id}/`;
  return key.startsWith(newPrefix) || key.startsWith(legacyPrefix);
}
