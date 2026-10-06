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
 *  3. role split: "Send test notification" is ADMIN-ONLY (platform-wide
 *     fan-out) — doctors and patients never see it, while their own-device
 *     turn-on/turn-off controls stay available to every role.
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
  const user = { id: 7, role: "patient", is_superuser: false };
  return { push, user, notify: vi.fn(), sendTestNotification: vi.fn() };
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
  useSession: () => ({ status: "authed", user: mocks.user }),
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

function setUser(role: "patient" | "doctor" | "admin", is_superuser = false) {
  mocks.user.id = 7;
  mocks.user.role = role;
  mocks.user.is_superuser = is_superuser;
}

beforeEach(() => {
  mocks.notify.mockReset();
  mocks.sendTestNotification.mockReset();
  mocks.push.subscribe.mockReset();
  mocks.push.unsubscribe.mockReset();
  setPush();
  setUser("patient");
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

describe("NotificationSettings — own-device controls (all roles)", () => {
  it("runs the permission + subscribe flow from the Allow tap", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(mocks.push.subscribe).toHaveBeenCalledTimes(1);
  });

  it("offers a Turn off action once the device is registered", () => {
    setPush({ state: "SUBSCRIBED", subscribed: true, permission: "granted", actionLabel: null });

    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /turn off/i }));
    expect(mocks.push.unsubscribe).toHaveBeenCalledTimes(1);
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

describe("NotificationSettings — platform test (admin only)", () => {
  it("hides the test button for patients and doctors (turn on/off stays)", () => {
    for (const role of ["patient", "doctor"] as const) {
      setUser(role);
      const { unmount } = renderSection();
      expect(screen.queryByRole("button", { name: /send test notification/i })).toBeNull();
      expect(screen.getByRole("button", { name: /allow/i })).toBeInTheDocument();
      unmount();
    }
  });

  it("lets an admin fan out and reports the reach", async () => {
    setUser("admin");
    mocks.sendTestNotification.mockResolvedValue({
      data: { users: 3, push_subscriptions: 5 },
    });

    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /send test notification/i }));

    await waitFor(() => expect(mocks.sendTestNotification).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        "success",
        expect.stringContaining("5 devices across 3 accounts")
      )
    );
  });

  it("reports when nothing is registered anywhere instead of claiming success", async () => {
    setUser("admin", true); // superuser counts as admin too
    mocks.sendTestNotification.mockResolvedValue({
      data: { users: 0, push_subscriptions: 0 },
    });

    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /send test notification/i }));

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        "info",
        expect.stringContaining("no devices are registered")
      )
    );
  });
});
