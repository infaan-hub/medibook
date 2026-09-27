/**
 * Emergency appointment actions (POST /api/emergency/appointments/{id}/).
 * `action` = accept | reject, taken from the query string or the JSON body.
 */
import { handler, ok, badRequest, readJson, intParam } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { emergencyAppointmentDto } from "@/lib/serializers";
import { acceptEmergencyAppointment, rejectEmergencyAppointment } from "@/services/emergency.service";

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

  throw badRequest("Invalid action. Use 'accept' or 'reject'.");
});
