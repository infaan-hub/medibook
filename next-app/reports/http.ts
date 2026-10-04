/**
 * HTTP helpers for the report endpoints — query parsing and the binary PDF
 * response. Kept separate from the renderers so the PDF layer stays pure.
 */
import type { PeriodQuery } from "./data/period";

/** Read the reporting-period query parameters from a request. */
export function periodQueryFrom(req: Request): PeriodQuery {
  const params = new URL(req.url).searchParams;
  return {
    preset: params.get("preset"),
    from: params.get("from"),
    to: params.get("to"),
    month: params.get("month"),
  };
}

/** Filename-safe slug (never trusts user input verbatim). */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Compact, human-readable period token for a download filename:
 *   month    → "September 2026"
 *   same m/y → "September 2026"
 *   same year→ "January-March 2026"
 *   otherwise → "2026-01-05 to 2026-03-01"
 */
export function periodToken(period: { start: string; end: string }): string {
  const [startYear, startMonth] = period.start.split("-");
  const [endYear, endMonth] = period.end.split("-");
  if (startYear === endYear && startMonth === endMonth) {
    return `${MONTH_NAMES[Number(startMonth) - 1]} ${startYear}`;
  }
  if (startYear === endYear) {
    return `${MONTH_NAMES[Number(startMonth) - 1]}-${MONTH_NAMES[Number(endMonth) - 1]} ${startYear}`;
  }
  return `${period.start} to ${period.end}`;
}

/**
 * Build the download filename: `MediBook-Zanzibar-<Report>-<Subject>-<Period>.pdf`.
 * The period (not the clock) identifies the document, so re-downloading the
 * same month always yields the same, predictable name.
 */
export function pdfFilename(parts: {
  report: string;
  subject?: string | null;
  period?: string | null;
}): string {
  const segments = ["MediBook Zanzibar", parts.report, parts.subject ?? "", parts.period ?? ""];
  return `${segments.map(slug).filter(Boolean).join("-")}.pdf`;
}

/** Stream a generated PDF as an attachment with no-cache headers. */
export function pdfResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
