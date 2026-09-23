/** GET/PATCH/DELETE /api/appointments/{id}/ — appointment detail. */
import { handler, ok, noContent, readJson, intParam, notFound } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { appointmentDto } from "@/lib/serializers";
import * as appointments from "@/services/appointment.service";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const appointment = await appointments.getAccessible(user, id);
  return ok(appointmentDto(appointment));
});

export const PATCH = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const body = await readJson(ctx.req);
  const result = await appointments.patchAppointment(ctx.req, user, id, body);
  return ok(appointmentDto(result.appointment), result.message);
});

export const DELETE = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  await appointments.assertCanAccess(user, id);
  await appointments.destroyAppointment(id);
  return noContent();
});
