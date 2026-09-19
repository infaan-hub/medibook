/**
 * Appointments API (§27 — /api/appointments/, backend slice B5).
 * Phase 6 only needs the patient's list for the home screen; booking and
 * actions (confirm/cancel/…) land with PHASE 11.
 */
import { apiGet } from "./client";
import type { Appointment, Envelope, Paginated } from "./types";

/** GET /api/appointments/ — the signed-in user's appointments (paginated). */
export function listMyAppointments(
  params?: Record<string, unknown>
): Promise<Envelope<Paginated<Appointment>>> {
  return apiGet<Paginated<Appointment>>("/appointments/", params);
}
