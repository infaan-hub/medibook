/**
 * Reports API — server-generated PDFs (§34).
 *
 * The endpoints return `application/pdf`, not the §28 JSON envelope, so these
 * calls bypass `apiGet` and stream the body straight into a Blob. The JWT still
 * rides along through the shared axios instance.
 *
 * Every report can be either downloaded (saved to disk) or viewed (opened in a
 * preview tab) — both use the same request, only the final Blob handling differs.
 */
import { http } from "./client";

export type ReportPreset = "month" | "week" | "custom";

export interface ReportPeriodParams {
  preset?: ReportPreset;
  /** Custom range start, `YYYY-MM-DD`. */
  from?: string;
  /** Custom range end, `YYYY-MM-DD`. */
  to?: string;
  /** Month preset, `YYYY-MM`. */
  month?: string;
}

export interface ReportResult {
  filename: string;
  size: number;
}

/** Case-insensitive header lookup that tolerates Axios/plain header objects. */
function header(headers: unknown, name: string): unknown {
  if (!headers || typeof headers !== "object") return undefined;
  const record = headers as Record<string, unknown>;
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? undefined : record[key];
}

/** Read `filename="…"` (or RFC 5987 `filename*=…`) from a Content-Disposition value. */
export function filenameFrom(disposition: unknown, fallback: string): string {
  if (typeof disposition !== "string") return fallback;
  const extended = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, "")) || fallback;
    } catch {
      /* fall through to the plain filename */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(disposition);
  if (plain?.[1]) return plain[1];
  const unquoted = /filename=([^;\s]+)/i.exec(disposition);
  return unquoted?.[1] ?? fallback;
}

/** Save a Blob as a file download using a temporary object URL. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke after the browser has had a chance to start the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/**
 * Show a Blob in a new tab. The tab is opened synchronously (so popup blockers
 * see it inside the click gesture) and pointed at the object URL afterwards.
 */
function showBlob(blob: Blob): boolean {
  const preview = window.open("", "_blank");
  if (!preview) return false;
  const url = URL.createObjectURL(blob);
  preview.location.href = url;
  preview.document.title = "MediBook report";
  window.setTimeout(() => URL.revokeObjectURL(url), 600_000);
  return true;
}

type ReportParams = ReportPeriodParams & { patient?: number };

async function fetchReport(url: string, params: ReportParams, fallbackName: string) {
  const response = await http.get(url, { params, responseType: "blob" });
  const blob = new Blob([response.data], { type: "application/pdf" });
  const filename = filenameFrom(header(response.headers, "content-disposition"), fallbackName);
  return { blob, filename, size: blob.size };
}

async function download(
  url: string,
  params: ReportParams,
  fallbackName: string
): Promise<ReportResult> {
  const { blob, filename, size } = await fetchReport(url, params, fallbackName);
  saveBlob(blob, filename);
  return { filename, size };
}

async function view(url: string, params: ReportParams, fallbackName: string): Promise<ReportResult> {
  const { blob, filename, size } = await fetchReport(url, params, fallbackName);
  if (!showBlob(blob)) throw new Error("Your browser blocked the report preview tab.");
  return { filename, size };
}

/** GET /api/reports/admin/ — platform administrative report (admin only). */
export function downloadAdminReport(params: ReportPeriodParams = {}): Promise<ReportResult> {
  return download("/reports/admin/", params, "MediBook-Zanzibar-Report.pdf");
}

/** Same report, opened in a preview tab instead of saved. */
export function viewAdminReport(params: ReportPeriodParams = {}): Promise<ReportResult> {
  return view("/reports/admin/", params, "MediBook-Zanzibar-Report.pdf");
}

/** GET /api/reports/doctor/ — medical report for one of the doctor's patients. */
export function downloadDoctorReport(
  patientId: number,
  params: ReportPeriodParams = {}
): Promise<ReportResult> {
  return download("/reports/doctor/", { ...params, patient: patientId }, "MediBook-Zanzibar-Medical-Report.pdf");
}

/** Same doctor's report, opened in a preview tab instead of saved. */
export function viewDoctorReport(
  patientId: number,
  params: ReportPeriodParams = {}
): Promise<ReportResult> {
  return view("/reports/doctor/", { ...params, patient: patientId }, "MediBook-Zanzibar-Medical-Report.pdf");
}

/** GET /api/reports/patient/ — the signed-in patient's own record. */
export function downloadPatientReport(params: ReportPeriodParams = {}): Promise<ReportResult> {
  return download("/reports/patient/", params, "MediBook-Zanzibar-My-Medical-Report.pdf");
}

/** Same patient report, opened in a preview tab instead of saved. */
export function viewPatientReport(params: ReportPeriodParams = {}): Promise<ReportResult> {
  return view("/reports/patient/", params, "MediBook-Zanzibar-My-Medical-Report.pdf");
}
