/**
 * Prescriptions API — structured e-prescriptions issued by doctors (phase 1).
 */
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";
import type { Envelope } from "./types";

export interface PrescriptionItem {
  id?: number;
  medication: string;
  dosage: string;
  frequency: string;
  route: string;
  duration_days: number | null;
  refills: number;
  instructions: string;
  sort_order?: number;
}

export interface Prescription {
  id: number;
  patient: number;
  doctor: number;
  appointment: number | null;
  treatment: number | null;
  notes: string;
  items: PrescriptionItem[];
  created_at: string;
  updated_at: string;
}

export interface PrescriptionItemInput {
  medication: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  duration_days?: number | null;
  refills?: number;
  instructions?: string;
}

export interface CreatePrescriptionPayload {
  patient: number;
  appointment?: number | null;
  treatment?: number | null;
  notes?: string;
  items: PrescriptionItemInput[];
}

/** GET /api/prescriptions/?patient=<id> — doctor's issued prescriptions. */
export function listPrescriptions(patientId?: number): Promise<Envelope<Prescription[]>> {
  const params = patientId ? `?patient=${patientId}` : "";
  return apiGet<Prescription[]>(`/prescriptions/${params}`);
}

/** GET /api/prescriptions/mine/ — the signed-in patient's prescriptions. */
export function myPrescriptions(): Promise<Envelope<Prescription[]>> {
  return apiGet<Prescription[]>("/prescriptions/mine/");
}

/** POST /api/prescriptions/ — doctor issues a prescription. */
export function createPrescription(
  payload: CreatePrescriptionPayload
): Promise<Envelope<Prescription>> {
  return apiPost<Prescription>("/prescriptions/", payload);
}

/** PATCH /api/prescriptions/<id>/ — update notes and/or medication lines. */
export function updatePrescription(
  id: number,
  payload: { notes?: string; items?: PrescriptionItemInput[] }
): Promise<Envelope<Prescription>> {
  return apiPatch<Prescription>(`/prescriptions/${id}/`, payload);
}

/** DELETE /api/prescriptions/<id>/ — withdraw a prescription. */
export async function deletePrescription(id: number): Promise<void> {
  await apiDelete(`/prescriptions/${id}/`);
}
