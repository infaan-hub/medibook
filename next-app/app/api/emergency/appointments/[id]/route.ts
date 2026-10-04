/**
 * Emergency appointment actions (POST /api/emergency/appointments/{id}/).
 * `action` = accept | reject | in-progress | done, taken from the query string
 * or the JSON body — every one of them is a real backend transition:
 *
 *   pending     → [Accept] → accepted
 *   accepted    → [Emergency In Progress] → in_progress
 *   in_progress → [Done] → done (the only state that releases the patient)
 *
 * Role and ownership are enforced in the service: only the assigned doctor
 * (or an admin) may act, and only along a legal transition.
 */
import { handler, ok, badRequest, readJson, intParam } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { emergencyAppointmentDto } from "@/lib/serializers";
import {
  acceptEmergencyAppointment,
  completeEmergencyAppointment,
  rejectEmergencyAppointment,
  startEmergencyInProgress,
} from "@/services/emergency.service";

/** Accepted spellings — the UI sends the first, the rest are for older clients. */
const START_ACTIONS = new Set(["in-progress", "in_progress", "start", "arrived"]);
const DONE_ACTIONS = new Set(["done", "complete", "completed", "finish"]);

export const POST = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  // The id lives in the path ({id}); the query keys are a legacy fallback.
  const id = intParam(ctx.params.id) ?? intParam(qs.get("id") ?? qs.get("appointment"));
  if (id === null) throw badRequest("Missing appointment id.");

  const body = (await readJson(ctx.req)) as Record<string, unknown>;
  const action =
    qs.get("action") ?? (typeof body.action === "string" ? body.action : null);

  if (action === "accept") {
    const result = await acceptEmergencyAppointment(ctx.req, user, id);
    return ok(emergencyAppointmentDto(result.appointment), result.message);
  }

  if (action === "reject") {
    const result = await rejectEmergencyAppointment(ctx.req, user, id, body);
    return ok(emergencyAppointmentDto(result.appointment), result.message);
  }

  if (action !== null && START_ACTIONS.has(action)) {
    const result = await startEmergencyInProgress(ctx.req, user, id);
    return ok(emergencyAppointmentDto(result.appointment), result.message);
  }

  if (action !== null && DONE_ACTIONS.has(action)) {
    const result = await completeEmergencyAppointment(ctx.req, user, id);
    return ok(emergencyAppointmentDto(result.appointment), result.message);
  }

  throw badRequest("Invalid action. Use 'accept', 'reject', 'in-progress' or 'done'.");
});
