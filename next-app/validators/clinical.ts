/**
 * Clinical validators — structured e-prescriptions (phase 1), vitals
 * (phase 2) and lab orders (phase 3).
 *
 * Every schema stays DRF-shaped through `parse()` from validators/base, so
 * failures surface as the same { field: ["message"] } envelope the rest of
 * the API emits.
 */
import { z } from "zod";
import { drfDate, drfInteger, REQUIRED } from "./base";

/** Upper bound on medication lines per prescription (keeps payloads sane). */
export const PRESCRIPTION_MAX_ITEMS = 30;

/** Nullable integer: null / "" / undefined → null, otherwise an int in range. */
export const nullableInt = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === null || String(value).trim() === "") return null;
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A valid integer is required." });
        return z.NEVER;
      }
      if (parsed < min || parsed > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Ensure this value is greater than or equal to ${min}.`,
        });
        return z.NEVER;
      }
      return parsed;
    });

/** One medication line: the drug name is the only required field. */
export const prescriptionItemSchema = z
  .object({
    medication: z
      .string()
      .trim()
      .min(1, REQUIRED)
      .max(200, "Ensure this string has at most 200 characters."),
    dosage: z.string().max(100, "Ensure this string has at most 100 characters.").optional(),
    frequency: z.string().max(100, "Ensure this string has at most 100 characters.").optional(),
    route: z.string().max(50, "Ensure this string has at most 50 characters.").optional(),
    duration_days: nullableInt(1, 365),
    refills: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value, ctx) => {
        if (value === undefined || String(value).trim() === "") return 0;
        const parsed = Number(value);
        if (!Number.isInteger(parsed)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A valid integer is required." });
          return z.NEVER;
        }
        if (parsed < 0 || parsed > 12) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Ensure this value is between 0 and 12 refills.",
          });
          return z.NEVER;
        }
        return parsed;
      }),
    instructions: z.string().max(500, "Ensure this string has at most 500 characters.").optional(),
  })
  .passthrough();

/**
 * Ordered medication lines. No lower bound here: a treatment may carry an
 * empty list (the doctor removed every line), while `POST /api/prescriptions/`
 * tightens it to at least one.
 */
export const prescriptionItemsList = z
  .array(prescriptionItemSchema)
  .max(
    PRESCRIPTION_MAX_ITEMS,
    `A prescription can hold at most ${PRESCRIPTION_MAX_ITEMS} medications.`
  );

/** POST /api/prescriptions/ and POST /api/treatments/ (`items` payload). */
export const prescriptionItemsField = prescriptionItemsList.optional();

export const prescriptionCreateSchema = z
  .object({
    patient: drfInteger(),
    appointment: drfInteger().nullable().optional(),
    treatment: drfInteger().nullable().optional(),
    notes: z.string().max(2000, "Ensure this string has at most 2000 characters.").optional(),
    items: prescriptionItemsList.min(1, "Add at least one medication."),
  })
  .passthrough();

/** PATCH /api/prescriptions/{id}/ — every field optional, items fully replace. */
export const prescriptionPatchSchema = z
  .object({
    notes: z.string().max(2000, "Ensure this string has at most 2000 characters.").optional(),
    items: prescriptionItemsList.optional(),
  })
  .passthrough();

/* --------------------------------- Vitals --------------------------------- */

export const vitalsCreateSchema = z
  .object({
    patient: drfInteger().optional(),
    appointment: drfInteger().nullable().optional(),
    systolic_bp: nullableInt(20, 300),
    diastolic_bp: nullableInt(10, 200),
    pulse_bpm: nullableInt(20, 300),
    temperature_c: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .transform((value, ctx) => {
        if (value === undefined || value === null || String(value).trim() === "") return null;
        const parsed = Number(value);
        if (Number.isNaN(parsed) || parsed < 25 || parsed > 45) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a temperature between 25 and 45 °C." });
          return z.NEVER;
        }
        return Math.round(parsed * 10) / 10;
      }),
    glucose_mg_dl: nullableInt(10, 1000),
    weight_kg: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .transform((value, ctx) => {
        if (value === undefined || value === null || String(value).trim() === "") return null;
        const parsed = Number(value);
        if (Number.isNaN(parsed) || parsed < 1 || 400 < parsed) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a weight between 1 and 400 kg." });
          return z.NEVER;
        }
        return Math.round(parsed * 10) / 10;
      }),
    height_cm: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .transform((value, ctx) => {
        if (value === undefined || value === null || String(value).trim() === "") return null;
        const parsed = Number(value);
        if (Number.isNaN(parsed) || parsed < 30 || 250 < parsed) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a height between 30 and 250 cm." });
          return z.NEVER;
        }
        return Math.round(parsed * 10) / 10;
      }),
    spo2_percent: nullableInt(40, 100),
    notes: z.string().max(1000, "Ensure this string has at most 1000 characters.").optional(),
    recorded_at: z
      .string()
      .optional()
      .transform((value, ctx) => {
        // Blank comes back from date inputs that were never touched.
        if (value === undefined || value.trim() === "") return undefined;
        if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date has wrong format." });
          return z.NEVER;
        }
        return value;
      }),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const present = [
      data.systolic_bp,
      data.diastolic_bp,
      data.pulse_bpm,
      data.temperature_c,
      data.glucose_mg_dl,
      data.weight_kg,
      data.height_cm,
      data.spo2_percent,
    ].some((value) => value !== null && value !== undefined);
    if (!present) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["non_field_errors"],
        message: "Record at least one measurement.",
      });
    }
    const hasSystolic = data.systolic_bp !== null && data.systolic_bp !== undefined;
    const hasDiastolic = data.diastolic_bp !== null && data.diastolic_bp !== undefined;
    if (hasSystolic !== hasDiastolic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["systolic_bp"],
        message: "Systolic and diastolic blood pressure are recorded together.",
      });
    }
    if (hasSystolic && (data.systolic_bp as number) <= (data.diastolic_bp as number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["systolic_bp"],
        message: "Systolic pressure must be higher than diastolic.",
      });
    }
  });

/* -------------------------------- Lab orders ------------------------------- */

export const LAB_ORDER_STATUSES = ["ordered", "in_progress", "resulted", "cancelled"] as const;

export const labOrderCreateSchema = z
  .object({
    patient: drfInteger(),
    appointment: drfInteger().nullable().optional(),
    test_name: z
      .string()
      .trim()
      .min(1, REQUIRED)
      .max(200, "Ensure this string has at most 200 characters."),
    result_due_date: drfDate(),
    unit: z.string().max(30, "Ensure this string has at most 30 characters.").optional(),
    reference_min: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .transform((value, ctx) => {
        if (value === undefined || value === null || String(value).trim() === "") return null;
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid number." });
          return z.NEVER;
        }
        return parsed;
      }),
    reference_max: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .transform((value, ctx) => {
        if (value === undefined || value === null || String(value).trim() === "") return null;
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid number." });
          return z.NEVER;
        }
        return parsed;
      }),
    notes: z.string().max(1000, "Ensure this string has at most 1000 characters.").optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (
      data.reference_min !== null &&
      data.reference_min !== undefined &&
      data.reference_max !== null &&
      data.reference_max !== undefined &&
      data.reference_min > data.reference_max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reference_min"],
        message: "Minimum reference value must not exceed the maximum.",
      });
    }
  });

export const labOrderPatchSchema = z
  .object({
    status: z.enum(LAB_ORDER_STATUSES).optional(),
    result_value: z
      .string()
      .max(200, "Ensure this string has at most 200 characters.")
      .optional(),
    result_notes: z.string().max(2000, "Ensure this string has at most 2000 characters.").optional(),
    notes: z.string().max(1000, "Ensure this string has at most 1000 characters.").optional(),
  })
  .passthrough();
