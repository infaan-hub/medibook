/**
 * Waiting-room queue API (phase 11) — daily queue positions, check-in and
 * starting the next consultation.
 */
import { apiGet, apiPost } from "./client";
import type { Appointment, Envelope } from "./types";

/** One appointment's place in the waiting line (see queueSlotDto). */
export interface QueueSlot {
  appointment: number;
  /** 1-based position among the waiting patients; null = not waiting. */
  position: number | null;
  being_seen: boolean;
  checked_in: boolean;
  waited_minutes: number | null;
  waiting_count: number;
}

/** An appointment as returned by /api/queue/ (appointment + its slot). */
export interface QueueEntry extends Appointment {
  queue: QueueSlot | null;
}

/** GET /api/queue/?date=YYYY-MM-DD — the waiting room for one day. */
export function getQueue(date: string): Promise<Envelope<QueueEntry[]>> {
  return apiGet<QueueEntry[]>("/queue/", { date });
}

/** POST /api/queue/check-in/ — join today's waiting line. */
export function checkIn(appointment: number): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>("/queue/check-in/", { appointment });
}

/** POST /api/queue/<id>/start/ — doctor calls the patient in. */
export function startConsultation(id: number): Promise<Envelope<Appointment>> {
  return apiPost<Appointment>(`/queue/${id}/start/`, {});
}
