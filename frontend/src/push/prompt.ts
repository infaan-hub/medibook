/**
 * Pure decision helpers for the push-notification prompt — no DOM imports so
 * they can be unit-tested in the node test environment.
 *
 * The prompt is a finite state machine instead of a single "ask again" flow:
 * every state (iOS not installed, ready, requesting, granted, denied,
 * subscribed, failed) has its own copy and its own action, so the UI can never
 * claim permission can be requested in a context where the OS would ignore it
 * (iOS Safari tab), and a subscription/backend failure is never reported as
 * "permission was not granted".
 */
import type { PushPlatform } from "../lib/platform";

/** Failure reasons surfaced by the subscribe/registration flow. */
export type PushFailureReason =
  | "unsupported"
  | "insecure"
  | "no-sw"
  | "no-vapid-key"
  /** iOS Safari tab — Web Push requires the installed Home Screen app. */
  | "not-installed-pwa"
  /** OS answered "denied": blocked at the system level. */
  | "permission-denied"
  /** Prompt closed without an answer; permission is still "default". */
  | "permission-dismissed"
  /** PushManager.subscribe() failed (or produced an incomplete subscription). */
  | "subscription-failed"
  /** Permission granted and subscription created, but the backend refused it. */
  | "backend-failed"
  | "timeout"
  | "failed";

/**
 * Finite state machine for everything notification-related.
 *
 * Order matters: the iOS "not installed as Home Screen app" branch wins over
 * the recorded permission (asking there can never work), and a system-level
 * DENIED always wins over a stale failure so the UI shows settings guidance
 * instead of a retry button that would loop.
 */
export type PushUiState =
  /** No Notification/Push API in this browser. */
  | "UNSUPPORTED"
  /** Not HTTPS (or localhost) — nothing Web Push can do here. */
  | "INSECURE"
  /** iOS/iPadOS Safari tab: must be installed to the Home Screen first. */
  | "IOS_NOT_INSTALLED"
  /** Safari (macOS) tab: must be added to the Dock before Web Push exists. */
  | "SAFARI_NOT_INSTALLED"
  /** iOS Home Screen PWA, permission still askable from a user gesture. */
  | "IOS_READY_TO_REQUEST"
  /** Android browser, permission still askable. */
  | "ANDROID_READY"
  /** Desktop browser, permission still askable. */
  | "DESKTOP_READY"
  /** The OS permission prompt is on screen (or the flow is running). */
  | "REQUESTING"
  /** Permission granted, subscription not stored yet → finish setup. */
  | "GRANTED"
  /** System permission blocked — no re-request, show settings guidance. */
  | "DENIED"
  /** Browser subscription exists AND the backend stored it. */
  | "SUBSCRIBED"
  /** Something failed after the tap; `failure` says exactly what. */
  | "FAILED";

export interface PushStateInput {
  platform: PushPlatform;
  /** Running as an installed Home Screen / standalone PWA. */
  standalone: boolean;
  /** Safari tab that has not been added to the Dock yet. */
  safariNeedsInstall: boolean;
  /** Secure (HTTPS/localhost) context. */
  secure: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  /** A permission request / subscribe flow is in flight. */
  requesting: boolean;
  failure: PushFailureReason | null;
}

export function resolvePushState(input: PushStateInput): PushUiState {
  const {
    platform,
    standalone,
    safariNeedsInstall,
    secure,
    permission,
    subscribed,
    requesting,
  } = input;
  // A stale permission failure must not survive a change of the OS answer:
  // someone who enables notifications in device Settings and comes back goes
  // straight to GRANTED/READY instead of an old "blocked" error.
  const failure =
    input.failure === "permission-denied" && permission !== "denied"
      ? null
      : input.failure === "permission-dismissed" && permission !== "default"
        ? null
        : input.failure;

  if (permission === "unsupported") return "UNSUPPORTED";
  if (!secure) return "INSECURE";
  if (subscribed) return "SUBSCRIBED";
  if (requesting) return "REQUESTING";
  // iOS can only ever subscribe from the Home Screen app — installing comes
  // before any permission talk, whatever the recorded answer happens to be.
  if (platform === "ios" && !standalone) return "IOS_NOT_INSTALLED";
  // Safari on macOS has the same hard requirement, so give the same treatment
  // instead of letting subscribe() fail with no explanation.
  if (safariNeedsInstall) return "SAFARI_NOT_INSTALLED";
  if (permission === "denied") return "DENIED";
  if (failure) return "FAILED";
  if (permission === "granted") return "GRANTED";
  if (platform === "ios") return "IOS_READY_TO_REQUEST";
  if (platform === "android") return "ANDROID_READY";
  return "DESKTOP_READY";
}

/** Short, user-facing copy for each state. `""` = render nothing. */
export function pushStateMessage(
  state: PushUiState,
  failure: PushFailureReason | null = null
): string {
  switch (state) {
    case "IOS_NOT_INSTALLED":
      return "Install MediBook to your Home Screen to enable notifications.";
    case "SAFARI_NOT_INSTALLED":
      return "Safari needs MediBook added to your Dock before it can deliver notifications.";
    case "IOS_READY_TO_REQUEST":
      return "Tap Allow to enable MediBook notifications";
    case "ANDROID_READY":
    case "DESKTOP_READY":
      return "Enable notifications for appointment reminders";
    case "GRANTED":
      return "Notifications are allowed but not active on this device — tap Enable to finish setup";
    case "DENIED":
      return "Notifications are blocked. Enable MediBook notifications in your device settings.";
    case "UNSUPPORTED":
      return "Push notifications are not supported in this browser.";
    case "INSECURE":
      return "Push notifications require HTTPS (or localhost). Open the app over HTTPS and try again.";
    case "FAILED":
      return pushFailureMessage(failure ?? "failed");
    case "REQUESTING":
    case "SUBSCRIBED":
    default:
      return "";
  }
}

/**
 * Label of the action button for the state, or `null` when no action can help
 * (never offer "Allow" for a state the OS would ignore — that is what produced
 * the endless "tap Allow to request it again" loop).
 */
export function pushStateActionLabel(state: PushUiState, failure: PushFailureReason | null = null): string | null {
  switch (state) {
    case "IOS_READY_TO_REQUEST":
    case "ANDROID_READY":
    case "DESKTOP_READY":
      return "Allow";
    case "GRANTED":
      return "Enable";
    case "FAILED":
      return failure === "insecure" || failure === "unsupported" ? null : "Try again";
    default:
      return null;
  }
}

/** True when a prompt surface (modal/banner) has something to offer. */
export function pushStateNeedsPrompt(state: PushUiState): boolean {
  switch (state) {
    case "SUBSCRIBED":
    case "UNSUPPORTED":
    case "INSECURE":
    case "REQUESTING":
      return false;
    default:
      return true;
  }
}

/**
 * iOS/iPadOS steps shown instead of a permission button when MediBook is
 * opened in Safari rather than from the Home Screen.
 */
export const IOS_INSTALL_STEPS = [
  "Tap the Share button in Safari",
  'Choose "Add to Home Screen"',
  "Open MediBook from your Home Screen",
  'Return to Notifications and tap "Allow"',
] as const;

/**
 * macOS Safari is the same rule with different words: Safari only exposes Web
 * Push to a site added to the Dock, so a plain tab can never subscribe.
 */
export const SAFARI_INSTALL_STEPS = [
  "Open the File menu in Safari",
  'Choose "Add to Dock…"',
  "Launch MediBook from your Dock",
  'Return to Notifications and tap "Allow"',
] as const;

/** User-facing copy for a subscribe/registration failure. */
export function pushFailureMessage(reason: PushFailureReason): string {
  switch (reason) {
    case "unsupported":
      return "Push notifications are not supported in this browser.";
    case "insecure":
      return "Push notifications require HTTPS (or localhost). Open the app over HTTPS and try again.";
    case "no-sw":
      return "The app's background service could not start. Reload the page and try again.";
    case "no-vapid-key":
      return "The server did not provide its push encryption key. Check that VAPID keys are configured.";
    case "not-installed-pwa":
      return "Install MediBook to your Home Screen (iPhone, iPad) or Dock (Mac) to enable notifications.";
    case "permission-denied":
      return "Notifications are blocked. Enable MediBook notifications in your device settings.";
    case "permission-dismissed":
      return "Notifications were not enabled — tap Allow to try again.";
    case "subscription-failed":
      return "We couldn't enable notifications. Please try again.";
    case "backend-failed":
      return "Notifications were allowed, but MediBook couldn't register this device. Please try again.";
    case "timeout":
      return "The background service took too long to start. Reload the page and try again.";
    default:
      return "We couldn't enable notifications. Please try again.";
  }
}
