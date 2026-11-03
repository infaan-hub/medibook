/**
 * The second login step in the browser: a correct password swaps the
 * credentials form for the OTP challenge screen, the typed code is verified
 * through the session, and the flow can walk back to the password step.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../api/client";
import * as platform from "../lib/platform";
import { LoginScreen } from "../screens/auth";

const mocks = vi.hoisted(() => ({
  checkLoginCredentials: vi.fn(),
  login: vi.fn(),
  verifyLogin: vi.fn(),
  notify: vi.fn(),
  subscribeToPush: vi.fn(),
}));

vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useSession: () => ({
    status: "guest",
    user: null,
    checkLoginCredentials: mocks.checkLoginCredentials,
    login: mocks.login,
    verifyLogin: mocks.verifyLogin,
    register: vi.fn(),
    socialLogin: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
  useToast: () => ({ notify: mocks.notify, toasts: [], dismiss: vi.fn() }),
}));

vi.mock("../push/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../push/notifications")>()),
  subscribeToPush: mocks.subscribeToPush,
}));

const CHALLENGE = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeEach(() => {
  mocks.checkLoginCredentials.mockReset();
  mocks.checkLoginCredentials.mockResolvedValue(undefined);
  mocks.login.mockReset();
  mocks.verifyLogin.mockReset();
  mocks.notify.mockReset();
  // Default: this browser can't push (jsdom has no Web Push) → login carries
  // no subscription, exactly like the pre-OTP behaviour.
  mocks.subscribeToPush.mockReset();
  mocks.subscribeToPush.mockResolvedValue({ ok: false, reason: "unsupported" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function submitCredentials() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginScreen />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "juma" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
  const form = screen.getByRole("button", { name: /^sign in$/i }).closest("form")!;
  await act(async () => {
    fireEvent.submit(form);
  });
}

/** Render and reach the code screen with a working push subscription. */
async function reachOtpStep() {
  mocks.subscribeToPush.mockResolvedValue({
    ok: true,
    subscription: {
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
        keys: { p256dh: "dh-key", auth: "auth-key" },
      }),
    },
  });
  mocks.login.mockResolvedValue({ otpRequired: true, challenge: CHALLENGE, expiresIn: 300 });
  await submitCredentials();
}

async function submitOtp(code: string) {
  fireEvent.change(screen.getByLabelText("Verification code"), {
    target: { value: code },
  });
  const form = screen.getByRole("button", { name: /verify code/i }).closest("form")!;
  await act(async () => {
    fireEvent.submit(form);
  });
}

describe("LoginScreen OTP step", () => {
  it("shows the code screen after a correct password, with the live expiry", async () => {
    await reachOtpStep();

    expect(mocks.checkLoginCredentials).toHaveBeenCalledWith("juma", "pw");
    expect(mocks.checkLoginCredentials.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.subscribeToPush.mock.invocationCallOrder[0]
    );
    expect(mocks.subscribeToPush.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.login.mock.invocationCallOrder[0]
    );
    expect(mocks.verifyLogin).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
    expect(screen.getByText(/expires in 5:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable notifications/i })).toBeNull();
    // No session yet: the Sign In button is gone, the password inputs with it.
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByRole("button", { name: /verify code/i })).toBeDisabled();
  });

  it("requests browser notification permission automatically from the sign-in action", async () => {
    class FakeNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = vi.fn(async () => {
        FakeNotification.permission = "granted";
        return "granted" as NotificationPermission;
      });
    }
    vi.stubGlobal("Notification", FakeNotification);
    vi.spyOn(platform, "getNotificationCapability").mockReturnValue({
      platform: "desktop",
      standalone: false,
      secureContext: true,
      notificationApi: true,
      serviceWorker: true,
      pushApi: true,
      iosNeedsHomeScreen: false,
      safariNeedsInstall: false,
      needsInstalledPWA: false,
      canRequestPermission: true,
      webPushSupported: true,
    });
    mocks.subscribeToPush.mockResolvedValue({
      ok: true,
      subscription: {
        toJSON: () => ({
          endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
          keys: { p256dh: "dh-key", auth: "auth-key" },
        }),
      },
    });
    mocks.login.mockResolvedValue({ otpRequired: true, challenge: CHALLENGE, expiresIn: 300 });

    await submitCredentials();

    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
    expect(FakeNotification.requestPermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkLoginCredentials.mock.invocationCallOrder[0]
    );
    expect(screen.queryByRole("button", { name: /enable notifications/i })).toBeNull();
  });

  it("submits the typed code to verifyLogin", async () => {
    mocks.verifyLogin.mockResolvedValue(undefined);
    await reachOtpStep();

    await submitOtp("123456");
    await waitFor(() =>
      expect(mocks.verifyLogin).toHaveBeenCalledWith(CHALLENGE, "123456")
    );
    expect(mocks.notify).toHaveBeenCalledWith("success", "Welcome back to MediBook.");
  });

  it("keeps digits only in the code input", async () => {
    await reachOtpStep();

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "12ab34 56" },
    });
    expect(screen.getByLabelText("Verification code")).toHaveValue("123456");
  });

  it("renders a rejected code as a field error under the input", async () => {
    mocks.verifyLogin.mockRejectedValue(
      new ApiError("The request could not be processed.", 400, {
        otp: ["The code is incorrect or expired."],
      })
    );
    await reachOtpStep();

    await submitOtp("654321");

    expect(
      await screen.findByText("The code is incorrect or expired.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
  });

  it("walks back to the password form without calling verifyLogin", async () => {
    await reachOtpStep();

    fireEvent.click(screen.getByRole("button", { name: /back to password/i }));

    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Verification code")).toBeNull();
    expect(mocks.verifyLogin).not.toHaveBeenCalled();
  });

  it("attaches the browser push subscription when it issues the code", async () => {
    mocks.login.mockResolvedValue({ otpRequired: true, challenge: CHALLENGE, expiresIn: 300 });
    await reachOtpStep();

    expect(mocks.login).toHaveBeenCalledWith(
      "juma",
      "pw",
      expect.objectContaining({
        endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
        p256dh_key: "dh-key",
        auth_key: "auth-key",
        device_info: expect.objectContaining({ source: "login" }),
      })
    );
  });

  it("does not issue the OTP until the user continues after push setup fails", async () => {
    mocks.login.mockResolvedValue({ otpRequired: true, challenge: CHALLENGE, expiresIn: 300 });
    await submitCredentials();

    expect(mocks.checkLoginCredentials).toHaveBeenCalledWith("juma", "pw");
    expect(mocks.login).not.toHaveBeenCalled();
    expect(screen.getByText(/allow browser notifications before a code is sent/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable notifications/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /continue without notifications/i }));
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith("juma", "pw", undefined));
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
  });

  it("resends using the browser subscription without showing an enable button", async () => {
      await reachOtpStep();
      mocks.login.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await waitFor(() =>
        expect(mocks.login).toHaveBeenCalledWith(
          "juma",
          "pw",
          expect.objectContaining({ endpoint: "https://fcm.googleapis.com/fcm/send/device-1" })
        )
      );
      expect(screen.queryByRole("button", { name: /enable notifications/i })).toBeNull();
  });
});
