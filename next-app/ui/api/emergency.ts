/**
 * Emergency appointment API (§27 — /api/emergency/*).
 *
 *  - GET  /api/emergency/                     — role-scoped queue (patient's own
 *       emergency appointments / doctor's live requests / admin's platform queue)
 *  - POST /api/emergency/                     — patient requests emergency help
 *       (no doctor in the payload: the server auto-dispatches on the current
 *       time — a doctor available right now, or the nearest one otherwise)
 *  - GET  /api/emergency/available-slots/     — merged slot grid across nearby doctors
 *  - GET  /api/emergency/nearby-doctors/      — doctors near a location
 *  - POST /api/emergency/appointments/{id}/   — doctor accepts / rejects
 */

import { apiGet, apiPost } from "./client";
import type { DoctorProfile, EmergencyAppointment, EmergencyReason, Envelope } from "./types";

/** GET /api/emergency/ — the signed-in user's emergency queue. */
export function listEmergencies(): Promise<Envelope<EmergencyAppointment[]>> {
  return apiGet<EmergencyAppointment[]>("/emergency/");
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

/** POST /api/emergency/appointments/{id}/ — accept or reject a pending request. */
export function respondToEmergency(
  id: number,
  action: "accept" | "reject",
  body?: { cancel_reason?: string }
): Promise<Envelope<EmergencyAppointment>> {
  return apiPost<EmergencyAppointment>(`/emergency/appointments/${id}/`, {
    action,
    ...(body ?? {}),
  });
}
