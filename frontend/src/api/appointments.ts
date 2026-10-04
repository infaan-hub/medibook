/**
 * Appointments API (A27 �?" /api/appointments/, backend slice B5).
 * Booking, list, detail, and lifecycle actions (accept/done/cancel/reject).
 */

import { apiGet, apiPatch, apiPost, apiDelete } from "./client";
import type { Appointment, Envelope, Paginated } from "./types";

/** GET /api/appointments/ �?" the signed-in user's appointments (paginated). */
export function listMyAppointments(
  params?: Record<string, unknown>
): Promise<Envelope<Paginated<Appointment>>> {
  return apiGet<Paginated<Appointment>>("/appointments/", params);
}

/**
 * GET /api/appointments/ �?" every appointment on the platform (admin only).
 *
 * The backend scopes this collection by role (AppointmentViewSet.get_queryset):
 * patients receive only their own bookings, doctors only their own schedule,
 * and admins receive the platform-wide booking history. Admin screens must call
 * this function instead of listMyAppointments() so the platform-wide intent is
 * explicit at the call site �?" the two hit the same route but mean different
 * things, and only an admin actually gets the unfiltered collection back.
 */
export function listAllAppointments(
  params?: Record<string, unknown>
): Promise<Envelope<Paginated<Appointment>>> {
  return apiGet<Paginated<Appointment>>("/appointments/", params);
}

/** GET /api/appointments/:id/ �?" a single appointment's detail. */
export function getAppointment(id: number): Promise<Envelope<Appointment>> {
  return apiGet<Appointment>(`/appointments/${id}/`);
}

/** POST /api/appointments/ �?" book a new appointment. */
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

/** POST /api/appointments/:id/cancel/ �?" cancel an appointment. */
export function cancelAppointment(
  id: number,
  cancel_reason?: string
): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>(`/appointments/${id}/cancel/`, { cancel_reason });
}

/** POST /api/appointments/:id/confirm/ �?" doctor accepts the request. */
export function confirmAppointment(id: number): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>(`/appointments/${id}/confirm/`, {});
}

/** POST /api/appointments/:id/complete/ �?" doctor marks the visit done. */
export function completeAppointment(id: number): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>(`/appointments/${id}/complete/`, {});
}

/** POST /api/appointments/:id/reject/ �?" doctor rejects. */
export function rejectAppointment(id: number): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>(`/appointments/${id}/reject/`, {});
}

/** PATCH /api/appointments/:id/ �?" partial update (notes, etc.). */
export function updateAppointment(
  id: number,
  payload: Partial<Pick<Appointment, "reason" | "notes">>
): Promise<Envelope<Appointment>> {
  return apiPatch<Appointment>(`/appointments/${id}/`, payload);
}

/** PATCH /api/appointments/:id/ �?" doctor/admin in-place reschedule. */
export function rescheduleAppointment(
  id: number,
  payload: { appointment_date: string; start_time: string; end_time: string }
): Promise<Envelope<Appointment>> {
  return apiPatch<Appointment>(`/appointments/${id}/`, payload);
}

/** GET /api/doctor/appointments/ �?" doctor's own appointments (non-paginated). */
export function listDoctorAppointments(
  params?: Record<string, unknown>
): Promise<Envelope<Appointment[]>> {
  return apiGet<Appointment[]>("/doctor/appointments/", params);
}

/** DELETE /api/appointments/:id/ �?" delete an appointment (admin/doctor/patient). */
export function deleteAppointment(id: number) {
  return apiDelete(`/appointments/${id}/`);
}

/* ---- EMERGENCY APPOINTMENTS ---- */
/*
 * The emergency API lives in ./emergency.ts — that is the single client for
 * /api/emergency/*, and it mirrors the server's state machine:
 *
 *   pending     → respondToEmergency(id, "accept") | "reject"
 *   accepted    → respondToEmergency(id, "in-progress") | "reject"
 *   in_progress → respondToEmergency(id, "done")
 *   done        → deleteEmergency(id)          (doctor/admin only)
 *
 * The old helpers that lived here (POST /emergency/appointments/{id}/accept/,
 * /reject/ and GET /emergency/my/) were removed: no such routes exist on the
 * server, so every call to them 404'd. Use ./emergency.ts instead.
 */