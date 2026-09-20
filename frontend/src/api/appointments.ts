/**
 * Appointments API (§27 — /api/appointments/, backend slice B5).
 * Booking, list, detail, and lifecycle actions (confirm/cancel/complete/reject).
 */

import { apiGet, apiPatch, apiPost, apiDelete } from "./client";
import type { Appointment, Envelope, Paginated } from "./types";

/** GET /api/appointments/ — the signed-in user's appointments (paginated). */
export function listMyAppointments(
  params?: Record<string, unknown>
): Promise<Envelope<Paginated<Appointment>>> {
  return apiGet<Paginated<Appointment>>("/appointments/", params);
}

/** GET /api/appointments/:id/ — a single appointment's detail. */
export function getAppointment(id: number): Promise<Envelope<Appointment>> {
  return apiGet<Appointment>(`/appointments/${id}/`);
}

/** POST /api/appointments/ — book a new appointment. */
export function createAppointment(
  payload: {
    doctor: number;
    appointment_date: string;
    start_time: string;
    end_time: string;
    reason?: string;
    hospital?: number;
  }
): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>("/appointments/", payload);
}

/** POST /api/appointments/:id/cancel/ — cancel an appointment. */
export function cancelAppointment(
  id: number,
  cancel_reason?: string
): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>(`/appointments/${id}/cancel/`, { cancel_reason });
}

/** POST /api/appointments/:id/confirm/ — doctor confirms. */
export function confirmAppointment(id: number): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>(`/appointments/${id}/confirm/`, {});
}

/** POST /api/appointments/:id/complete/ — doctor completes. */
export function completeAppointment(id: number): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>(`/appointments/${id}/complete/`, {});
}

/** POST /api/appointments/:id/reject/ — doctor rejects. */
export function rejectAppointment(id: number): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>(`/appointments/${id}/reject/`, {});
}

/** PATCH /api/appointments/:id/ — partial update (notes, etc.). */
export function updateAppointment(
  id: number,
  payload: Partial<Pick<Appointment, "reason" | "notes">>
): Promise<Envelope<Appointment>> {
  return apiPatch<Appointment>(`/appointments/${id}/`, payload);
}

/** PATCH /api/appointments/:id/ — doctor/admin in-place reschedule. */
export function rescheduleAppointment(
  id: number,
  payload: { appointment_date: string; start_time: string; end_time: string }
): Promise<Envelope<Appointment>> {
  return apiPatch<Appointment>(`/appointments/${id}/`, payload);
}

/** GET /api/doctor/appointments/ — doctor's own appointments (non-paginated). */
export function listDoctorAppointments(
  params?: Record<string, unknown>
): Promise<Envelope<Appointment[]>> {
  return apiGet<Appointment[]>("/doctor/appointments/", params);
}

/** DELETE /api/appointments/:id/ — delete an appointment (admin/doctor/patient). */
export function deleteAppointment(id: number) {
  return apiDelete(`/appointments/${id}/`);
}
