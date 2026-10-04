/** GET/PATCH/DELETE /api/notifications/{id}/ */
import { handler, ok, noContent, readJson, intParam, notFound } from "@/lib/route";
import { requireAuth } from "@/lib/auth";
import * as notifications from "@/services/notification.service";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  return ok(await notifications.retrieveOwn(user, id));
});

export const PATCH = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  const body = await readJson(ctx.req);
  return ok(await notifications.patchOwn(user, id, body), "Notification updated.");
});

export const DELETE = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const id = intParam(ctx.params.id);
  if (id === null) throw notFound();
  await notifications.destroyOwn(user, id);
  return noContent();
});
