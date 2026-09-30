import { apiGet, apiDelete, http } from "./client";
import type { Envelope, Paginated } from "./types";

export interface HealthRecord {
  id: number;
  patient: number;
  doctor: number;
  /** Display name of the doctor the record belongs to / was shared with. */
  doctor_name?: string;
  appointment?: number | null;
  file?: string | null;
  /** Original uploaded filename (used to name Open/Download saves). */
  file_name?: string | null;
  /** MIME type of the stored file (extension fallback when saving). */
  file_content_type?: string | null;
  record_type: string;
  title: string;
  description: string;
  created_at: string;
}

export function getHealthRecords(patientId?: number): Promise<Envelope<Paginated<HealthRecord>>> {
  const params = patientId ? `?patient=${patientId}&page_size=100` : "?page_size=100";
  return apiGet<Paginated<HealthRecord>>(`/health-records/${params}`);
}

/**
 * POST /api/health-records/ — multipart upload.
 *
 * The shared axios client defaults to `Content-Type: application/json`, and
 * axios 1.x reacts to that by JSON-stringifying any FormData payload (a File
 * serialises to `{}`). The document was therefore silently dropped: the API
 * stored every record with `file_id = null`, so no record ever had a file and
 * the View/Download buttons could never appear. Multipart must be requested
 * explicitly — exactly like `uploadProfileImage()` in api/auth.ts.
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
