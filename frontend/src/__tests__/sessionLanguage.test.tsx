/**
 * The language picked during onboarding must survive authentication.
 *
 * Previously `applyAccountLanguage` let the account's stored value win, so an
 * existing user who chose French on /onboarding saw the whole app snap back to
 * the old account language right after signing in. These tests pin the new
 * contract: an explicit guest choice is remembered and written back to the
 * account, while registration starts the account in that same language.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n, {
  LANGUAGE_CHOICE_STORAGE_KEY,
  changeAppLanguage,
  rememberLanguageChoice,
} from "../i18n";
import { tokenStore } from "../api/tokens";
import { SessionProvider, useSession } from "../state/app-context";
import type { RegisterPayload, User } from "../api/types";

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  socialLogin: vi.fn(),
  verifyLoginOtp: vi.fn(),
  updateMe: vi.fn(),
}));

vi.mock("../api/auth", () => mocks);

vi.mock("../realtime/socket", () => ({
  realtime: { setIdentity: vi.fn() },
}));

const accountUser: User = {
  id: 8,
  username: "amani",
  email: "amani@example.test",
  first_name: "Amani",
  last_name: "Juma",
  role: "patient",
  phone: "",
  is_superuser: false,
  profile_image: null,
  date_joined: null,
  language: "en",
};

const registration: RegisterPayload = {
  username: "amani",
  email: "amani@example.test",
  password: "strong-pass-1",
  password_confirm: "strong-pass-1",
  first_name: "Amani",
  last_name: "Juma",
  role: "patient",
};

function Harness() {
  const { status, user, login, register } = useSession();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user-language">{user?.language ?? "none"}</span>
      <button type="button" onClick={() => void login("amani", "strong-pass-1")}>
        sign in
      </button>
      <button type="button" onClick={() => void register(registration)}>
        register
      </button>
    </div>
  );
}

async function chooseFrenchAsGuest() {
  rememberLanguageChoice("fr");
  await changeAppLanguage("fr");
  expect(window.localStorage.getItem(LANGUAGE_CHOICE_STORAGE_KEY)).toBe("fr");
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  window.localStorage.clear();
  window.sessionStorage.clear();
  tokenStore.clear();
  mocks.getMe.mockReset();
  mocks.login.mockReset();
  mocks.logout.mockReset();
  mocks.register.mockReset();
  mocks.socialLogin.mockReset();
  mocks.verifyLoginOtp.mockReset();
  mocks.updateMe.mockReset();
});

describe("language chosen before authentication", () => {
  it("stays active after signing into an account with another language", async () => {
    const user = userEvent.setup();
    await chooseFrenchAsGuest();

    mocks.login.mockResolvedValue({
      data: {
        access: "access-token",
        refresh: "refresh-token",
        user: { ...accountUser, language: "en" },
      },
    });
    mocks.updateMe.mockResolvedValue({
      data: { ...accountUser, language: "fr" },
    });

    render(
      <SessionProvider>
        <Harness />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));
    await user.click(screen.getByRole("button", { name: "sign in" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("fr"));

    expect(mocks.updateMe).toHaveBeenCalledWith({ language: "fr" });
    await waitFor(() =>
      expect(screen.getByTestId("user-language")).toHaveTextContent("fr")
    );
    expect(window.localStorage.getItem(LANGUAGE_CHOICE_STORAGE_KEY)).toBeNull();
  });

  it("creates a new account in the chosen language without a follow-up PATCH", async () => {
    const user = userEvent.setup();
    await chooseFrenchAsGuest();

    mocks.register.mockResolvedValue({
      data: {
        access: "access-token",
        refresh: "refresh-token",
        user: { ...accountUser, language: "fr" },
      },
    });

    render(
      <SessionProvider>
        <Harness />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("guest"));
    await user.click(screen.getByRole("button", { name: "register" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));

    expect(mocks.register).toHaveBeenCalledWith({ ...registration, language: "fr" });
    expect(mocks.updateMe).not.toHaveBeenCalled();
    expect(i18n.resolvedLanguage).toBe("fr");
    expect(window.localStorage.getItem(LANGUAGE_CHOICE_STORAGE_KEY)).toBeNull();
  });
});
