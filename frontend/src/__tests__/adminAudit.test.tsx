/**
 * Admin audit screen — the 72h retention notice, and the destructive
 * "Clear log" action:
 *
 *   • the header states the trail is kept for the last 72 hours,
 *   • clearing asks for confirmation first (cancel = nothing happens),
 *   • on confirm the API is called once, a success toast reports how many
 *     events were removed, and the list reloads,
 *   • the button is disabled while the trail is empty (nothing to clear).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AuditEvent } from "../api/types";
import { AdminAuditScreen } from "../screens/admin-dashboard";

const mocks = vi.hoisted(() => ({
  listAuditEvents: vi.fn(),
  clearAuditEvents: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useToast: () => ({ notify: mocks.notify, toasts: [], dismiss: vi.fn() }),
}));

vi.mock("../api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/admin")>()),
  listAuditEvents: mocks.listAuditEvents,
  clearAuditEvents: mocks.clearAuditEvents,
}));

const EVENT: AuditEvent = {
  id: 7,
  action: "auth.login",
  target: "/api/auth/login/",
  detail: "HTTP 200 · POST · 12ms",
  actor: "Juma Juma",
  created_at: "2026-10-07T09:30:00.000Z",
};

function listEnvelope(results: AuditEvent[]) {
  return {
    success: true,
    message: "",
    data: { count: results.length, page: 1, page_size: 20, total_pages: 1, next: null, previous: null, results },
  };
}

let confirmSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  mocks.listAuditEvents.mockReset();
  mocks.clearAuditEvents.mockReset();
  mocks.notify.mockReset();
  mocks.listAuditEvents.mockResolvedValue(listEnvelope([EVENT]));
  mocks.clearAuditEvents.mockResolvedValue({ success: true, message: "Audit log cleared.", data: { deleted: 3 } });
});

afterEach(() => {
  confirmSpy?.mockRestore();
  confirmSpy = null;
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/admin/audit"]}>
      <AdminAuditScreen />
    </MemoryRouter>
  );
}

describe("AdminAuditScreen", () => {
  it("lists the trail and states the 72-hour retention window", async () => {
    renderScreen();

    expect(await screen.findByText("auth login")).toBeInTheDocument();
    expect(screen.getByText("Juma Juma")).toBeInTheDocument();
    expect(screen.getByText(/kept for the last 72 hours/i)).toBeInTheDocument();
    expect(mocks.listAuditEvents).toHaveBeenCalledTimes(1);
  });

  it("clears the trail after confirmation and reports the count", async () => {
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderScreen();
    await screen.findByText("auth login");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /clear log/i }));
    });

    expect(window.confirm).toHaveBeenCalledWith("Clear the entire audit log? This cannot be undone.");
    expect(mocks.clearAuditEvents).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith("success", "Audit log cleared (3 events).");
    await waitFor(() => expect(mocks.listAuditEvents).toHaveBeenCalledTimes(2));
  });

  it("does nothing when the confirmation is declined", async () => {
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderScreen();
    await screen.findByText("auth login");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /clear log/i }));
    });

    expect(mocks.clearAuditEvents).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.listAuditEvents).toHaveBeenCalledTimes(1);
  });

  it("keeps the clear button disabled while the trail is empty", async () => {
    mocks.listAuditEvents.mockResolvedValue(listEnvelope([]));

    renderScreen();

    // Wait for the load to land first — while `events` is still null the
    // button renders enabled, and racing that window made this flaky.
    expect(await screen.findByText("No audit events")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear log/i })).toBeDisabled();
  });
});
