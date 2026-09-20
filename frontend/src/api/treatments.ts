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
