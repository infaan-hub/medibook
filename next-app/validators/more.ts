/**
 * Admin (reports/views.py) + catalog + treatment-health validators.
 */
import { z } from "zod";
import { drfDate, drfInteger, parse, REQUIRED } from "./base";

/** reports AdminUserCreateSerializer (role limited to patient|doctor). */
export const adminUserCreateSchema = z
  .object({
    username: z.string().trim().min(1, REQUIRED).max(60, "Ensure this string has at most 60 characters."),
    email: z.string().trim().min(1, REQUIRED).email("Enter a valid email address."),
    password: z
      .string()
      .min(1, REQUIRED)
      .min(8, "Ensure this field has at least 8 characters.")
      .max(128, "Ensure this field has at most 128 characters."),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    phone: z.string().optional(),
    role: z.enum(["patient", "doctor"]),
  })
  .passthrough();

/** reports AdminDoctorCreateSerializer. */
export const adminDoctorCreateSchema = z
  .object({
    username: z.string().trim().min(1, REQUIRED).max(60, "Ensure this string has at most 60 characters."),
    email: z.string().trim().min(1, REQUIRED).email("Enter a valid email address."),
    password: z
      .string()
      .min(1, REQUIRED)
      .min(8, "Ensure this field has at least 8 characters.")
      .max(128, "Ensure this field has at most 128 characters."),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    qualifications: z.string().optional(),
    experience_years: z
      .union([z.string(), z.number()])
      .optional()
      .refine((v) => v === undefined || (Number.isInteger(Number(v)) && Number(v) >= 0), {
        message: "Ensure this value is greater than or equal to 0.",
      })
      .transform((v) => (v === undefined ? 0 : Number(v))),
    consultation_fee: z
      .union([z.string(), z.number()])
      .optional()
      .refine((v) => {
        if (v === undefined || v === "") return true;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return false;
        const decimals = String(v).split(".")[1];
        return decimals === undefined || decimals.length <= 2;
      }, { message: "Ensure this number has at most 2 decimal places." })
      .transform((v) => (v === undefined ? 0 : Number(v))),
    bio: z.string().optional(),
    city: z.string().max(100, "Ensure this string has at most 100 characters.").optional(),
    office_address: z.string().optional(),
  })
  .passthrough();

/** specialties.specialty create/update payload. */
export const specialtyWriteSchema = z
  .object({
    name: z.string().min(1, REQUIRED).max(100, "Ensure this string has at most 100 characters."),
    patient_friendly_name: z.string().max(150, "Ensure this string has at most 150 characters.").optional(),
    description: z.string().optional(),
    what_to_expect: z.string().optional(),
    icon_url: z.string().max(200, "Ensure this string has at most 200 characters.").optional(),
  })
  .passthrough();

/** hospitals.hospital create/update payload. */
export const hospitalWriteSchema = z
  .object({
    name: z.string().min(1, REQUIRED).max(200, "Ensure this string has at most 200 characters."),
    city: z.string().min(1, REQUIRED).max(100, "Ensure this string has at most 100 characters."),
    address: z.string().optional(),
    phone: z.string().max(16, "Ensure this string has at most 16 characters.").optional(),
    email: z.string().email("Enter a valid email address.").or(z.literal("")).optional(),
    location_details: z.record(z.unknown()).optional(),
  })
  .passthrough();

export { parse, drfInteger, drfDate };
