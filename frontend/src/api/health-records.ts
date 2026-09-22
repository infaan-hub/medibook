import { apiGet, apiPost, apiDelete } from "./client";
import type { Envelope, Paginated } from "./types";

export interface HealthRecord {
  id: number;
  patient: number;
  doctor: number;
  appointment?: number;
  file?: string;
  record_type: string;
  title: string;
  description: string;
  created_at: string;
}

export function getHealthRecords(patientId?: number): Promise<Envelope<Paginated<HealthRecord>>> {
  const params = patientId ? `?patient=${patientId}` : "";
  return apiGet<Paginated<HealthRecord>>(`/health-records/${params}`);
}

export function uploadHealthRecord(data: FormData): Promise<Envelope<HealthRecord>> {
  return apiPost<HealthRecord>("/health-records/", data);
}

export function deleteHealthRecord(id: number) {
  return apiDelete(`/health-records/${id}/`);
}
