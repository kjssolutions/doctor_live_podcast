import { z } from "zod";

function toTitleCaseWord(word: string) {
  return word
    .split("-")
    .map((part) =>
      part
        ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
        : part,
    )
    .join("-");
}

function toTitleCaseName(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map(toTitleCaseWord)
    .join(" ");
}

/** True when the user typed DR / Dr / dr / Doctor as a title. Names like Drashti are allowed. */
export function hasTypedDoctorTitle(name: string) {
  const trimmed = name.trim();
  return (
    /^(doctor|dr)\.(\s|$|[A-Za-z])/i.test(trimmed) ||
    /^(doctor|dr)\s+/i.test(trimmed) ||
    /^(doctor|dr)\.?$/i.test(trimmed)
  );
}

/** Remove typed DR / Dr / dr / Doctor titles. Do not strip names like Drashti. */
export function stripDoctorTitle(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(doctor|dr)\.?\s+/i, "")
    .replace(/^(doctor|dr)\.(?=[A-Za-z])/i, "");
}

/** Display/store as `DR. Name` in title case. Any input case is allowed. */
export function formatDoctorDisplayName(name: string) {
  const withoutTitle = stripDoctorTitle(name);
  if (!withoutTitle || /^(doctor|dr)\.?$/i.test(withoutTitle)) {
    return "";
  }

  return `DR. ${toTitleCaseName(withoutTitle)}`;
}

/** Always store doctor names as `DR. Name` in title case. */
export function withDoctorNamePrefix(name: string) {
  return formatDoctorDisplayName(name);
}

export const DOCTOR_NAME_TITLE_ERROR =
  "Do not type DR / Dr / dr. Enter only the name.";

export const doctorSchema = z.object({
  doctorName: z
    .string()
    .trim()
    .min(1, "Doctor name is required")
    .refine((value) => !hasTypedDoctorTitle(value), {
      message: DOCTOR_NAME_TITLE_ERROR,
    })
    .transform((name) => `DR. ${toTitleCaseName(name)}`),
  doctorCode: z.string().trim().min(1, "Doctor code is required"),
  specialty: z.string().trim().min(1, "Specialty is required"),
});

export const signUploadSchema = z.object({
  token: z.string().min(20),
  questionId: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(250 * 1024 * 1024),
});

export const finalizeRecordingSchema = signUploadSchema.extend({
  key: z.string().min(1),
  durationSeconds: z.number().int().positive().optional(),
});
