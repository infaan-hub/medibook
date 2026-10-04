/**
 * Authentication validators — port of accounts/serializers.py.
 * Field names, optionality and messages mirror the Django serializers.
 */
import { z } from "zod";
import { blankable, drfDate, drfTime, parse, REQUIRED } from "./base";

export const registerSchema = z
  .object({
    username: z.string().trim().min(1, REQUIRED).max(150, "Ensure this string has at most 150 characters."),
    email: z.string().trim().min(1, REQUIRED).email("Enter a valid email address."),
    password: z
      .string()
      .min(1, REQUIRED)
      .min(8, "Ensure this field has at least 8 characters.")
      .max(128, "Ensure this field has at most 128 characters."),
    password_confirm: z
      .string()
      .min(1, REQUIRED)
      .min(8, "Ensure this field has at least 8 characters.")
      .max(128, "Ensure this field has at most 128 characters."),
    phone: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    role: z.enum(["patient", "doctor"]).optional(),
  })
  .strict()
  .passthrough();

export const loginSchema = z
  .object({
    username: z.string().trim().min(1, REQUIRED),
    password: z.string().min(1, REQUIRED),
  })
  .passthrough();

export const logoutSchema = z.object({ refresh: z.string().min(1, REQUIRED) }).passthrough();

export const refreshSchema = z.object({ refresh: z.string().min(1, REQUIRED) }).passthrough();

export const passwordChangeSchema = z
  .object({
    old_password: z.string().min(1, REQUIRED),
    new_password: z
      .string()
      .min(1, REQUIRED)
      .min(8, "Ensure this field has at least 8 characters.")
      .max(128, "Ensure this field has at most 128 characters."),
    new_password_confirm: z
      .string()
      .min(1, REQUIRED)
      .min(8, "Ensure this field has at least 8 characters.")
      .max(128, "Ensure this field has at most 128 characters."),
  })
  .passthrough();

export const passwordResetRequestSchema = z
  .object({ email: z.string().trim().min(1, REQUIRED).email("Enter a valid email address.") })
  .passthrough();

export const passwordResetConfirmSchema = z
  .object({
    token: z.string().min(1, REQUIRED).max(128, "Ensure this string has at most 128 characters."),
    new_password: z
      .string()
      .min(1, REQUIRED)
      .min(8, "Ensure this field has at least 8 characters.")
      .max(128, "Ensure this field has at most 128 characters."),
    new_password_confirm: z
      .string()
      .min(1, REQUIRED)
      .min(8, "Ensure this field has at least 8 characters.")
      .max(128, "Ensure this field has at most 128 characters."),
  })
  .passthrough();

export const socialLoginSchema = z.object({}).passthrough(); // shape checked manually (provider/token)

export const updateMeSchema = z
  .object({
    phone: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    profile_image: z.string().nullable().optional(),
  })
  .passthrough();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export { parse, drfDate, drfTime, blankable };
