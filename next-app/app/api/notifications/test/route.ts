/** POST /api/notifications/test/ — ADMIN ONLY: fan out to every registered device. */
import { handler, created, requireAuth } from "@/lib/route";
import * as notifications from "@/services/notification.service";

export const POST = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const result = await notifications.sendTestNotificationToAllDevices(user);
  return created(result, "Test notification sent to all registered devices.");
});