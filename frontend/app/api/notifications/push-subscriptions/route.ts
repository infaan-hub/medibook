/** GET/POST /api/notifications/push-subscriptions/ */
import { handler, ok, created, readJson, requireAuth } from "@/lib/route";
import * as notifications from "@/services/notification.service";
import { paginate } from "@/lib/pagination";
import { pushSubscriptionDto } from "@/lib/serializers";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const list = notifications.listPush(user);
  return paginate({
    req: ctx.req,
    where: { user_id: user.id },
    count: () => list.count(),
    fetch: ({ skip, take }) =>
      list.run(skip, take).then((rows) => rows.map(pushSubscriptionDto)),
    fetchAll: async () => (await list.run(0, 1000)).map(pushSubscriptionDto),
  });
});

export const POST = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const body = await readJson(ctx.req);
  const row = await notifications.createPush(user, body);
  return created(row, "Push subscription saved.");
});
