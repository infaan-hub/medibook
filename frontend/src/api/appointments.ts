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

/** POST /api/emergency/ — create an emergency appointment. */
export function createEmergencyAppointment(payload: {
  doctor: number;
  hospital?: number | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  reason?: string;
  notes?: string;
  emergency_reason: string;
  emergency_description?: string;
  emergency_latitude: number;
  emergency_longitude: number;
  emergency_location_accuracy?: number | null;
}): Promise<any> {
  return apiPost<any>("/emergency/", payload);
}

/** GET /api/emergency/nearby-doctors/ — find nearby available doctors for emergency. */
export function getNearbyDoctors(payload: {
  latitude: number;
  longitude: number;
  radius?: number;
  specialty?: number;
}): Promise<any> {
  const params = new URLSearchParams();
  params.set("latitude", String(payload.latitude));
  params.set("longitude", String(payload.longitude));
  if (payload.radius) params.set("radius", String(payload.radius));
  if (payload.specialty) params.set("specialty", String(payload.specialty));
  return apiGet<any>(`/emergency/nearby-doctors/?${params.toString()}`);
}

/** POST /api/emergency/appointments/:id/accept/ — doctor accepts emergency appointment. */
export function acceptEmergencyAppointment(id: number): Promise<any> {
  return apiPost<any>(`/emergency/appointments/${id}/accept/`, {});
}

/** POST /api/emergency/appointments/:id/reject/ — doctor rejects emergency appointment. */
export function rejectEmergencyAppointment(id: number, cancel_reason?: string): Promise<any> {
  return apiPost<any>(`/emergency/appointments/${id}/reject/`, { cancel_reason });
}

/** GET /api/emergency/my/ — get current patient's emergency appointment. */
export function getMyEmergencyAppointment(): Promise<any> {
  return apiGet<any>("/emergency/my/");
}