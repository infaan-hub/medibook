/**
 * Shared renderer plumbing — one place that turns a component body into a
 * finished, page-stamped PDF buffer.
 */
import { APP_TIMEZONE } from "../data/format";
import { branding } from "../design/tokens";
import { stampPage } from "./chrome";
import { ReportDoc, type ReportChrome } from "./doc";

export type ReportKind = "admin" | "doctor" | "patient";

const KIND_CODE: Record<ReportKind, string> = {
  admin: "ADM",
  doctor: "DOC",
  patient: "PAT",
};

/**
 * `YYYYMMDD` + `HHMM` of `date` in the REPORTING timezone, so the id stamped on
 * the page agrees with the "Generated:" line the chrome prints right next to it.
 */
function zonedStamp(date: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}${value("month")}${value("day")}`,
    time: `${value("hour")}${value("minute")}`,
  };
}

/**
 * A reproducible document id: kind + generation date/time + a short hash of the
 * subject/period, so two people generating the same report for the same scope
 * get the same reference.
 */
export function reportId(kind: ReportKind, generatedAt: Date, seed: string): string {
  const stamp = zonedStamp(generatedAt);
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `MB-${KIND_CODE[kind]}-${stamp.date}${stamp.time}-${String(hash % 100000).padStart(5, "0")}`;
}

/** The confidentiality line each family prints in the footer. */
export const footerNoteFor = (kind: ReportKind): string =>
  kind === "admin" ? branding.confidentialAdministrative : branding.confidentialMedical;

/** Build a doc, draw `body`, stamp the chrome on every page, return the PDF. */
export async function renderReport(
  chrome: ReportChrome,
  body: (doc: ReportDoc) => void,
  generatedAt: Date = new Date()
): Promise<Buffer> {
  const doc = new ReportDoc(chrome, generatedAt);
  body(doc);
  return await doc.finish((target, pageIndex, pageCount) =>
    stampPage(target, chrome, pageIndex, pageCount)
  );
}
