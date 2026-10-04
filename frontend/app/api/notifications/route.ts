/** GET/POST /api/notifications/ — paginated notification inbox. */
import { handler, ok, created, readJson, requireAuth } from "@/lib/route";
import { notificationDto } from "@/lib/serializers";
import { paginate } from "@/lib/pagination";
import * as notifications from "@/services/notification.service";
import * as repo from "@/repositories/notifications.repo";

export const GET = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const list = notifications.listOwn(ctx.req, user);
  return paginate({
    req: ctx.req,
    where: { user_id: user.id },
    count: () => list.count(),
    fetch: ({ skip, take }) => list.run(skip, take).then((rows) => rows.map(notificationDto)),
    fetchAll: async () =>
      (await list.run(0, 1000)).map(notificationDto),
  });
});

export const POST = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  if (!user.is_superuser && user.role !== "admin") {
    const { forbidden } = await import("@/lib/errors");
    throw forbidden();
  }
  const body = (await readJson(ctx.req)) as {
    recipient?: number;
    recipient_id?: number;
    title: string;
    message: string;
    type?: string;
  };
  const recipient = body.recipient ?? body.recipient_id;
  if (!recipient) {
    const { badRequest } = await import("@/lib/errors");
    throw badRequest("recipient is required.");
  }
  const row = await repo.createNotification({
    recipient_id: Number(recipient),
    notification_type: body.type ?? "system",
    title: body.title,
    message: body.message,
  });
  // Emit realtime after the DB write so recipients see it without refresh.
  const { pushEvent } = await import("@/lib/realtime");
  const { notificationPayload } = await import("@/lib/notify");
  const { sendWebPushSafe } = await import("@/lib/push");
  pushEvent([Number(recipient)], "notification.created", notificationPayload(row), {
    version: row.updated_at.getTime(),
    entityId: row.id,
  });
  sendWebPushSafe(Number(recipient), {
    title: row.title,
    body: row.message,
    url: "/notifications",
    notification_id: row.id,
    tag: `notification-${row.id}`,
  });
  return created(notificationDto(row), "Notification created.");
});
