/**
 * Administrative report renderer (§34 family 1).
 *
 * Composition only — every number comes from `reports/data/admin`, every style
 * from the shared component inventory.
 */
import { branding, palette, space, statusTone, type as typeScale } from "../design/tokens";
import type { AdminReportData } from "../data/admin";
import {
  dataTable,
  paragraph,
  sectionTitle,
  subsectionTitle,
  type SummaryCard,
  type TableColumn,
} from "./components";
import type { ReportDoc, ReportChrome } from "./doc";
import { reportHeaderBody, summarySection } from "./sections";
import { footerNoteFor, renderReport, reportId } from "./render";

/** Report title that matches the requested preset. */
export function adminReportTitle(data: AdminReportData): string {
  switch (data.period.preset) {
    case "week":
      return "Weekly Administrative Report";
    case "custom":
      return "Administrative Report";
    default:
      return "Monthly Administrative Report";
  }
}

/**
 * Download-filename fragment (§26): "Monthly Report", "Weekly Report" or
 * "Administrative Report" — combined into
 * `MediBook-Zanzibar-Monthly-Report-<period>.pdf`.
 */
export function adminFilenameReport(data: AdminReportData): string {
  switch (data.period.preset) {
    case "week":
      return "Weekly Report";
    case "custom":
      return "Administrative Report";
    default:
      return "Monthly Report";
  }
}

export function adminChrome(data: AdminReportData): ReportChrome {
  return {
    title: adminReportTitle(data),
    subtitle: "Platform operations, usage and registration activity",
    periodLine: data.period.label,
    rightLine: data.period.name,
    footerNote: footerNoteFor("admin"),
  };
}

function summaryCardsFor(data: AdminReportData): SummaryCard[] {
  return [
    { label: "Total accounts", value: data.totals.users, detail: "All roles, all time", tone: "primary" },
    { label: "Patients", value: data.totals.patients, detail: "Registered patients", tone: "info" },
    { label: "Doctors", value: data.totals.doctors, detail: "Approved clinicians", tone: "primary" },
    { label: "Appointments", value: data.totals.appointments, detail: "All time", tone: "neutral" },
    {
      label: "Appointments in period",
      value: data.totals.periodAppointments,
      detail: data.period.name,
      tone: "info",
    },
    {
      label: "Emergency requests",
      value: data.totals.periodEmergencies,
      detail: `Emergency type, ${data.period.name.toLowerCase()}`,
      tone: "warning",
    },
    {
      label: "Completed visits",
      value: data.totals.completedAppointments,
      detail: "Closed as Done",
      tone: "success",
    },
    {
      label: "New accounts",
      value: data.totals.newAccounts,
      detail: "Created in period",
      tone: "success",
    },
    {
      label: "Health tips",
      value: data.totals.healthTips,
      detail: `${data.totals.periodHealthTips} created in period`,
      tone: "violet",
    },
    {
      label: "Waiting-room check-ins",
      value: data.totals.checkedIn,
      detail: "In period",
      tone: "warning",
    },
  ];
}

function drawAdminBody(d: ReportDoc, data: AdminReportData, id: string): void {
  reportHeaderBody(d, {
    reportId: id,
    classification: branding.confidentialAdministrative,
    title: adminReportTitle(data),
    subtitle:
      "Server-side summary of MediBook Zanzibar platform activity for the reporting period below.",
    period: data.period.label,
    preparedFor: "MediBook Zanzibar Administration",
    preparedBy: "MediBook Zanzibar Reporting Service",
  });

  summarySection(d, summaryCardsFor(data), "Platform summary");

  sectionTitle(d, {
    title: "Appointments by status",
    eyebrow: "Section 2",
    subtitle: `Lifecycle status of the ${data.totals.periodAppointments} appointments dated inside the period.`,
  });
  const statusColumns: TableColumn[] = [
    { key: "label", label: "Status", weight: 2, tone: (_value, row) => statusTone(row.status) },
    { key: "count", label: "Appointments", weight: 1.4, align: "right" },
    { key: "share", label: "Share", weight: 1, align: "right" },
  ];
  dataTable(d, {
    columns: statusColumns,
    rows: data.statusBreakdown.map((row) => ({
      status: row.status,
      label: row.label,
      count: row.count,
      share: row.share,
    })),
    emptyText: "No appointments were dated inside this period.",
  });
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "Emergency requests",
    eyebrow: "Section 3",
    subtitle: `${data.totals.periodEmergencies} emergency appointments dated inside the period, by lifecycle status.`,
  });
  const emergencyColumns: TableColumn[] = [
    { key: "label", label: "Status", weight: 2, tone: (_value, row) => statusTone(row.status) },
    { key: "count", label: "Requests", weight: 1.4, align: "right" },
    { key: "share", label: "Share", weight: 1, align: "right" },
  ];
  dataTable(d, {
    columns: emergencyColumns,
    rows: data.emergencyBreakdown.map((row) => ({
      status: row.status,
      label: row.label,
      count: row.count,
      share: row.share,
    })),
    emptyText: "No emergency requests were dated inside this period.",
  });
  d.moveDown(space[3]);
  subsectionTitle(d, "Emergency requests per day");
  const emergencyDayColumns: TableColumn[] = [
    { key: "date", label: "Date", weight: 1.4 },
    { key: "day", label: "Day", weight: 2 },
    { key: "requests", label: "Requests", weight: 1.2, align: "right" },
    { key: "completed", label: "Completed", weight: 1, align: "right" },
  ];
  dataTable(d, {
    columns: emergencyDayColumns,
    rows: data.dailyEmergencies.map((row) => ({ ...row })),
    emptyText: data.dailyVolumeTruncated
      ? "The reporting period is longer than 92 days, so the per-day breakdown is omitted."
      : "No emergency requests were dated inside this period.",
  });
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "Top doctors by activity",
    eyebrow: "Section 4",
    subtitle: "Clinicians with the most appointments dated inside the period.",
  });
  const doctorColumns: TableColumn[] = [
    { key: "name", label: "Doctor", weight: 2.2, font: "semibold" },
    { key: "specialty", label: "Specialty", weight: 2.2 },
    { key: "appointments", label: "Appointments", weight: 1.2, align: "right" },
    { key: "completed", label: "Completed", weight: 1, align: "right" },
  ];
  dataTable(d, {
    columns: doctorColumns,
    rows: data.doctorActivity.map((row) => ({ ...row })),
    emptyText: "No appointments were dated inside this period.",
  });
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "Daily appointment volume",
    eyebrow: "Section 5",
    subtitle: "Appointments dated on each day of the reporting period.",
  });
  if (data.dailyVolumeTruncated) {
    paragraph(
      d,
      "The reporting period is longer than 92 days, so the per-day breakdown is omitted. Use a shorter period (week or month) to see it.",
      { color: palette.textMuted }
    );
    d.moveDown(space[3]);
  } else {
    const dayColumns: TableColumn[] = [
      { key: "date", label: "Date", weight: 1.4 },
      { key: "day", label: "Day", weight: 2 },
      { key: "appointments", label: "Appointments", weight: 1.2, align: "right" },
      { key: "completed", label: "Completed", weight: 1, align: "right" },
    ];
    dataTable(d, {
      columns: dayColumns,
      rows: data.dailyVolume.map((row) => ({ ...row })),
      emptyText: "No appointments were dated inside this period.",
    });
    d.moveDown(space[3]);
  }

  sectionTitle(d, {
    title: "Health tips",
    eyebrow: "Section 6",
    subtitle: "Published patient education content (blog articles) on the platform.",
  });
  summarySection(d, [
    { label: "Health tips", value: data.totals.healthTips, detail: "All time", tone: "violet" },
    {
      label: "Published",
      value: data.totals.publishedHealthTips,
      detail: "Visible to patients",
      tone: "success",
    },
    {
      label: "Created in period",
      value: data.totals.periodHealthTips,
      detail: data.period.name,
      tone: "info",
    },
  ]);
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "New accounts by role",
    eyebrow: "Section 7",
    subtitle: `Who the ${data.totals.newAccounts} accounts created in the period belong to.`,
  });
  const roleColumns: TableColumn[] = [
    { key: "role", label: "Role", weight: 2, font: "semibold" },
    { key: "count", label: "Accounts", weight: 1.4, align: "right" },
    { key: "share", label: "Share", weight: 1, align: "right" },
  ];
  dataTable(d, {
    columns: roleColumns,
    rows: data.newAccountsByRole.map((row) => ({ ...row })),
    emptyText: "No accounts were created during this period.",
  });
  d.moveDown(space[3]);
  subsectionTitle(d, "Daily new accounts");
  const accountDayColumns: TableColumn[] = [
    { key: "date", label: "Date", weight: 1.4 },
    { key: "day", label: "Day", weight: 2 },
    { key: "accounts", label: "Accounts", weight: 1.2, align: "right" },
  ];
  dataTable(d, {
    columns: accountDayColumns,
    rows: data.dailyRegistrations.map((row) => ({ ...row })),
    emptyText: data.dailyVolumeTruncated
      ? "The reporting period is longer than 92 days, so the per-day breakdown is omitted."
      : "No accounts were created during this period.",
  });
  d.moveDown(space[3]);

  sectionTitle(d, {
    title: "New registrations",
    eyebrow: "Section 8",
    subtitle: "Accounts created during the reporting period (most recent first).",
  });
  const registrationColumns: TableColumn[] = [
    { key: "date", label: "Date", weight: 1.4 },
    { key: "name", label: "Name", weight: 2, font: "semibold" },
    { key: "role", label: "Role", weight: 1 },
    { key: "email", label: "Email", weight: 2.4 },
  ];
  dataTable(d, {
    columns: registrationColumns,
    rows: data.registrations.map((row) => ({ ...row })),
    emptyText: "No accounts were created during this period.",
  });
  if (data.registrationsTruncated) {
    d.moveDown(space[2]);
    paragraph(
      d,
      `This list shows the ${data.registrations.length} most recent registrations. The totals, role breakdown and daily table above still count every account created in the period (${data.totals.newAccounts}).`,
      { size: typeScale.micro, color: palette.textMuted, accent: true, background: palette.surfaceAlt }
    );
  }
  d.moveDown(space[4]);

  paragraph(
    d,
    "All figures are computed server-side in the reporting timezone configured for MediBook Zanzibar, " +
      "directly from the application database. Appointment and emergency counts use the appointment's " +
      "calendar date; registration and health tip counts use the account/article creation timestamp. " +
      "Health tips are the blog articles served to patients.",
    { size: typeScale.micro, color: palette.textMuted, accent: true, background: palette.surfaceAlt }
  );
}

/**
 * Render the administrative report to a PDF buffer.
 * The buffer is complete (chrome stamped on every page) and safe to stream.
 */
export async function renderAdminReport(
  data: AdminReportData,
  generatedAt: Date = new Date()
): Promise<Buffer> {
  const id = reportId("admin", generatedAt, `${data.period.start}:${data.period.end}`);
  return await renderReport(adminChrome(data), (d) => drawAdminBody(d, data, id), generatedAt);
}

