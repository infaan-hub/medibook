import { apiGet, apiPost } from "./client";
import type { Envelope } from "./types";

export interface CoordinatorDailyCount { date: string; label: string; count: number }
export interface CoordinatorStats {
  users: { total: number; patients: number; doctors: number; coordinators: number };
  availability?: { total_doctors: number; available_doctors: number };
  emergency?: { active: number };
  appointments: {
    total: number;
    today: number;
    by_status: Record<string, number>;
    by_service: Record<string, number>;
    today_by_status?: Record<string, number>;
    last_7_days?: CoordinatorDailyCount[];
  };
  services: Array<{ key: string; label: string; count: number }>;
}
export interface CoordinatorDoctor { id: number; user_id: number; name: string; email: string; is_available: boolean; exceptions: Array<{ start_time: string | null; end_time: string | null; reason: string }>; windows: Array<{ start_time: string; end_time: string; breaks: Array<{ start_time: string; end_time: string }> }>; appointments: Array<{ id: number; patient_id: number; patient_name: string; date: string; start_time: string; end_time: string; status: string; type: string }> }
export interface CoordinatorAppointment { id: number; patient: number; patient_email: string; doctor: number; appointment_date: string; start_time: string; end_time: string; status: string; appointment_type: string; reason: string; notes: string; consultation_started_at?: string | null; checked_in_at?: string | null }
export interface CoordinatorPatient { id: number; username: string; email: string; first_name: string; last_name: string; phone: string; profile: Record<string, unknown> | null; appointment_count: number }
export interface CoordinatorHistory { patient: CoordinatorPatient; visits: Array<Record<string, any>> }
const root = "/coordinator/";
export function getCoordinatorOverview() { return apiGet<CoordinatorStats>(root, { view: "overview" }); }
export function getCoordinatorDoctors(date: string) { return apiGet<CoordinatorDoctor[]>(root, { view: "doctors", date }); }
export function getCoordinatorAppointments(type?: string) { return apiGet<CoordinatorAppointment[]>(root, { view: "appointments", ...(type ? { type } : {}) }); }
export function getCoordinatorPatients(search?: string) { return apiGet<CoordinatorPatient[]>(root, { view: "patients", ...(search ? { search } : {}) }); }
export function getCoordinatorPatientHistory(id: number) { return apiGet<CoordinatorHistory>(root, { view: "history", patient: id }); }
export function reassignCoordinatorAppointment(id: number, doctor_id: number, emergency = false) { return apiPost<CoordinatorAppointment>(`${root}?action=${emergency ? "reassign-emergency" : "reassign-appointment"}&appointment=${id}`, { doctor_id }); }
