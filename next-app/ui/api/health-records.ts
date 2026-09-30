import { apiGet, apiDelete, http } from "./client";
import type { Envelope, Paginated } from "./types";

export interface HealthRecord {
  id: number;
  patient: number;
  doctor: number;
  /** Display name of the doctor the record belongs to / was shared with. */
  doctor_name?: string;
  appointment?: number | null;
  /** Same-origin media URL (`/media/{id}`) — requires the JWT to fetch. */
  file?: string | null;
  /** Original uploaded filename (for Open/Download). */
  file_name?: string | null;
  /** MIME type of the uploaded file (for icons / extension guessing). */
  file_content_type?: string | null;
  record_type: string;
  title: string;
  description: string;
  created_at: string;
}

export function getHealthRecords(patientId?: number): Promise<Envelope<Paginated<HealthRecord>>> {
  // page_size=100 (API cap): the old default of 20 hid older records with no
  // pager in any of the three UIs.
  const params = new URLSearchParams({ page_size: "100" });
  if (patientId) params.set("patient", String(patientId));
  return apiGet<Paginated<HealthRecord>>(`/health-records/?${params.toString()}`);
}

/**
 * POST /api/health-records/ — multipart upload.
 *
 * The shared axios client defaults to `Content-Type: application/json`, and
 * axios 1.x reacts to that by JSON-stringifying any FormData payload (a File
 * serialises to `{}`), which silently dropped the document. Multipart must be
 * requested explicitly — exactly like `uploadProfileImage()` in api/auth.ts.
 */
export function uploadHealthRecord(data: FormData): Promise<Envelope<HealthRecord>> {
  return http
    .post<Envelope<HealthRecord>>("/health-records/", data, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
}

export function deleteHealthRecord(id: number) {
  return apiDelete(`/health-records/${id}/`);
}
