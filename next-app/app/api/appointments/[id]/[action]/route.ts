/** POST /api/appointments/{id}/{confirm,complete,cancel,reject}/ */
import { handler, ok, intParam, notFound, readJson } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import { appointmentDto } from "@/lib/serializers";
import { isKnownAction, runAction } from "@/services/appointment.service";

export const POST = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  const action = ctx.params.action;
  if (id === null || !action || !isKnownAction(action)) throw notFound();
  const body = await readJson(ctx.req);
  const result = await runAction(user, id, action, body);
  return ok(appointmentDto(result.appointment), result.message);
});
