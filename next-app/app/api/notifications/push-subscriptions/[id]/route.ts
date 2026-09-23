/** GET/DELETE /api/notifications/push-subscriptions/{id}/ */
import { handler, ok, noContent, intParam, notFound } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import * as notifications from "@/services/notification.service";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  return ok(await notifications.retrievePush(user, id));
});

export const DELETE = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  await notifications.destroyPush(user, id);
  return noContent();
});
