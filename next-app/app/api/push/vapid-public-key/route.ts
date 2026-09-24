/** GET /api/push/vapid-public-key/ — public VAPID key for Web Push subscribe. */
import { handler, ok, notFound } from "@/lib/route";
import { vapidPublicKey, vapidConfigured } from "@/lib/push";

export const GET = handler(async () => {
  if (!vapidConfigured()) throw notFound();
  return ok({ publicKey: vapidPublicKey() }, "ok");
});
