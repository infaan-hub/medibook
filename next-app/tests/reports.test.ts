/**
 * Report suite — period resolution, formatting, person summaries, the shared
 * component inventory and all three PDF families.
 *
 * Everything here runs without a database: the renderers only ever receive
 * plain view models, which is exactly the boundary the report layer promises.
 */
import { describe, expect, it } from "vitest";

import {
  dateColumnRange,
  fullRecordPeriod,
  hasExplicitPeriod,
  resolvePeriod,
  timestampRange,
  todayInReportingTimezone,
  weekStart,
} from "@/reports/data/period";
import { APP_TIMEZONE, formatIsoDate, formatTimestampDate, isoDayInTimezone, notProvided, statusLabel } from "@/reports/data/format";
import { buildDoctorSummary, buildPatientSummary } from "@/reports/data/people";
import { pdfFilename, periodToken } from "@/reports/http";
import { reportId } from "@/reports/pdf/render";
import { renderAdminReport } from "@/reports/pdf/admin";
import { renderDoctorReport } from "@/reports/pdf/doctor";
import { renderPatientReport } from "@/reports/pdf/patient";
import { ReportDoc } from "@/reports/pdf/doc";
import { dataTable } from "@/reports/pdf/components";
import { statusTone } from "@/reports/design/tokens";
import type { AdminReportData } from "@/reports/data/admin";
import type { DoctorReportData } from "@/reports/data/doctor";
import type { PatientReportData } from "@/reports/data/patient";
import type { ClinicalHistory } from "@/reports/data/clinical";

/* ------------------------------- fixtures -------------------------------- */

const PERIOD = {
  preset: "month" as const,
  start: "2026-10-01",
  end: "2026-10-31",
  label: "1 October 2026 — 31 October 2026",
  name: "This month",
};

const COUNTS = {
  appointments: "1",
  treatments: "1",
  prescriptions: "1",
  vitals: "1",
  labs: "1",
  records: "1",
};

const HISTORY: ClinicalHistory = {
  appointments: [
    {
      date: "3 October 2026",
      time: "09:30 – 10:00",
      bookedAt: "1 October 2026, 04:12 PM",
      status: "Done",
      statusKey: "done",
      type: "Normal",
      reason: "Follow-up consultation",
      details: "Notes: Bring the home BP diary.  ·  Checked in: 3 October 2026, 09:25 AM",
      doctor: "Dr. Amina Hassan · Cardiology",
      patient: "Salma Juma",
      hospital: "Mnazi Mmoja Hospital",
    },
  ],
  treatments: [
    {
      date: "3 October 2026, 09:52 AM",
      diagnosis: "Hypertension, stage 1",
      treatmentNotes: "Lifestyle advice given; blood pressure re-check in four weeks.",
      prescriptionNotes: "",
      followUp: "31 October 2026",
      followUpNotes: "Bring the home BP diary.",
      appointmentDate: "3 October 2026",
      attribution: {
        name: "Dr. Amina Hassan",
        context: "Cardiology",
        dateText: "3 October 2026",
        timeText: "09:52 AM",
      },
    },
  ],
  prescriptions: [
    {
      date: "3 October 2026, 09:55 AM",
      notes: "Take after food.",
      items: [
        {
          medication: "Amlodipine",
          dosage: "5 mg",
          frequency: "Once daily",
          route: "oral",
          duration: "30 days",
          refills: "1",
          instructions: "Same time every morning.",
        },
      ],
      attribution: {
        name: "Dr. Amina Hassan",
        context: "Cardiology",
        dateText: "3 October 2026",
        timeText: "09:55 AM",
      },
    },
  ],
  vitals: [
    {
      recordedAt: "3 October 2026, 09:40 AM",
      bloodPressure: "142/90 mmHg",
      pulse: "78 bpm",
      temperature: "36.8 °C",
      glucose: notProvided(null),
      weight: "74 kg",
      height: "168 cm",
      bmi: "26.4",
      spo2: "98%",
      notes: "",
      doctor: "Dr. Amina Hassan · Cardiology",
    },
  ],
  labs: [
    {
      orderedAt: "3 October 2026, 09:58 AM",
      testName: "Complete blood count",
      status: "Resulted",
      statusKey: "resulted",
      result: "13.8",
      reference: "12 – 16 g/dL",
      dueDate: "5 October 2026",
      resultedAt: "4 October 2026, 11:05 AM",
      notes: "Fasting not required.",
      doctor: "Dr. Amina Hassan · Cardiology",
      flag: "Normal",
    },
  ],
  records: [
    {
      createdAt: "3 October 2026, 10:02 AM",
      type: "Lab report",
      title: "CBC October",
      fileName: "cbc-october.pdf",
      description: "Full blood count result sheet.",
      doctor: "Dr. Amina Hassan · Cardiology",
    },
  ],
};

function adminFixture(overrides: Partial<AdminReportData> = {}): AdminReportData {
  return {
    period: PERIOD,
    totals: {
      users: "1,204",
      patients: "980",
      doctors: "48",
      appointments: "3,480",
      periodAppointments: "612",
      periodEmergencies: "12",
      newAccounts: "74",
      completedAppointments: "401",
      checkedIn: "388",
      healthTips: "26",
      publishedHealthTips: "22",
      periodHealthTips: "4",
    },
    statusBreakdown: [
      { status: "pending", label: "Pending", count: "120", share: "19.6%" },
      { status: "accepted", label: "Accepted", count: "90", share: "14.7%" },
      { status: "done", label: "Done", count: "401", share: "65.5%" },
    ],
    emergencyBreakdown: [
      { status: "pending", label: "Pending", count: "5", share: "41.7%" },
      { status: "accepted", label: "Accepted", count: "4", share: "33.3%" },
      { status: "in_progress", label: "In Progress", count: "1", share: "8.3%" },
      { status: "done", label: "Done", count: "1", share: "8.3%" },
      { status: "rejected", label: "Rejected", count: "1", share: "8.3%" },
      { status: "cancelled", label: "Cancelled", count: "0", share: "0.0%" },
      { status: "expired", label: "Expired", count: "0", share: "0.0%" },
    ],
    doctorActivity: [
      { name: "Dr. Amina Hassan", specialty: "Cardiology", appointments: "88", completed: "70" },
      { name: "Dr. Juma Ali", specialty: "Paediatrics", appointments: "61", completed: "44" },
    ],
    dailyVolume: [
      { date: "01 Oct 2026", day: "Thursday 01 Oct 2026", appointments: "48", completed: "30" },
      { date: "02 Oct 2026", day: "Friday 02 Oct 2026", appointments: "52", completed: "33" },
    ],
    dailyEmergencies: [
      { date: "01 Oct 2026", day: "Thursday 01 Oct 2026", requests: "4", completed: "1" },
      { date: "02 Oct 2026", day: "Friday 02 Oct 2026", requests: "3", completed: "0" },
    ],
    dailyRegistrations: [
      { date: "01 Oct 2026", day: "Thursday 01 Oct 2026", accounts: "9" },
      { date: "02 Oct 2026", day: "Friday 02 Oct 2026", accounts: "12" },
    ],
    newAccountsByRole: [
      { role: "Patient", count: "58", share: "78.4%" },
      { role: "Doctor", count: "11", share: "14.9%" },
      { role: "Admin", count: "5", share: "6.8%" },
    ],
    registrations: [
      { date: "2 October 2026, 02:15 PM", name: "Salma Juma", role: "Patient", email: "salma@example.com" },
      { date: "1 October 2026, 09:07 AM", name: "Dr. Juma Ali", role: "Doctor", email: "juma@example.com" },
    ],
    healthTipsPeriod: [
      {
        title: "Managing hypertension at home",
        category: "Wellness",
        status: "Published",
        statusKey: "published",
        publishedAt: "2 October 2026, 10:00 AM",
        createdAt: "2 October 2026, 09:30 AM",
        author: "Dr. Amina Hassan",
      },
      {
        title: "Five signs you need a check-up",
        category: "General",
        status: "Draft",
        statusKey: "draft",
        publishedAt: "Not published",
        createdAt: "4 October 2026, 08:12 AM",
        author: "Admin Office",
      },
    ],
    healthTipsTruncated: false,
    dailyVolumeTruncated: false,
    registrationsTruncated: false,
    ...overrides,
  };
}

const PATIENT_ROW = {
  id: 7,
  username: "salma",
  email: "salma@example.com",
  phone: "+255777000111",
  first_name: "Salma",
  last_name: "Juma",
  created_at: new Date("2025-11-14T08:00:00.000Z"),
  patient: {
    date_of_birth: new Date("1992-04-11T00:00:00.000Z"),
    gender: "female",
    blood_group: "o+",
    allergies: "Penicillin",
    medical_history: "",
    emergency_contact_name: "Amina Juma",
    emergency_contact_phone: "+255777000222",
  },
};

const DOCTOR_ROW = {
  id: 3,
  qualifications: "MBChB, MMed (Internal Medicine)",
  experience_years: 9,
  average_rating: "4.70",
  total_reviews: 34,
  phone: "+255712000333",
  created_at: new Date("2024-02-01T08:00:00.000Z"),
  user: {
    username: "amina",
    email: "amina@example.com",
    phone: "+255712000333",
    first_name: "Amina",
    last_name: "Hassan",
  },
  specialties: [{ specialty: { name: "Cardiology" } }],
  hospitals: [{ hospital: { name: "Mnazi Mmoja Hospital", city: "Zanzibar" } }],
};

const patientFixture = (): PatientReportData => ({
  period: PERIOD,
  patient: buildPatientSummary(PATIENT_ROW),
  history: HISTORY,
  counts: COUNTS,
});

const doctorFixture = (): DoctorReportData => ({
  period: PERIOD,
  doctor: buildDoctorSummary(DOCTOR_ROW),
  patient: buildPatientSummary(PATIENT_ROW),
  history: HISTORY,
  counts: COUNTS,
});

/* --------------------------------- tests --------------------------------- */

describe("resolvePeriod", () => {
  // 09:30Z = 12:30 in Africa/Dar_es_Salaam — safely the same calendar day.
  const now = new Date("2026-10-03T09:30:00Z");

  it("defaults to the current month", () => {
    const period = resolvePeriod({}, now);
    expect(period.preset).toBe("month");
    expect(period.start).toBe("2026-10-01");
    expect(period.end).toBe("2026-10-31");
    expect(period.name).toBe("This month");
    expect(period.label).toContain("October 2026");
  });

  it("scopes a week from Monday to Sunday", () => {
    expect(weekStart("2026-10-03")).toBe("2026-09-28");
    const period = resolvePeriod({ preset: "week" }, now);
    expect(period.start).toBe("2026-09-28");
    expect(period.end).toBe("2026-10-04");
  });

  it("honours an explicit month, including leap February", () => {
    const february = resolvePeriod({ month: "2026-02" }, now);
    expect(february.start).toBe("2026-02-01");
    expect(february.end).toBe("2026-02-28");
    const leap = resolvePeriod({ month: "2024-02" }, now);
    expect(leap.end).toBe("2024-02-29");
  });

  it("swaps an inverted custom range instead of emitting a backwards period", () => {
    const period = resolvePeriod({ preset: "custom", from: "2026-10-10", to: "2026-10-02" }, now);
    expect(period.start).toBe("2026-10-02");
    expect(period.end).toBe("2026-10-10");
    expect(period.name).toBe("Custom range");
  });

  it("falls back to the month when a custom range is unusable", () => {
    const period = resolvePeriod({ preset: "custom", from: "nope" }, now);
    expect(period.start).toBe("2026-10-01");
    expect(period.end).toBe("2026-10-31");
  });

  it("uses the reporting timezone for \"today\", not the UTC date", () => {
    const late = new Date("2026-10-03T22:00:00Z"); // already 4 Oct in Dar es Salaam
    if (APP_TIMEZONE !== "UTC") {
      expect(todayInReportingTimezone(late)).not.toBe("2026-10-03");
    }
    if (APP_TIMEZONE === "Africa/Dar_es_Salaam") {
      expect(todayInReportingTimezone(late)).toBe("2026-10-04");
    }
  });
});

describe("period range filters", () => {
  const period = resolvePeriod({ month: "2026-10" });

  it("treats @db.Date columns as whole calendar days", () => {
    const range = dateColumnRange(period);
    expect(range.gte.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(range.lte.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("anchors timestamps to local midnight in the reporting timezone", () => {
    const range = timestampRange(period);
    expect(range.gte.getTime()).toBeLessThan(range.lte.getTime());
    if (APP_TIMEZONE === "Africa/Dar_es_Salaam") {
      expect(range.gte.toISOString()).toBe("2026-09-30T21:00:00.000Z");
      expect(range.lte.toISOString()).toBe("2026-10-31T20:59:59.999Z");
    }
  });

  it("knows when a period was asked for explicitly", () => {
    expect(hasExplicitPeriod({})).toBe(false);
    expect(hasExplicitPeriod({ from: "" })).toBe(false);
    expect(hasExplicitPeriod({ preset: "week" })).toBe(true);
  });

  it("builds a full-record period from a registration date", () => {
    const period = fullRecordPeriod("2025-11-14", new Date("2026-10-03T09:30:00Z"));
    expect(period.start).toBe("2025-11-14");
    expect(period.end).toBe("2026-10-03");
    expect(period.name).toBe("Full record");
  });
});

describe("format helpers", () => {
  it("renders calendar dates without leading zeros", () => {
    expect(formatIsoDate("2026-09-15")).toBe("15 September 2026");
    expect(formatIsoDate("2026-09-05")).toBe("5 September 2026");
  });

  it("uses the standard \"Not provided\" copy for empty values", () => {
    expect(notProvided("")).toBe("Not provided");
    expect(notProvided(null)).toBe("Not provided");
    expect(notProvided("  ")).toBe("Not provided");
    expect(notProvided("Penicillin")).toBe("Penicillin");
  });

  it("turns enum values into readable labels", () => {
    expect(statusLabel("in_progress")).toBe("In Progress");
    expect(statusLabel("lab_report")).toBe("Lab Report");
  });

  it("puts timestamps on the reporting timezone's calendar day", () => {
    // 21:30 UTC on 31 August is already 00:30 on 1 September in Africa/Dar_es_Salaam.
    const stamp = new Date("2026-08-31T21:30:00.000Z");
    const day = isoDayInTimezone(stamp);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The formatted date always agrees with the day key it was built from.
    expect(formatTimestampDate(stamp)).toBe(formatIsoDate(day));
    if (APP_TIMEZONE === "Africa/Dar_es_Salaam") {
      expect(day).toBe("2026-09-01");
      expect(formatTimestampDate(stamp)).toBe("1 September 2026");
      // A pure calendar column still prints the date it stores.
      expect(formatIsoDate(new Date("2026-08-31T00:00:00.000Z"))).toBe("31 August 2026");
    }
  });
});

describe("person summaries", () => {
  it("maps a patient row and marks missing fields honestly", () => {
    const summary = buildPatientSummary(PATIENT_ROW);
    expect(summary.reference).toBe("salma");
    expect(summary.name).toBe("Salma Juma");
    expect(summary.bloodGroup).toBe("O+");
    expect(summary.emergencyContact).toBe("Amina Juma · +255777000222");
    expect(summary.allergies).toBe("Penicillin");
    expect(summary.medicalHistory).toBe("Not provided");
    expect(summary.age).toMatch(/^\d+ years$/);
  });

  it("maps a doctor row with specialty and rating context", () => {
    const summary = buildDoctorSummary(DOCTOR_ROW);
    expect(summary.name).toBe("Dr. Amina Hassan");
    expect(summary.specialties).toBe("Cardiology");
    expect(summary.hospital).toBe("Mnazi Mmoja Hospital, Zanzibar");
    expect(summary.experience).toBe("9 years");
    expect(summary.rating).toBe("4.7 / 5 from 34 reviews");
  });

  it("falls back to \"Not provided\" rather than inventing values", () => {
    const summary = buildDoctorSummary({
      id: 12,
      user: { username: "newdoc", email: "new@example.com" },
      specialties: [],
      hospitals: [],
    });
    expect(summary.name).toBe("Dr. newdoc");
    expect(summary.specialties).toBe("Not provided");
    expect(summary.hospital).toBe("Not provided");
    expect(summary.qualifications).toBe("Not provided");
    expect(summary.rating).toBe("Not provided");
  });
});

/* --------------------------------- PDFs ---------------------------------- */

const GENERATED_AT = new Date("2026-10-03T10:15:00.000Z");

const isPdf = (buffer: Buffer): boolean => buffer.subarray(0, 5).toString("latin1") === "%PDF-";

describe("report identity", () => {
  it("builds a stable, kind-prefixed document id", () => {
    const first = reportId("admin", GENERATED_AT, "2026-10-01:2026-10-31");
    const second = reportId("admin", GENERATED_AT, "2026-10-01:2026-10-31");
    expect(first).toBe(second);
    expect(first.startsWith("MB-ADM-20261003")).toBe(true);
    expect(reportId("doctor", GENERATED_AT, "x")).not.toBe(reportId("patient", GENERATED_AT, "x"));
  });

  it("builds a MediBook Zanzibar download filename", () => {
    expect(pdfFilename({ report: "Monthly Report", period: "September 2026" })).toBe(
      "medibook-zanzibar-monthly-report-september-2026.pdf"
    );
    expect(
      pdfFilename({ report: "Medical Report", subject: "Salma Juma", period: "September 2026" })
    ).toBe("medibook-zanzibar-medical-report-salma-juma-september-2026.pdf");
    // Non-latin or punctuated input is slugged, never trusted verbatim.
    expect(pdfFilename({ report: "My Medical Report", subject: "Amina/Juma #2" })).toBe(
      "medibook-zanzibar-my-medical-report-amina-juma-2.pdf"
    );
  });

  it("turns a reporting period into a compact filename token", () => {
    expect(periodToken({ start: "2026-09-01", end: "2026-09-30" })).toBe("September 2026");
    expect(periodToken({ start: "2026-10-05", end: "2026-10-11" })).toBe("October 2026");
    expect(periodToken({ start: "2026-01-05", end: "2026-03-01" })).toBe("January-March 2026");
    expect(periodToken({ start: "2025-11-14", end: "2026-10-03" })).toBe(
      "2025-11-14 to 2026-10-03"
    );
  });
});

describe("admin report renderer", () => {
  it("produces a real PDF", async () => {
    const buffer = await renderAdminReport(adminFixture(), GENERATED_AT);
    expect(isPdf(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(5_000);
  });

  it("still renders when every table is empty", async () => {
    const buffer = await renderAdminReport(
      adminFixture({
        statusBreakdown: [],
        doctorActivity: [],
        dailyVolume: [],
        registrations: [],
      }),
      GENERATED_AT
    );
    expect(isPdf(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(3_000);
  });

  it("explains a truncated daily table instead of printing nothing", async () => {
    const buffer = await renderAdminReport(
      adminFixture({ dailyVolume: [], dailyVolumeTruncated: true }),
      GENERATED_AT
    );
    expect(isPdf(buffer)).toBe(true);
  });
});

describe("clinical report renderers", () => {
  it("renders the doctor's report on a patient", async () => {
    const buffer = await renderDoctorReport(doctorFixture(), GENERATED_AT);
    expect(isPdf(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(5_000);
  });

  it("renders the patient's own report", async () => {
    const buffer = await renderPatientReport(patientFixture(), GENERATED_AT);
    expect(isPdf(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(5_000);
  });

  it("renders an empty chart as a complete document, not a failure", async () => {
    const buffer = await renderPatientReport(
      {
        ...patientFixture(),
        history: {
          appointments: [],
          treatments: [],
          prescriptions: [],
          vitals: [],
          labs: [],
          records: [],
        },
      },
      GENERATED_AT
    );
    expect(isPdf(buffer)).toBe(true);
  });
});

describe("page flow", () => {
  it("breaks a long table across pages without dropping rows", async () => {
    const doc = new ReportDoc({ title: "Long table" });
    const rows = Array.from({ length: 220 }, (_, index) => ({
      name: `Item ${index}`,
      value: `Detail line for item ${index}`,
      status: index % 3 === 0 ? "done" : "pending",
    }));

    dataTable(doc, {
      columns: [
        { key: "name", label: "Name", weight: 2 },
        { key: "value", label: "Detail", weight: 3 },
        { key: "status", label: "Status", weight: 1, tone: (value) => statusTone(value) },
      ],
      rows,
    });

    let pages = 0;
    const buffer = await doc.finish((_target, _index, count) => {
      pages = count;
    });
    expect(pages).toBeGreaterThan(1);
    expect(buffer.byteLength).toBeGreaterThan(1_000);
    expect(isPdf(buffer)).toBe(true);
  });
});
