/**
 * Admin Reports card (§34) — the period pickers and the two actions that turn
 * a period into a server-generated PDF.
 *
 *  1. Month + year selectors send an explicit `month=YYYY-MM`, so the server
 *     (never the browser clock) resolves the reporting period.
 *  2. "Generate Report" downloads; "View" opens the preview tab — both report
 *     loading and failure states in words a person can act on.
 *  3. A custom range is validated before any request leaves the browser.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AdminDashboardScreen } from "../pages/admin-dashboard";

const mocks = vi.hoisted(() => ({
  downloadAdminReport: vi.fn(),
  viewAdminReport: vi.fn(),
  notify: vi.fn(),
  getAdminStats: vi.fn(),
  listAuditEvents: vi.fn(),
  listAdminUsers: vi.fn(),
  approveDoctor: vi.fn(),
  deleteAdminUser: vi.fn(),
  deleteAdminDoctor: vi.fn(),
  createAdminUser: vi.fn(),
  createAdminDoctor: vi.fn(),
}));

vi.mock("../api/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/reports")>()),
  downloadAdminReport: mocks.downloadAdminReport,
  viewAdminReport: mocks.viewAdminReport,
}));

vi.mock("../api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/admin")>()),
  getAdminStats: mocks.getAdminStats,
  listAuditEvents: mocks.listAuditEvents,
  listAdminUsers: mocks.listAdminUsers,
  approveDoctor: mocks.approveDoctor,
  deleteAdminUser: mocks.deleteAdminUser,
  deleteAdminDoctor: mocks.deleteAdminDoctor,
  createAdminUser: mocks.createAdminUser,
  createAdminDoctor: mocks.createAdminDoctor,
}));

vi.mock("../state/app-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/app-context")>()),
  useToast: () => ({ notify: mocks.notify }),
}));

vi.mock("../realtime/socket", () => ({ useRealtimeSync: vi.fn() }));

const STATS = {
  users: 12,
  patients: 8,
  doctors: 3,
  appointments: 40,
  appointments_by_status: { pending: 3, done: 30 },
};

async function renderDashboard() {
  const result = render(
    <MemoryRouter>
      <AdminDashboardScreen />
    </MemoryRouter>
  );
  // The card only renders once the dashboard's stats have resolved.
  await screen.findByRole("heading", { name: "Reports" });
  return result;
}

/** The Month/Year pair shown for the (default) Month preset. */
function monthYearSelects(container: HTMLElement): [HTMLSelectElement, HTMLSelectElement] {
  const selects = within(container).getAllByRole("combobox") as HTMLSelectElement[];
  expect(selects).toHaveLength(2);
  return [selects[0], selects[1]];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminStats.mockResolvedValue({ success: true, message: "", data: STATS });
  mocks.listAuditEvents.mockResolvedValue({
    success: true,
    message: "",
    data: { results: [] },
  });
  mocks.downloadAdminReport.mockResolvedValue({ filename: "report.pdf", size: 1024 });
  mocks.viewAdminReport.mockResolvedValue({ filename: "report.pdf", size: 1024 });
});

describe("AdminReportsCard", () => {
  it("offers Generate Report and View as separate actions", async () => {
    const { container } = await renderDashboard();
    expect(container).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Report/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^View$/ })).toBeInTheDocument();
  });

  it("sends the picked month and year as month=YYYY-MM", async () => {
    const { container } = await renderDashboard();
    const [monthSelect, yearSelect] = monthYearSelects(container);

    await userEvent.selectOptions(monthSelect, "07");
    const previousYear = yearSelect.options[1].value;
    await userEvent.selectOptions(yearSelect, previousYear);

    await userEvent.click(screen.getByRole("button", { name: /Generate Report/ }));

    await waitFor(() =>
      expect(mocks.downloadAdminReport).toHaveBeenCalledWith({
        preset: "month",
        month: `${previousYear}-07`,
      })
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("report.pdf")
    );
  });

  it("shows an explicit loading label while the PDF is generated", async () => {
    const { container } = await renderDashboard();
    let finish: (result: { filename: string; size: number }) => void = () => undefined;
    mocks.downloadAdminReport.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );

    const generate = screen.getByRole("button", { name: /Generate Report/ });
    await userEvent.click(generate);

    const busy = await screen.findByRole("button", { name: /Generating report/ });
    expect(busy).toBeDisabled();

    finish({ filename: "report.pdf", size: 10 });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Generate Report/ })).toBeEnabled()
    );
    expect(container).toBeInTheDocument();
  });

  it("previews the same period through the View action", async () => {
    const { container } = await renderDashboard();
    const [monthSelect] = monthYearSelects(container);
    await userEvent.selectOptions(monthSelect, "03");

    await userEvent.click(screen.getByRole("button", { name: /^View$/ }));

    await waitFor(() =>
      expect(mocks.viewAdminReport).toHaveBeenCalledWith({
        preset: "month",
        month: expect.stringMatching(/^\d{4}-03$/),
      })
    );
    expect(mocks.downloadAdminReport).not.toHaveBeenCalled();
  });

  it("asks for both custom dates before generating anything", async () => {
    await renderDashboard();

    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    await userEvent.click(screen.getByRole("button", { name: /Generate Report/ }));

    expect(
      await screen.findByText(/Choose both a start and an end date/i)
    ).toBeInTheDocument();
    expect(mocks.downloadAdminReport).not.toHaveBeenCalled();
  });

  it("surfaces the server's reason when generation fails", async () => {
    await renderDashboard();
    mocks.downloadAdminReport.mockRejectedValue(
      new Error("This action is available to administrators only.")
    );

    await userEvent.click(screen.getByRole("button", { name: /Generate Report/ }));

    expect(
      await screen.findByText(/available to administrators only/i)
    ).toBeInTheDocument();
    expect(mocks.notify).toHaveBeenCalledWith(
      "error",
      "This action is available to administrators only."
    );
  });
});
