/** POST /api/notifications/test/ — send a test notification to the caller. */
import { handler, created, requireAuth } from "@/lib/route";
import * as notifications from "@/services/notification.service";

export const POST = handler(async (ctx) => {
  const user = await requireAuth(ctx.req);
  const result = await notifications.sendTestNotification(user);
  return created(result, "Test notification sent.");
});