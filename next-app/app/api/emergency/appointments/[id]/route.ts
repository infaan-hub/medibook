/**
 * Emergency appointment actions (POST /api/emergency/appointments/{id}/).
 * `action` = accept | reject | in-progress | done | cancel, taken from the JSON
 * body or the query string — every one of them is a real backend transition:
 *
 *   pending     → [Accept] → accepted
 *   accepted    → [Emergency In Progress] → in_progress
 *   in_progress → [Done] → done (the only state that releases the patient)
 *
 * A request whose 30-minute window closed without the doctor arriving is swept
 * to `expired` by the reads, which releases the patient to request again.
 *
 * Role and ownership are enforced in the service: only the assigned doctor
 * (or an admin) may act, and only along a legal transition. The generic
 * /api/appointments/{id}/{action}/ route funnels into the SAME dispatcher, so
 * there is no second, weaker way to reach these statuses.
 */
import { handler, ok, readJson, intParam, badRequest } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { emergencyAppointmentDto } from "@/lib/serializers";
import { runEmergencyAction } from "@/services/emergency.service";

export const POST = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  // The id lives in the path ({id}); the query keys are a legacy fallback.
  const id = intParam(ctx.params.id) ?? intParam(qs.get("id") ?? qs.get("appointment"));
  if (id === null) throw badRequest("Missing appointment id.");

  const body = (await readJson(ctx.req)) as Record<string, unknown>;

  // The query string wins when it carries something; otherwise the body's
  // `action` is used. An empty/absent value falls through to the service,
  // which answers with the single, accurate "Invalid action" message.
  const fromQuery = qs.get("action");
  const fromBody = typeof body.action === "string" ? body.action : null;
  const action = fromQuery !== null && fromQuery.trim() !== "" ? fromQuery : fromBody;

  const result = await runEmergencyAction(ctx.req, user, id, action, body);
  return ok(emergencyAppointmentDto(result.appointment), result.message);
});
