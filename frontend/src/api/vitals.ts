/**
 * Vitals API — readings recorded by doctors for a patient (phase 2).
 */
import { apiGet, apiPost, apiDelete } from "./client";
import type { Envelope } from "./types";

export interface Vital {
  id: number;
  patient: number;
  doctor: number;
  appointment: number | null;
  recorded_at: string;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  pulse_bpm: number | null;
  temperature_c: number | null;
  glucose_mg_dl: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  spo2_percent: number | null;
  notes: string;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVitalPayload {
  patient: number;
  appointment?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  pulse_bpm?: number | null;
  temperature_c?: number | null;
  glucose_mg_dl?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  spo2_percent?: number | null;
  notes?: string;
  recorded_at?: string;
}

/** GET /api/vitals/?patient=<id> — readings this doctor took. */
export function listVitals(patientId?: number): Promise<Envelope<Vital[]>> {
  const params = patientId ? `?patient=${patientId}` : "";
  return apiGet<Vital[]>(`/vitals/${params}`);
}

/** GET /api/vitals/mine/ — the signed-in patient's own readings. */
export function myVitals(): Promise<Envelope<Vital[]>> {
  return apiGet<Vital[]>("/vitals/mine/");
}

/** POST /api/vitals/ — doctor records a reading (server derives BMI). */
export function createVital(payload: CreateVitalPayload): Promise<Envelope<Vital>> {
  return apiPost<Vital>("/vitals/", payload);
}

/** DELETE /api/vitals/<id>/ — remove a reading. */
export async function deleteVital(id: number): Promise<void> {
  await apiDelete(`/vitals/${id}/`);
}
