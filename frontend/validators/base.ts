/**
 * Validation core — Zod schemas produce the exact field-error messages Django
 * REST Framework emitted, so error envelopes stay byte-compatible:
 *
 *   { success: false, message: "The request could not be processed.",
 *     errors: { field: ["DRF-style message"] } }
 */
import { z } from "zod";
import { ValidationError, type FieldErrors } from "@/lib/errors";

export const REQUIRED = "This field may not be blank.";
export const MISSING = "This field is required.";

/** Maps Zod issues onto Django REST Framework field messages. */
export const drfErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined") return { message: MISSING };
      if (issue.received === "null") return { message: "This field may not be null." };
      if (issue.expected === "integer") return { message: "A valid integer is required." };
      if (issue.expected === "boolean") return { message: "Must be a valid boolean." };
      if (issue.expected === "string") return { message: "Not a valid string." };
      return { message: ctx.defaultError };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `"${String(issue.received)}" is not a valid choice.` };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Enter a valid email address." };
      if (issue.validation === "url") return { message: "Enter a valid URL." };
      return { message: ctx.defaultError };
    case z.ZodIssueCode.too_small:
      if (issue.type === "string") {
        if (issue.minimum === 1) return { message: REQUIRED };
        if (issue.minimum === 8) return { message: "Ensure this field has at least 8 characters." };
        return { message: `Ensure this string has at least ${issue.minimum} characters.` };
      }
      if (issue.type === "number") {
        return { message: `Ensure this value is greater than or equal to ${issue.minimum}.` };
      }
      return { message: ctx.defaultError };
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") {
        if (issue.maximum === 128) return { message: "Ensure this field has at most 128 characters." };
        return { message: `Ensure this string has at most ${issue.maximum} characters.` };
      }
      if (issue.type === "number") {
        return { message: `Ensure this value is less than or equal to ${issue.maximum}.` };
      }
      return { message: ctx.defaultError };
    default:
      return { message: ctx.defaultError };
  }
};

/** Parses `data`, throwing a DRF-shaped ValidationError on failure. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data, { errorMap: drfErrorMap });
  if (!result.success) {
    const errors: FieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path.length > 0 ? String(issue.path[0]) : "non_field_errors";
      if (!errors[field]) errors[field] = [];
      if (!errors[field].includes(issue.message)) errors[field].push(issue.message);
    }
    throw new ValidationError(errors);
  }
  return result.data as z.infer<T>;
}

/** Throws a field error directly (mirrors raising serializers.ValidationError). */
export const fieldError = (field: string, message: string): never => {
  throw new ValidationError({ [field]: [message] });
};

export const nonFieldError = (message: string): never => {
  throw new ValidationError({ non_field_errors: [message] });
};

/** DRF DateField: strict YYYY-MM-DD calendar date. */
export const drfDate = (message = "Date has wrong format. Use YYYY-MM-DD.") =>
  z
    .string()
    .refine(
      (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [y, m, d] = value.split("-").map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        return (
          date.getUTCFullYear() === y &&
          date.getUTCMonth() === m - 1 &&
          date.getUTCDate() === d
        );
      },
      { message }
    );

/** DRF TimeField: accepts H(H):MM(:SS), returns normalized "HH:MM:SS". */
export const drfTime = (
  message = "Time has wrong format. Use one of these formats: HH:MM:SS."
) =>
  z
    .string()
    .refine((value) => /^(\d{1,2}):(\d{2})(:\d{2})?$/.test(value.trim()), { message });

/** Loose integer field with DRF's parse-failure message. */
export const drfInteger = () =>
  z
    .union([z.string(), z.number()])
    .refine((value) => String(value).trim() !== "" && Number.isInteger(Number(value)), {
      message: "A valid integer is required.",
    })
    .transform((value) => Number(value));

/** DRF BooleanField. */
export const drfBoolean = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  if (typeof value === "boolean") return value;
  const normalized = value.trim().toLowerCase();
  if (["true", "1"].includes(normalized)) return true;
  if (["false", "0"].includes(normalized)) return false;
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be a valid boolean." });
  return z.NEVER;
});

/** Non-blank optional string (blank allowed → returns ""). */
export const blankable = () => z.string();
