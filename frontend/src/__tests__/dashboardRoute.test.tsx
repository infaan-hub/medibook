import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { DashboardRoute } from "../components/DashboardRoute";
import { RequirePatient } from "../components/guards";
import { isStandalonePWA } from "../lib/platform";

const session = vi.hoisted(() => ({
  status: "guest" as "guest" | "authed" | "booting",
  user: null as { role: "patient"; is_superuser: boolean } | null,
}));

vi.mock("../state/app-context", () => ({
  useSession: () => session,
}));

vi.mock("../lib/platform", () => ({
  isStandalonePWA: vi.fn(),
}));

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children, guestMode }: { children: React.ReactNode; guestMode?: boolean }) => (
    <div data-testid="app-shell">
      {guestMode && (
        <nav aria-label="Guest actions">
          <a href="/login">Log in</a>
          <a href="/register">Register</a>
        </nav>
      )}
      {children}
    </div>
  ),
}));

function CurrentPath() {
  const { pathname } = useLocation();
  return <span data-testid="current-path">{pathname}</span>;
}

function renderRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/dashboard"
          element={<DashboardRoute><div>Home page</div></DashboardRoute>}
        />
        <Route path="/doctors" element={<RequirePatient><div>Doctor directory</div></RequirePatient>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
      <CurrentPath />
    </MemoryRouter>
  );
}

beforeEach(() => {
  session.status = "guest";
  session.user = null;
  vi.mocked(isStandalonePWA).mockReturnValue(false);
});

describe("dashboard guest access", () => {
  it("shows the home page to a guest in a web browser", () => {
    renderRoute("/dashboard");

    expect(screen.getByText("Home page")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toContainElement(screen.getByText("Home page"));
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
  });

  it("keeps doctor search behind login for guests", () => {
    renderRoute("/doctors");

    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/login");
  });

  it("keeps the existing login gate for an installed app guest", () => {
    vi.mocked(isStandalonePWA).mockReturnValue(true);
    renderRoute("/dashboard");

    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Home page")).not.toBeInTheDocument();
  });

  it("shows the home page inside the app shell for a signed-in patient", () => {
    session.status = "authed";
    session.user = { role: "patient", is_superuser: false };
    renderRoute("/dashboard");

    expect(screen.getByTestId("app-shell")).toContainElement(screen.getByText("Home page"));
  });
});
