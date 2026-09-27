/**
 * Pure decision helpers for the push-notification prompt — no DOM imports so
 * they can be unit-tested in the node test environment.
 *
 * Why this exists (root cause of "no push ever arrives"):
 * - the old prompt only rendered for `permission === "default" && !subscribed`,
 *   so a user whose permission was already GRANTED but whose subscription was
 *   missing/cleared had no way to (re)subscribe;
 * - subscription failures were swallowed, so the UI claimed success while the
 *   server stored nothing (database: 0 push-subscription rows → the server
 *   send path exits at `subs.length === 0` and no OS notification can exist).
 */

/** Failure reasons surfaced by `subscribeToPush()`. */
export type PushFailureReason =
  | "unsupported"
  | "insecure"
  | "no-sw"
  | "no-vapid-key"
  | "permission-denied"
  | "timeout"
  | "failed";

export type PushPromptMode =
  /** Not subscribed, permission still askable → show the Enable button. */
  | "enable"
  /** Permission granted but no subscription stored → show Enable to heal. */
  | "resubscribe"
  /** Permission denied → show a hint, no button (browser must be re-enabled). */
  | "blocked"
  /** Subscribed (or nothing sensible to show) → hide the prompt. */
  | "hidden";

/**
 * Decide what the patient-home push banner should do for the current state.
 * - `default` + !subscribed → "enable" (first-time ask)
 * - `granted` + !subscribed → "resubscribe" (heals the broken state that
 *   previously hid the prompt forever)
 * - `denied` + !subscribed → "blocked" (instructions, no button)
 * - subscribed → "hidden"
 */
export function pushPromptMode(
  permission: NotificationPermission | "unsupported",
  subscribed: boolean
): PushPromptMode {
  if (subscribed) return "hidden";
  if (permission === "unsupported") return "hidden";
  if (permission === "granted") return "resubscribe";
  if (permission === "denied") return "blocked";
  return "enable";
}

/** Short, user-facing copy for each prompt mode. */
export function pushPromptMessage(mode: PushPromptMode): string {
  switch (mode) {
    case "enable":
      return "Enable notifications for appointment reminders";
    case "resubscribe":
      return "Notifications are allowed but not active on this device — tap Enable to finish setup";
    case "blocked":
      return "Notifications are blocked — allow them for this site in your browser settings";
    default:
      return "";
  }
}

/** User-facing copy for a subscribe/registration failure. */
export function pushFailureMessage(reason: PushFailureReason): string {
  switch (reason) {
    case "unsupported":
      return "This browser does not support push notifications.";
    case "insecure":
      return "Push notifications require HTTPS (or localhost). Open the app over HTTPS and try again.";
    case "no-sw":
      return "The app's background service could not start. Reload the page and try again.";
    case "no-vapid-key":
      return "The server did not provide its push encryption key. Check that VAPID keys are configured.";
    case "permission-denied":
      return "Notification permission was declined. Allow notifications for this site in your browser settings.";
    case "timeout":
      return "The background service took too long to start. Reload the page and try again.";
    default:
      return "Could not enable push notifications. Please try again.";
  }
}
