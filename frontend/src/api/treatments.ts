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
  appointment_status?: string | null;
  diagnosis: string;
  treatment_notes: string;
  /** Doctor-written description shown in the patient report's Documents section. */
  doctor_description: string;
  /** Plain-text rendering of `prescription_items` (kept for older screens). */
  prescription: string;
  prescription_id: number | null;
  prescription_notes: string;
  prescription_items: import("./prescriptions").PrescriptionItem[];
  follow_up_date: string | null;
  follow_up_time?: string;
  follow_up_notes: string;
  created_at: string;
  updated_at: string;
  /** Present when the Follow-up Date automatically booked a real appointment. */
  follow_up_appointment?: import("./types").Appointment | null;
  /** Id of the auto-booked follow-up appointment (if any). */
  follow_up_appointment_id?: number | null;
  /** Status of the background follow-up booking. */
  follow_up_booking_status?: "pending" | "processing" | "scheduled" | "failed" | null;
}

export interface CreateTreatmentPayload {
  patient: number;
  appointment?: number | null;
  diagnosis?: string;
  treatment_notes?: string;
  doctor_description?: string;
  prescription?: string;
  /** Structured medication lines (phase 1) — preferred over free text. */
  items?: import("./prescriptions").PrescriptionItemInput[];
  prescription_notes?: string;
  follow_up_date?: string | null;
  follow_up_time?: string;
  follow_up_notes?: string;
}

export interface UpdateTreatmentPayload {
  diagnosis?: string;
  treatment_notes?: string;
  doctor_description?: string;
  prescription?: string;
  items?: import("./prescriptions").PrescriptionItemInput[];
  prescription_notes?: string;
  follow_up_date?: string | null;
  follow_up_time?: string;
  follow_up_notes?: string;
}

export interface VisitHistoryEntry {
  appointment_id: number;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  deleted_at?: string | null;
  booked_at?: string;
  updated_at?: string;
  appointment_type?: string;
  hospital_name?: string | null;
  emergency_reason?: string | null;
  emergency_description?: string | null;
  emergency_location?: { latitude: number; longitude: number; accuracy: number | null } | null;
  reason: string;
  notes: string;
  cancel_reason?: string;
  patient?: Record<string, unknown>;
  treatments?: Array<{
    id: number; created_at: string; diagnosis: string; treatment_notes: string;
    doctor_description: string; prescription: string; follow_up_date: string | null;
    follow_up_time: string | null;
    prescriptions?: Array<{ id: number; notes: string; created_at: string; items: Array<{ medication: string; dosage: string; frequency: string; route: string; duration_days: number | null; instructions: string }> }>;
  }>;
  diagnosis: string | null;
  treatment_notes: string | null;
  doctor_description: string | null;
  prescription: string | null;
  follow_up_date: string | null;
  follow_up_time: string | null;
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
