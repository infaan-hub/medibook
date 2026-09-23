/**
 * Clinical + scheduling validators — port of patients/serializers.py and
 * doctors/serializers.py validation rules.
 */
import { z } from "zod";
import { drfDate, drfTime, parse, REQUIRED } from "./base";

export const patientProfileSchema = z
  .object({
    date_of_birth: drfDate().nullable().optional(),
    gender: z.enum(["", "male", "female", "other"]).optional(),
    address: z.string().optional(),
    city: z.string().max(100, "Ensure this string has at most 100 characters.").optional(),
    emergency_contact_name: z.string().max(150, "Ensure this string has at most 150 characters.").optional(),
    emergency_contact_phone: z.string().max(16, "Ensure this string has at most 16 characters.").optional(),
    blood_group: z.string().max(5, "Ensure this string has at most 5 characters.").optional(),
    allergies: z.string().optional(),
    medical_history: z.string().optional(),
    reminder_preferences: z.record(z.unknown()).optional(),
  })
  .passthrough();

const timePairRefine = (data: { start_time?: string | null; end_time?: string | null }, ctx: z.RefinementCtx) => {
  const start = data.start_time ? data.start_time.trim() : "";
  const end = data.end_time ? data.end_time.trim() : "";
  if (!start || !end) return;
  const norm = (t: string) => (/^\d:\d/.test(t) ? `0${t}` : t);
  if (norm(end) <= norm(start)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["end_time"],
      message: "End time must be after start time.",
    });
  }
};

/** doctors.serializers.AvailabilitySerializer. */
export const availabilitySchema = z
  .object({
    weekday: z
      .union([z.string(), z.number()])
      .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 6, {
        message: "Ensure this value is greater than or equal to 0 and less than or equal to 6.",
      })
      .transform((v) => Number(v)),
    start_time: drfTime(),
    end_time: drfTime(),
    slot_duration_minutes: z
      .union([z.string(), z.number()])
      .optional()
      .refine((v) => v === undefined || (Number.isInteger(Number(v)) && Number(v) >= 5 && Number(v) <= 480), {
        message: "Ensure this value is greater than or equal to 5 and less than or equal to 480.",
      })
      .transform((v) => (v === undefined ? undefined : Number(v))),
    is_active: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => v === undefined ? v : v === true || v === "true" || v === "True" ? true : false),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const start = (data.start_time ?? "").trim();
    const end = (data.end_time ?? "").trim();
    if (start && end) {
      const norm = (t: string) => (/^\d:\d/.test(t) ? `0${t}` : t);
      if (norm(end) <= norm(start)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_time"], message: "End time must be after start time." });
      }
    }
  });

/** doctors.serializers.AvailabilityBreakSerializer (window bounds checked in service). */
export const breakSchema = z
  .object({ start_time: drfTime(), end_time: drfTime() })
  .passthrough()
  .superRefine((data, ctx) => timePairRefine(data, ctx));

/** doctors.serializers.ScheduleExceptionSerializer — both times or neither. */
export const scheduleExceptionSchema = z
  .object({
    date: drfDate(),
    start_time: drfTime().nullable().optional(),
    end_time: drfTime().nullable().optional(),
    reason: z.string().max(255, "Ensure this string has at most 255 characters.").optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const hasStart = data.start_time !== undefined && data.start_time !== null && String(data.start_time).trim() !== "";
    const hasEnd = data.end_time !== undefined && data.end_time !== null && String(data.end_time).trim() !== "";
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide both start_time and end_time, or neither for a full-day closure.",
      });
      return;
    }
    timePairRefine({ start_time: hasStart ? String(data.start_time) : "", end_time: hasEnd ? String(data.end_time) : "" }, ctx);
  });

/** doctors write payload (DoctorWriteSerializer / my-profile PATCH extras). */
export const doctorWriteSchema = z
  .object({
    specialties: z.array(z.union([z.number(), z.string()])).optional(),
    hospitals: z.array(z.union([z.number(), z.string()])).optional(),
    qualifications: z.string().optional(),
    experience_years: z
      .union([z.string(), z.number()])
      .optional()
      .refine((v) => v === undefined || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 80), {
        message: "Ensure this value is greater than or equal to 0 and less than or equal to 80.",
      })
      .transform((v) => (v === undefined ? undefined : Number(v))),
    consultation_fee: z
      .union([z.string(), z.number()])
      .optional()
      .refine((v) => {
        if (v === undefined || v === "") return true;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return false;
        const decimals = String(v).split(".")[1];
        return decimals === undefined || decimals.length <= 2;
      }, { message: "A valid number is required." })
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
    bio: z.string().optional(),
    city: z.string().max(100, "Ensure this string has at most 100 characters.").optional(),
    office_address: z.string().optional(),
    is_available: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => (v === undefined ? v : v === true || v === "true" || v === "True")),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  })
  .passthrough();

export { parse, REQUIRED };
