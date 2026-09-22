/**
 * Medical Treatments API — doctor CRUD for patient treatment records.
 */
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";
import type { Envelope } from "./types";

export interface MedicalTreatment {
  id: number;
  doctor: number;
  patient: number;
  appointment: number | null;
  diagnosis: string;
  treatment_notes: string;
  prescription: string;
  follow_up_date: string | null;
  follow_up_notes: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTreatmentPayload {
  patient: number;
  appointment?: number | null;
  diagnosis?: string;
  treatment_notes?: string;
  prescription?: string;
  follow_up_date?: string | null;
  follow_up_notes?: string;
}

export interface UpdateTreatmentPayload {
  diagnosis?: string;
  treatment_notes?: string;
  prescription?: string;
  follow_up_date?: string | null;
  follow_up_notes?: string;
}

export interface VisitHistoryEntry {
  appointment_id: number;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  reason: string;
  notes: string;
  diagnosis: string | null;
  treatment_notes: string | null;
  prescription: string | null;
  follow_up_date: string | null;
  doctor_first_name: string;
  doctor_last_name: string;
}

/** GET /api/treatments/patients/ — list patients who have appointments with this doctor. */
export function listDoctorPatients(): Promise<Envelope<import("./types").PatientProfile[]>> {
  return apiGet<import("./types").PatientProfile[]>("/treatments/patients/");
}

/** GET /api/treatments/?patient=<id> — list treatments (optionally filtered by patient). */
export function listTreatments(patientId?: number): Promise<Envelope<MedicalTreatment[]>> {
  const params = patientId ? `?patient=${patientId}` : "";
  return apiGet<MedicalTreatment[]>(`/treatments/${params}`);
}

/** POST /api/treatments/ — create a new treatment record. */
export function createTreatment(payload: CreateTreatmentPayload): Promise<Envelope<MedicalTreatment>> {
  return apiPost<MedicalTreatment>("/treatments/", payload);
}

/** PATCH /api/treatments/<id>/ — update a treatment record. */
export function updateTreatment(id: number, payload: UpdateTreatmentPayload): Promise<Envelope<MedicalTreatment>> {
  return apiPatch<MedicalTreatment>(`/treatments/${id}/`, payload);
}

/** DELETE /api/treatments/<id>/ — delete a treatment record. */
export async function deleteTreatment(id: number): Promise<void> {
  await apiDelete(`/treatments/${id}/`);
}

/** GET /api/treatments/visit-history/?patient=<userId> — doctor views visit timeline for a patient. */
export function getVisitHistory(patientId: number): Promise<Envelope<VisitHistoryEntry[]>> {
  return apiGet<VisitHistoryEntry[]>(`/treatments/visit-history/?patient=${patientId}`);
}
