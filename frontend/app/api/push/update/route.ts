/**
 * POST /api/push/update — rotate a stale push subscription to its fresh endpoint.
 *
 * Called by the service worker's `pushsubscriptionchange` handler
 * (public/service-worker.js) when the browser rotates/expires a subscription
 * while the app is closed. No page ⇒ usually no Authorization header: the OLD
 * endpoint is the proof of possession. An authenticated caller (page context)
 * may also just register the fresh subscription.
 *
 * Body: {
 *   oldEndpoint: string | null,
 *   newSubscription: { endpoint, keys?: { p256dh, auth } | p256dh_key?, auth_key?, device_info? }
 * }
 * Accepts the web-push `toJSON()` shape (`keys`) as well as our own column names.
 */
import { handler, ok, readJson, badRequest, notFound } from "@/lib/route";
import * as notifications from "@/services/notification.service";

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
  p256dh_key?: unknown;
  auth_key?: unknown;
  fcm_token?: unknown;
  device_info?: Record<string, unknown>;
};

const firstString = (...values: unknown[]): string | undefined => {
  for (const v of values) if (typeof v === "string" && v.length > 0) return v;
  return undefined;
};

export const POST = handler(async (ctx) => {
  const body = (await readJson(ctx.req)) as {
    oldEndpoint?: unknown;
    newSubscription?: SubscriptionInput | null;
  };
  const sub = body.newSubscription;
  if (!sub || typeof sub !== "object") throw badRequest("Missing new subscription data.");
  if (firstString(sub.endpoint) === undefined) throw badRequest("newSubscription.endpoint is required.");

  const rotated = await notifications.rotatePushSubscription(
    {
      oldEndpoint: firstString(body.oldEndpoint) ?? null,
      subscription: {
        endpoint: firstString(sub.endpoint)!,
        p256dh_key: firstString(sub.keys?.p256dh, sub.p256dh_key),
        auth_key: firstString(sub.keys?.auth, sub.auth_key),
        fcm_token: firstString(sub.fcm_token),
        device_info: sub.device_info,
      },
    },
    ctx.user
  );
  if (!rotated) throw notFound("No subscription matched the old endpoint.");
  return ok(rotated, "Push subscription rotated.");
});
