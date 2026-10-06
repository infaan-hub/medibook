/**
 * /profile — the "Notifications" section (mirror of
 * frontend/src/__tests__/NotificationSettings.test.tsx).
 *
 * Pins the three jobs of the card:
 *  1. Safari: a context where the OS cannot present Web Push (iOS Safari tab /
 *     macOS Safari tab) shows the install steps and NEVER an Allow/Enable
 *     button — the shared push state machine owns that decision, and a button
 *     the OS would ignore is exactly what made "tap Allow, nothing happens"
 *     unfixable;
 *  2. the enable action runs the same subscribe() flow as the first-load gate;
 *  3. "Send test notification" drives the real delivery path and its toast
 *     adapts to whether THIS device is registered for push.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettings } from "../components/NotificationSettings";
import { IOS_INSTALL_STEPS } from "../push/prompt";

const mocks = vi.hoisted(() => {
  const push = {
    probed: true,
    state: "DESKTOP_READY",
    permission: "default" as NotificationPermission | "unsupported",
    subscribed: false,
    loading: false,
    error: null as string | null,
    message: "",
    actionLabel: "Allow" as string | null,
    steps: null as readonly string[] | null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  return { push, notify: vi.fn(), sendTestNotification: vi.fn() };
});

vi.mock("../push/usePushNotifications", () => ({
  usePushNotifications: () => mocks.push,
}));

vi.mock("../api/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/notifications")>()),
  sendTestNotification: mocks.sendTestNotification,
}));

vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useToast: () => ({ notify: mocks.notify, toasts: [], dismiss: vi.fn() }),
}));

type PushState = Partial<typeof mocks.push>;

function setPush(overrides: PushState = {}) {
  Object.assign(mocks.push, {
    probed: true,
    state: "DESKTOP_READY",
    permission: "default",
    subscribed: false,
    loading: false,
    error: null,
    message: "",
    actionLabel: "Allow",
    steps: null,
    subscribe: mocks.push.subscribe,
    unsubscribe: mocks.push.unsubscribe,
    ...overrides,
  });
}

beforeEach(() => {
  mocks.notify.mockReset();
  mocks.sendTestNotification.mockReset();
  mocks.push.subscribe.mockReset();
  mocks.push.unsubscribe.mockReset();
  setPush();
});

function renderSection() {
  return render(<NotificationSettings userId={7} />);
}

describe("NotificationSettings — Safari / install contexts", () => {
  it("shows install steps and NO Allow/Enable button when the OS cannot present Web Push", () => {
    setPush({
      state: "IOS_NOT_INSTALLED",
      actionLabel: null,
      steps: IOS_INSTALL_STEPS,
      message: "Install MediBook to enable notifications.",
    });

    renderSection();

    expect(screen.getByText("Tap the Share button in Safari")).toBeInTheDocument();
    expect(screen.getByText("Open MediBook from your Home Screen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /allow/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^enable/i })).toBeNull();
    expect(mocks.push.subscribe).not.toHaveBeenCalled();
  });
});

describe("NotificationSettings — enable flow", () => {
  it("runs the permission + subscribe flow from the Allow tap", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(mocks.push.subscribe).toHaveBeenCalledTimes(1);
  });

  it("offers no request loop once the permission is blocked", () => {
    setPush({
      state: "DENIED",
      actionLabel: null,
      permission: "denied",
      message: "Notifications are blocked. Enable MediBook notifications in your device settings.",
    });

    renderSection();

    expect(screen.getByText(/Notifications are blocked/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /allow/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^enable/i })).toBeNull();
  });
});

describe("NotificationSettings — test notification", () => {
  it("sends the real delivery test and confirms it on a registered device", async () => {
    setPush({
      state: "SUBSCRIBED",
      subscribed: true,
      permission: "granted",
      actionLabel: null,
    });
    mocks.sendTestNotification.mockResolvedValue({
      data: { notification: { id: 1 }, push_subscriptions: 1 },
    });

    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /send test notification/i }));

    await waitFor(() => expect(mocks.sendTestNotification).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        "success",
        expect.stringContaining("Test notification sent")
      )
    );
  });

  it("warns when no device is registered for push instead of claiming success", async () => {
    setPush({ actionLabel: "Allow" });
    mocks.sendTestNotification.mockResolvedValue({
      data: { notification: { id: 1 }, push_subscriptions: 0 },
    });

    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /send test notification/i }));

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        "info",
        expect.stringContaining("no device is registered")
      )
    );
  });
});
