/**
 * Login lock UX + the code-less password reset hand-off.
 *
 * The server drives both: a 423 payload carries `locked_until` (countdown) and
 * `requires_admin`, a 400 carries `remaining_attempts`, and the forgot screen
 * carries `reset_handle` straight into the new-password form so the user is
 * never asked to type a code.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "../api/client";
import { ForgotPasswordScreen, LoginScreen, ResetPasswordScreen } from "../screens/auth";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  notify: vi.fn(),
  requestReset: vi.fn(),
  confirmReset: vi.fn(),
}));

vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useSession: () => ({
    status: "guest",
    user: null,
    login: mocks.login,
    register: vi.fn(),
    socialLogin: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
  useToast: () => ({ notify: mocks.notify, toasts: [], dismiss: vi.fn() }),
}));

vi.mock("../api/auth", () => ({
  requestPasswordReset: mocks.requestReset,
  confirmPasswordReset: mocks.confirmReset,
}));

beforeEach(() => {
  mocks.login.mockReset();
  mocks.notify.mockReset();
  mocks.requestReset.mockReset();
  mocks.confirmReset.mockReset();
  mocks.confirmReset.mockResolvedValue({ data: null });
});

function lockedError(options: {
  requiresAdmin: boolean;
  lockedUntil: string | null;
  role: string;
}) {
  return new ApiError(
    options.requiresAdmin
      ? "This account is locked after too many failed sign-in attempts."
      : "Too many failed sign-in attempts.",
    423,
    { non_field_errors: ["Too many failed sign-in attempts."] },
    {
      code: "ACCOUNT_LOCKED",
      role: options.role,
      requires_admin: options.requiresAdmin,
      locked_until: options.lockedUntil,
      wait_seconds: null,
      remaining_attempts: 0,
    }
  );
}

async function submitLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginScreen />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "juma" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
  const form = screen.getByRole("button", { name: /^sign in$/i }).closest("form")!;
  await act(async () => {
    fireEvent.submit(form);
  });
}

describe("LoginScreen lock banner", () => {
  it("renders a live countdown from locked_until and blocks resubmission", async () => {
    mocks.login.mockRejectedValue(
      lockedError({
        requiresAdmin: false,
        lockedUntil: new Date(Date.now() + 125_000).toISOString(),
        role: "patient",
      })
    );

    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Try again in 2:0\d/);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeDisabled();
    // The page-open itself never counted as an attempt.
    expect(mocks.login).toHaveBeenCalledTimes(1);
  });

  it("tells the doctor to wait for an administrator, without a countdown", async () => {
    mocks.login.mockRejectedValue(
      lockedError({ requiresAdmin: true, lockedUntil: null, role: "doctor" })
    );

    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /stays locked until an administrator unlocks it/i
    );
    // No deadline to wait out — the form stays usable so a fresh server state
    // (admin unlocked meanwhile) can be picked up on the next attempt.
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
  });

  it("shows how many attempts remain before the account locks", async () => {
    mocks.login.mockRejectedValue(
      new ApiError("The username or password is incorrect.", 400, {
        non_field_errors: ["The username or password is incorrect."],
      }, {
        code: "INVALID_CREDENTIALS",
        remaining_attempts: 1,
      })
    );

    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The username or password is incorrect."
    );
    expect(
      await screen.findByText(/1 attempt left before this account is locked/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
  });
});

describe("forgot → new password, with no code step", () => {
  it("carries the reset handle straight to the new-password form", async () => {
    mocks.requestReset.mockResolvedValue({ data: { reset_handle: "handle-123" } });

    render(
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
          <Route path="/reset-password" element={<ResetPasswordScreen />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "juma@example.com" },
    });
    const form = screen.getByRole("button", { name: /^reset password$/i }).closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(mocks.requestReset).toHaveBeenCalledWith("juma@example.com");
    // Landed on the new-password screen…
    expect(screen.getByText("Set a new password")).toBeInTheDocument();
    // …with NO "enter the code" field anywhere.
    expect(screen.queryByLabelText(/reset code/i)).toBeNull();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("New password"), {
        target: { value: "BrandNewPass1!" },
      });
      fireEvent.change(screen.getByLabelText("Confirm new password"), {
        target: { value: "BrandNewPass1!" },
      });
      fireEvent.submit(screen.getByRole("button", { name: /update password/i }).closest("form")!);
    });

    expect(mocks.confirmReset).toHaveBeenCalledWith({
      token: "handle-123",
      new_password: "BrandNewPass1!",
      new_password_confirm: "BrandNewPass1!",
    });
  });

  it("offers a way back when the handle is missing (?token= links still work)", async () => {
    render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
          <Route path="/reset-password" element={<ResetPasswordScreen />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/needs the link from your reset email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/reset code/i)).toBeNull();
    expect(screen.getByRole("link", { name: /request a new link/i })).toBeInTheDocument();
  });

  it("accepts the emailed ?token= link as the handle", async () => {
    render(
      <MemoryRouter initialEntries={["/reset-password?token=emailed-token"]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordScreen />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("New password"), {
        target: { value: "BrandNewPass1!" },
      });
      fireEvent.change(screen.getByLabelText("Confirm new password"), {
        target: { value: "BrandNewPass1!" },
      });
      fireEvent.submit(screen.getByRole("button", { name: /update password/i }).closest("form")!);
    });
    expect(mocks.confirmReset).toHaveBeenCalledWith(
      expect.objectContaining({ token: "emailed-token" })
    );
  });
});
