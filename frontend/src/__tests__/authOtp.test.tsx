/**
 * The second login step in the browser: a correct password swaps the
 * credentials form for the OTP challenge screen, the typed code is verified
 * through the session, and the flow can walk back to the password step.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../api/client";
import { LoginScreen } from "../screens/auth";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  verifyLogin: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useSession: () => ({
    status: "guest",
    user: null,
    login: mocks.login,
    verifyLogin: mocks.verifyLogin,
    register: vi.fn(),
    socialLogin: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
  useToast: () => ({ notify: mocks.notify, toasts: [], dismiss: vi.fn() }),
}));

const CHALLENGE = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeEach(() => {
  mocks.login.mockReset();
  mocks.verifyLogin.mockReset();
  mocks.notify.mockReset();
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

/** Render and reach the code screen after requesting an email code. */
async function reachOtpStep() {
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

    expect(mocks.login).toHaveBeenCalledWith("juma", "pw");
    expect(mocks.verifyLogin).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
    expect(screen.getByText(/expires in 5:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable notifications/i })).toBeNull();
    // No session yet: the Sign In button is gone, the password inputs with it.
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByRole("button", { name: /verify code/i })).toBeDisabled();
  });

  it("does not request browser notification permission to send a verification email", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    mocks.login.mockResolvedValue({ otpRequired: true, challenge: CHALLENGE, expiresIn: 300 });

    await submitCredentials();

    expect(requestPermission).not.toHaveBeenCalled();
    expect(screen.getByText(/sent to the email address on your account/i)).toBeInTheDocument();
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

  it("resends the verification code by email", async () => {
    await reachOtpStep();
    mocks.login.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith("juma", "pw"));
  });
});
