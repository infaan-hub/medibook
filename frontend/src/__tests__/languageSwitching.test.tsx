import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ProfileScreen } from "../screens/profile";
import { LoginScreen, OnboardingScreen, WelcomeScreen } from "../screens/auth";
import i18n from "../i18n";
import type { User } from "../api/types";
import { ToastProvider } from "../state/app-context";

const mocks = vi.hoisted(() => ({
  user: null as User | null,
  setUser: vi.fn(),
  updateMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  socialLogin: vi.fn(),
  logout: vi.fn(),
  install: vi.fn().mockResolvedValue(false),
}));

vi.mock("../state/app-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/app-context")>();
  const session = () => ({
    status: mocks.user ? "authed" : "guest",
    user: mocks.user,
    setUser: mocks.setUser,
    login: mocks.login,
    register: mocks.register,
    socialLogin: mocks.socialLogin,
    logout: mocks.logout,
  });
  return {
    ...actual,
    useSession: session,
    useOptionalSession: () => (mocks.user ? session() : null),
  };
});

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auth")>()),
  updateMe: mocks.updateMe,
}));

vi.mock("../components/NotificationSettings", () => ({
  NotificationSettings: () => null,
}));

vi.mock("../realtime/socket", () => ({
  useRealtimeEvent: vi.fn(),
  useRealtimeSync: vi.fn(),
}));

vi.mock("../pwa/installPrompt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../pwa/installPrompt")>()),
  useInstallAvailability: () => ({
    installed: false,
    installable: false,
    isIOS: false,
    install: mocks.install,
  }),
}));

const testUser: User = {
  id: 8,
  username: "amani",
  email: "amani@example.test",
  first_name: "Amani",
  last_name: "Juma",
  role: "doctor",
  phone: "",
  is_superuser: false,
  profile_image: null,
  date_joined: null,
};

function renderWithProviders(children: React.ReactNode, initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

async function dismissLanguageGate(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.queryByRole("dialog");
  if (!dialog) return;
  await user.click(
    within(dialog).getByRole("button", {
      name: i18n.getFixedT("en")("onboarding.languagePrompt.continue"),
    })
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

async function switchToFrench(user: ReturnType<typeof userEvent.setup>) {
  await dismissLanguageGate(user);
  const inlineSelect = screen.queryByRole("combobox", { name: /language/i });
  if (inlineSelect) {
    await user.selectOptions(inlineSelect, "fr");
  } else {
    await user.click(screen.getByRole("button", { name: /english/i }));
    await user.click(screen.getByRole("option", { name: "Français" }));
  }
  await waitFor(() => expect(i18n.resolvedLanguage).toBe("fr"));
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  window.localStorage.clear();
  mocks.user = null;
  mocks.setUser.mockReset();
  mocks.updateMe.mockReset().mockImplementation(async (patch: Partial<User>) => ({
    data: { ...testUser, ...patch },
  }));
  mocks.login.mockReset();
  mocks.register.mockReset();
  mocks.socialLogin.mockReset();
  mocks.logout.mockReset();
  mocks.install.mockReset().mockResolvedValue(false);

  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }))
  );
});

describe("language switching across app surfaces", () => {
  it("updates profile copy and syncs the signed-in user's preference", async () => {
    const user = userEvent.setup();
    mocks.user = testUser;
    renderWithProviders(<ProfileScreen />, "/profile");

    await user.click(screen.getByRole("radio", { name: /français/i }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: i18n.getFixedT("fr")("profile.title") })).toBeInTheDocument()
    );
    expect(mocks.updateMe).toHaveBeenCalledWith({ language: "fr" });
    expect(window.localStorage.getItem("medibook_language")).toBe("fr");
  });

  it("updates navigation labels from the sidebar language menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell guestMode><div>Page</div></AppShell>);

    await switchToFrench(user);

    expect(
      screen.getAllByRole("link", { name: i18n.getFixedT("fr")("nav.home") }).length
    ).toBeGreaterThan(0);
    expect(document.documentElement).toHaveAttribute("lang", "fr");
  });

  it("updates authentication copy from the inline language selector", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen />, "/login");

    await switchToFrench(user);

    expect(
      screen.getByRole("heading", { name: i18n.getFixedT("fr")("auth.login") })
    ).toBeInTheDocument();
  });

  it("updates onboarding controls from the inline language selector", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingScreen />, "/onboarding");

    await switchToFrench(user);

    const french = i18n.getFixedT("fr");
    expect(screen.getByRole("button", { name: french("onboarding.skip") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: french("onboarding.next") })).toBeInTheDocument();
  });

  it("asks first-time visitors for a language and translates onboarding immediately", async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<OnboardingScreen />, "/onboarding");

    const english = i18n.getFixedT("en");
    const dialog = screen.getByRole("dialog", {
      name: english("onboarding.languagePrompt.title"),
    });

    for (const language of ["English", "Kiswahili", "Français", "Español", "Deutsch"]) {
      expect(
        within(dialog).getByRole("radio", { name: new RegExp(language, "i") })
      ).toBeInTheDocument();
    }
    expect(
      within(dialog).getByRole("radio", { name: /english/i })
    ).toHaveAttribute("aria-checked", "true");

    await user.click(within(dialog).getByRole("radio", { name: /français/i }));

    const french = i18n.getFixedT("fr");
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("fr"));
    // The choice is remembered for the account that signs in later.
    expect(window.localStorage.getItem("medibook_language_choice")).toBe("fr");
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", {
          name: french("onboarding.languagePrompt.title"),
        })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole("heading", { name: french("onboarding.slides.welcome.title") })
    ).toBeInTheDocument();
    expect(
      screen.getByText(french("onboarding.slides.welcome.steps.2"))
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /français/i })
    ).toHaveAttribute("aria-checked", "true");

    await user.click(
      screen.getByRole("button", { name: french("onboarding.languagePrompt.continue") })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.localStorage.getItem("medibook_language_prompt_seen")).toBe("1");

    // Returning to /onboarding does not ask again.
    first.unmount();
    renderWithProviders(<OnboardingScreen />, "/onboarding");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the language chosen in onboarding on the welcome screen", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <ToastProvider>
          <Routes>
            <Route path="/onboarding" element={<OnboardingScreen />} />
            <Route path="/onboarding/welcome" element={<WelcomeScreen />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /français/i }));

    const french = i18n.getFixedT("fr");
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("fr"));
    expect(window.localStorage.getItem("medibook_language")).toBe("fr");

    await user.click(
      screen.getByRole("button", { name: french("onboarding.languagePrompt.continue") })
    );
    await user.click(screen.getByRole("button", { name: french("onboarding.skip") }));

    expect(
      screen.getByRole("heading", { name: french("auth.welcomeTitle") })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: french("auth.createNewAccount") })
    ).toBeInTheDocument();
  });
});
