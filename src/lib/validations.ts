import { z } from "zod";

export const doctorSchema = z.object({
  doctorName: z.string().trim().min(2, "Doctor name is required"),
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
