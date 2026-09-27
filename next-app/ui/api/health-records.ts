import { apiGet, apiPost, apiDelete } from "./client";
import type { Envelope, Paginated } from "./types";

export interface HealthRecord {
  id: number;
  patient: number;
  doctor: number;
  /** Display name of the doctor the record belongs to / was shared with. */
  doctor_name?: string;
  appointment?: number;
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

export function uploadHealthRecord(data: FormData): Promise<Envelope<HealthRecord>> {
  return apiPost<HealthRecord>("/health-records/", data);
}

export function deleteHealthRecord(id: number) {
  return apiDelete(`/health-records/${id}/`);
}
