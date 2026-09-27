import { apiGet, apiPost, apiDelete } from "./client";
import type { Envelope, Paginated } from "./types";

export interface HealthRecord {
  id: number;
  patient: number;
  doctor: number;
  /** Display name of the doctor the record belongs to / was shared with. */
  doctor_name?: string;
  appointment?: number;
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

export function uploadHealthRecord(data: FormData): Promise<Envelope<HealthRecord>> {
  return apiPost<HealthRecord>("/health-records/", data);
}

export function deleteHealthRecord(id: number) {
  return apiDelete(`/health-records/${id}/`);
}
