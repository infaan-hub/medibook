/**
 * Login-time push capture.
 *
 * The login screen is signed out, so `ensureServerSubscription()` (which needs
 * a session) cannot run before the OTP code goes out — the password request
 * itself is the only moment the requesting browser can hand over its own
 * subscription. The server upserts that row and notify()'s web-push leg
 * delivers the code to this device (inbox row works regardless).
 *
 * One call does everything: platform gate (iOS needs the installed PWA), the
 * permission request fired synchronously from the Sign-In tap gesture,
 * VAPID-binding verification (stale keys are repaired, not trusted), and
 * subscription reuse. Never throws — every failure just means "inbox only".
 */
import type { LoginPushPayload } from "../api/types";
import { subscribeToPush } from "./notifications";

export async function collectLoginPush(): Promise<LoginPushPayload | undefined> {
  try {
    const result = await subscribeToPush();
    if (!result.ok) return undefined;
    const json = result.subscription.toJSON();
    const keys = json.keys as { p256dh?: string; auth?: string } | undefined;
    if (!json.endpoint || !keys?.p256dh || !keys?.auth) return undefined;
    return {
      endpoint: json.endpoint,
      p256dh_key: keys.p256dh,
      auth_key: keys.auth,
      device_info: {
        source: "login",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      },
    };
  } catch {
    return undefined;
  }
}
