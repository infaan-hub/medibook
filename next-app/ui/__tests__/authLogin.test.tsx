/**
 * Login failure visibility (regression — mirror of frontend/src/__tests__/authLogin.test.tsx).
 *
 * Wrong credentials arrive from the API as a DRF non-field error:
 *   { success: false, errors: { non_field_errors: ["The username or password is incorrect."] } }
 *
 * `fieldErrors()` used to map `non_field_errors` into `formErrors`, which
 *   a) suppressed the top-level banner (it only renders when the map ends up
 *      empty), and
 *   b) left the message with no input to render under —
 * so a bad password silently returned the form to its idle state with no
 * status at all.
 *
 * These tests pin the contract after the fix: non-field messages land in the
 * top banner, genuine field errors still render under their own input.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../api/client";
import { LoginScreen } from "../pages/auth";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  notify: vi.fn(),
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

beforeEach(() => {
  mocks.login.mockReset();
  mocks.notify.mockReset();
});

/** Render the login screen and submit the given credentials. */
async function submitLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginScreen />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "saleh" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "wrong-password" },
  });
  const form = screen
    .getByRole("button", { name: /^sign in$/i })
    .closest("form") as HTMLFormElement;
  // act() flushes the rejected promise so the screen's setState lands inside
  // the act scope instead of leaking "not wrapped in act" warnings.
  await act(async () => {
    fireEvent.submit(form);
  });
}

describe("LoginScreen error reporting", () => {
  it("surfaces wrong credentials as a visible invalid-credentials message", async () => {
    mocks.login.mockRejectedValue(
      new ApiError("The username or password is incorrect.", 400, {
        non_field_errors: ["The username or password is incorrect."],
      })
    );

    await submitLogin();

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("The username or password is incorrect.");
    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith("saleh", "wrong-password")
    );
  });

  it("still renders genuine field errors under their input, without the banner", async () => {
    mocks.login.mockRejectedValue(
      new ApiError("The request could not be processed.", 400, {
        username: ["This field is required."],
      })
    );

    await submitLogin();

    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
