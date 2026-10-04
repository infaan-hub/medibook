/**
 * Emergency appointment API (§27 — /api/emergency/*).
 *
 *  - GET  /api/emergency/                     — role-scoped queue (patient's own
 *       emergency appointments / doctor's live requests / admin's platform queue)
 *  - POST /api/emergency/                     — patient requests emergency help
 *       (no doctor in the payload: the server auto-dispatches on the current
 *       time — a doctor available right now, or the nearest one otherwise)
 *  - GET  /api/emergency/eligibility/         — server-authoritative "may I file
 *       another emergency right now?" (30-minute re-request gate, §30)
 *  - GET  /api/emergency/available-slots/     — merged slot grid across nearby doctors
 *  - GET  /api/emergency/nearby-doctors/      — doctors near a location
 *  - POST /api/emergency/appointments/{id}/   — doctor accepts / rejects /
 *       marks in progress / completes (the state machine lives on the server)
 */

import { apiDelete, apiGet, apiPost } from "./client";
import type {
  DoctorProfile,
  EmergencyAppointment,
  EmergencyEligibility,
  EmergencyReason,
  Envelope,
} from "./types";

/** GET /api/emergency/ — the signed-in user's emergency queue. */
export function listEmergencies(): Promise<Envelope<EmergencyAppointment[]>> {
  return apiGet<EmergencyAppointment[]>("/emergency/");
}

/**
 * GET /api/emergency/eligibility/ — may this patient file an emergency NOW?
 *
 * The server owns the 30-minute re-request window: it sweeps timed-out rows as
 * a side effect of this read, so the answer is always the real one. Use it to
 * swap the request form for the live status card without guessing.
 */
export function getEmergencyEligibility(): Promise<Envelope<EmergencyEligibility>> {
  return apiGet<EmergencyEligibility>("/emergency/eligibility/");
}

export interface EmergencyCreatePayload {
  /** Omit it and the server dispatches to the nearest doctor. */
  doctor?: number;
  /** All three optional: omit them and the server stamps the current time. */
  appointment_date?: string;
  start_time?: string;
  end_time?: string;
  emergency_reason: EmergencyReason;
  emergency_description?: string;
  emergency_latitude: number;
  emergency_longitude: number;
  emergency_location_accuracy?: number;
  reason?: string;
  hospital?: number;
}

/** POST /api/emergency/ — request emergency help (patient only, one active at a time). */
export function createEmergency(
  payload: EmergencyCreatePayload
): Promise<Envelope<EmergencyAppointment>> {
  return apiPost<EmergencyAppointment>("/emergency/", payload);
}

/** One free slot on the merged grid — the nearest doctor offering it, for distance. */
export interface EmergencySlot {
  start_time: string;
  end_time: string;
  distance_km: number;
  /** Nearest Zanzibar area name for that doctor, when one is within 15 km. */
  area: string | null;
}

/** GET /api/emergency/available-slots/ — every free slot that day, merged. */
export function listEmergencySlots(params: {
  latitude: number;
  longitude: number;
  date: string;
  specialty?: number;
}): Promise<Envelope<EmergencySlot[]>> {
  return apiGet<EmergencySlot[]>("/emergency/available-slots/", params);
}

export interface NearbyDoctor {
  doctor: DoctorProfile;
  distance: number;
}

/** GET /api/emergency/nearby-doctors/ — available doctors near a coordinate. */
export function listNearbyDoctors(params: {
  latitude: number;
  longitude: number;
  radius?: number;
  specialty?: number;
}): Promise<Envelope<NearbyDoctor[]>> {
  return apiGet<NearbyDoctor[]>("/emergency/nearby-doctors/", params);
}

/**
 * POST /api/emergency/appointments/{id}/ — doctor actions on one request.
 *
 * Every value is a real backend transition (§21); the server refuses anything
 * illegal, so the UI must never offer a button the state machine can't take:
 *
 *   pending     → "accept" | "reject"
 *   accepted    → "in-progress" | "reject"
 *   in_progress → "done"
 */
export function respondToEmergency(
  id: number,
  action: "accept" | "reject" | "in-progress" | "done",
  body?: { cancel_reason?: string }
): Promise<Envelope<EmergencyAppointment>> {
  return apiPost<EmergencyAppointment>(`/emergency/appointments/${id}/`, {
    action,
    ...(body ?? {}),
  });
}

/**
 * DELETE /api/emergency/appointments/{id}/ — remove a finished emergency.
 *
 * Doctor (or admin) only, and only once the visit is `done`: the server refuses
 * to delete a request that is still pending, accepted, in progress or merely
 * timed out, so the patient's record of the request and the treatment stays
 * whole. Resolves to undefined on success (HTTP 204).
 */
export function deleteEmergency(id: number): Promise<Envelope<void> | undefined> {
  return apiDelete<void>(`/emergency/appointments/${id}/`);
}
