/**
 * Output serialization helpers — replicate Django REST Framework's field
 * rendering so API payloads keep the exact shapes the frontend already
 * consumes (iso-8601 datetimes, "YYYY-MM-DD" dates, "HH:MM:SS" times,
 * fixed 2-decimal decimal strings).
 */
import { Prisma } from "@prisma/client";

/** DRF DateTimeField iso-8601 (JS toISOString — same parseable format). */
export const iso = (value?: Date | string | null): string | null => {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
};

/** DRF DateField "YYYY-MM-DD". */
export const dateStr = (value?: Date | string | null): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
};

/** DRF TimeField serializes to "HH:MM:SS" — our columns already store that. */
export const timeStr = (value?: string | null): string | null => value ?? null;

/** DRF DecimalField coerces to a fixed 2-decimal string ("4.50", "0.00"). */
export const dec2 = (
  value: Prisma.Decimal | number | string | null | undefined
): string | null => {
  if (value === null || value === undefined) return null;
  return Number(value).toFixed(2);
};

/**
 * Absolute media URL (Django: request.build_absolute_uri on FileField.url).
 * Files are served by app/media/[...path]/route.ts at /media/<relative path>.
 */
export function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const forwarded = req.headers.get("x-forwarded-proto");
  const proto = forwarded ?? (url.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}

export const mediaUrl = (req: Request, relative?: string | null): string | null =>
  relative ? `${originOf(req)}/media/${relative.replace(/^\/+/, "")}` : null;
