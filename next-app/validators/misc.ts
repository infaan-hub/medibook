/**
 * Appointment + review + notification + blog validators — ports of the
 * remaining Django serializers (admin/catalog/treatments in validators/more.ts).
 */
import { z } from "zod";
import { drfBoolean, drfDate, drfInteger, drfTime, parse, REQUIRED } from "./base";

/** appointments.serializers.AppointmentSerializer (create payload). */
export const appointmentCreateSchema = z
  .object({
    doctor: drfInteger(),
    hospital: drfInteger().nullable().optional(),
    appointment_date: drfDate(),
    start_time: drfTime(),
    end_time: drfTime(),
    reason: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const norm = (t: string) => {
      const trimmed = t.trim();
      return (/^\d:\d/.test(trimmed) ? `0${trimmed}` : trimmed);
    };
    if (norm(data.end_time) <= norm(data.start_time)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_time"], message: "End time must be after start time." });
    }
  });

/** PATCH /api/appointments/{id}/ payload (status changes are rejected). */
export const appointmentPatchSchema = z
  .object({
    hospital: drfInteger().nullable().optional(),
    appointment_date: drfDate().optional(),
    start_time: drfTime().optional(),
    end_time: drfTime().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
    cancel_reason: z.string().max(1000, "Ensure this string has at most 1000 characters.").optional(),
    status: z.unknown().optional(),
  })
  .passthrough();

/** AppointmentStatusSerializer (confirm/complete/cancel/reject bodies). */
export const appointmentActionSchema = z
  .object({
    status: z.enum(["confirmed", "completed", "cancelled", "rejected"]),
    cancel_reason: z.string().max(1000, "Ensure this string has at most 1000 characters.").optional(),
    notes: z.string().optional(),
  })
  .passthrough();

/** reviews.serializers.ReviewSerializer (POST body: rating + comment). */
export const reviewCreateSchema = z
  .object({
    rating: z
      .union([z.string(), z.number()])
      .refine((v) => Number.isInteger(Number(v)), { message: "A valid integer is required." })
      .refine((v) => Number(v) >= 1, { message: "Ensure this value is greater than or equal to 1." })
      .refine((v) => Number(v) <= 5, { message: "Ensure this value is less than or equal to 5." })
      .transform((v) => Number(v)),
    comment: z.string().optional(),
  })
  .passthrough();

export const notificationPatchSchema = z.object({ is_read: drfBoolean.optional() }).passthrough();

/** notifications.serializers.PushSubscriptionSerializer. */
export const pushSubscriptionSchema = z
  .object({
    endpoint: z.string().min(1, REQUIRED).max(500, "Ensure this string has at most 500 characters.").url("Enter a valid URL."),
    p256dh_key: z.string().max(200, "Ensure this string has at most 200 characters.").optional(),
    auth_key: z.string().max(100, "Ensure this string has at most 100 characters.").optional(),
    fcm_token: z.string().max(300, "Ensure this string has at most 300 characters.").optional(),
    device_info: z.record(z.unknown()).optional(),
    is_active: drfBoolean.optional(),
  })
  .passthrough();

export const ARTICLE_CATEGORIES = [
  "health_tips", "wellness", "nutrition", "mental_health", "fitness", "general",
] as const;

/** blog ArticleCreateUpdateSerializer. */
export const articleSchema = z
  .object({
    title: z.string().min(1, REQUIRED).max(200, "Ensure this string has at most 200 characters."),
    slug: z.string().max(220, "Ensure this string has at most 220 characters.").optional(),
    excerpt: z.string().optional(),
    content: z.string().min(1, REQUIRED),
    category: z.enum(ARTICLE_CATEGORIES).optional(),
    published: drfBoolean.optional(),
    image: z.string().nullable().optional(),
  })
  .passthrough();

/** treatments.MedicalTreatmentCreateSerializer. */
export const treatmentCreateSchema = z
  .object({
    patient: drfInteger(),
    appointment: drfInteger().nullable().optional(),
    diagnosis: z.string().max(255, "Ensure this string has at most 255 characters.").optional(),
    treatment_notes: z.string().optional(),
    prescription: z.string().optional(),
    follow_up_date: drfDate().nullable().optional(),
    follow_up_notes: z.string().optional(),
  })
  .passthrough();

/** treatments.MedicalTreatmentSerializer PATCH payload (all writable fields). */
export const treatmentPatchSchema = z
  .object({
    doctor: drfInteger().optional(),
    patient: drfInteger().optional(),
    appointment: drfInteger().nullable().optional(),
    diagnosis: z.string().max(255, "Ensure this string has at most 255 characters.").optional(),
    treatment_notes: z.string().optional(),
    prescription: z.string().optional(),
    follow_up_date: drfDate().nullable().optional(),
    follow_up_notes: z.string().optional(),
  })
  .passthrough();

/** treatments.healthrecord create payload (multipart or JSON). */
export const healthRecordCreateSchema = z
  .object({
    patient: drfInteger(),
    appointment: drfInteger().nullable().optional(),
    record_type: z.enum(["lab_report", "prescription", "xray", "imaging", "other"]).optional(),
    title: z.string().min(1, REQUIRED).max(200, "Ensure this string has at most 200 characters."),
    description: z.string().optional(),
    file: z.unknown().optional(),
  })
  .passthrough();

/** blog ArticleListSerializer / ArticleDetailSerializer read shape */
export const articleReadSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    slug: z.string(),
    excerpt: z.string(),
    content: z.string(),
    category: z.string(),
    published: z.boolean(),
    image: z.string().nullable(),
    author: z.number(),
    author_name: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    published_at: z.string(),
  })
  .passthrough();

export { parse, drfBoolean, drfDate, drfInteger, drfTime, REQUIRED };


