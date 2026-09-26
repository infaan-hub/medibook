/** Emergency appointment actions (POST /api/emergency/appointments/{id}/{accept,reject}/). */
import { handler, ok, badRequest, readJson, intParam } from "@/lib/route";
import { requireAuth, requireDoctor } from "@/lib/auth";
import { emergencyAppointmentDto } from "@/lib/serializers";
import { acceptEmergencyAppointment, rejectEmergencyAppointment } from "@/services/emergency.service";

export const POST = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const qs = new URL(ctx.req.url).searchParams;
  const id = intParam(qs.get("id") ?? qs.get("appointment"));
  if (id === null) throw badRequest("Missing appointment id.");

  const action = qs.get("action");
  const body = await readJson(ctx.req);

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