/**
 * PDF content — the words a reader actually sees.
 *
 * Layout can only be judged by opening the document, but the content contract
 * is testable: render a report, extract its text and check that every section
 * the spec promises is really there (including the page numbering the chrome
 * stamps on each page).
 */
import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";

import { renderAdminReport } from "@/reports/pdf/admin";
import { renderDoctorReport } from "@/reports/pdf/doctor";
import { renderPatientReport } from "@/reports/pdf/patient";
import type { AdminReportData } from "@/reports/data/admin";
import type { ClinicalHistory } from "@/reports/data/clinical";
import type { DoctorReportData } from "@/reports/data/doctor";
import type { PatientReportData } from "@/reports/data/patient";
import { buildDoctorSummary, buildPatientSummary } from "@/reports/data/people";
import { notProvided } from "@/reports/data/format";

const GENERATED_AT = new Date("2026-10-03T10:15:00.000Z");

const PERIOD = {
  preset: "month" as const,
  start: "2026-10-01",
  end: "2026-10-31",
  label: "1 October 2026 — 31 October 2026",
  name: "This month",
};

const HISTORY: ClinicalHistory = {
  appointments: [
    {
      date: "3 October 2026",
      time: "09:30 – 10:00",
      status: "Done",
      statusKey: "done",
      type: "Emergency",
      reason: "Chest pain",
      doctor: "Dr. Amina Hassan · Cardiology",
      patient: "Salma Juma",
      hospital: "Mnazi Mmoja Hospital",
    },
  ],
  treatments: [],
  prescriptions: [],
  vitals: [
    {
      recordedAt: "3 October 2026, 09:40 AM",
      bloodPressure: "142/90 mmHg",
      pulse: "78 bpm",
      temperature: "36.8 °C",
      glucose: notProvided(null),
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
      notes: "Fasting not required.",
      doctor: "Dr. Amina Hassan · Cardiology",
      flag: "Normal",
    },
  ],
  records: [],
};

const COUNTS = {
  appointments: "1",
  treatments: "0",
  prescriptions: "0",
  vitals: "1",
  labs: "1",
  records: "0",
};

function adminData(): AdminReportData {
  return {
    period: PERIOD,
    totals: {
      users: "1,204",
      patients: "980",
      doctors: "48",
      appointments: "3,480",
      periodAppointments: "612",
      periodEmergencies: "37",
      newAccounts: "74",
      completedAppointments: "401",
      checkedIn: "388",
      healthTips: "26",
      publishedHealthTips: "22",
      periodHealthTips: "4",
    },
    statusBreakdown: [
      { status: "done", label: "Done", count: "401", share: "65.5%" },
      { status: "pending", label: "Pending", count: "120", share: "19.6%" },
    ],
    emergencyBreakdown: [
      { status: "pending", label: "Pending", count: "9", share: "24.3%" },
      { status: "accepted", label: "Accepted", count: "7", share: "18.9%" },
      { status: "in_progress", label: "In Progress", count: "5", share: "13.5%" },
      { status: "done", label: "Done", count: "11", share: "29.7%" },
      { status: "rejected", label: "Rejected", count: "3", share: "8.1%" },
      { status: "cancelled", label: "Cancelled", count: "1", share: "2.7%" },
      { status: "expired", label: "Expired", count: "1", share: "2.7%" },
    ],
    doctorActivity: [
      { name: "Dr. Amina Hassan", specialty: "Cardiology", appointments: "88", completed: "70" },
    ],
    dailyVolume: [
      { date: "01 Oct 2026", day: "Thursday 01 Oct 2026", appointments: "48", completed: "30" },
    ],
    dailyEmergencies: [
      { date: "01 Oct 2026", day: "Thursday 01 Oct 2026", requests: "4", completed: "1" },
    ],
    dailyRegistrations: [
      { date: "01 Oct 2026", day: "Thursday 01 Oct 2026", accounts: "9" },
    ],
    newAccountsByRole: [
      { role: "Patient", count: "58", share: "78.4%" },
      { role: "Doctor", count: "11", share: "14.9%" },
      { role: "Admin", count: "5", share: "6.8%" },
    ],
    registrations: [
      { date: "2 October 2026", name: "Salma Juma", role: "Patient", email: "salma@example.com" },
    ],
    dailyVolumeTruncated: false,
    registrationsTruncated: false,
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
} as never;

const DOCTOR_ROW = {
  id: 3,
  qualifications: "MBChB, MMed",
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
} as never;

async function extract(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text.replace(/\s+/g, " "), pages: result.pages.length };
  } finally {
    await parser.destroy();
  }
}

async function text(buffer: Buffer): Promise<string> {
  return (await extract(buffer)).text;
}

/**
 * The renderer letterspaces headings and the extractor compensates with stray
 * spaces ("AT A GL ANCE", "Emerg ency"), so compare on letters and digits only.
 */
function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function contains(copy: string, needle: string): boolean {
  return compact(copy).includes(compact(needle));
}

function expectText(copy: string, needles: string[]): void {
  for (const needle of needles) {
    expect(contains(copy, needle), `report text is missing "${needle}"`).toBe(true);
  }
}

describe("admin report content", () => {
  it("prints every section the specification promises", async () => {
    const copy = await text(await renderAdminReport(adminData(), GENERATED_AT));

    expectText(copy, [
      "Monthly Administrative Report",
      "Platform summary",
      "Appointments by status",
      "Emergency requests",
      "Emergency requests per day",
      "Top doctors by activity",
      "Daily appointment volume",
      "Health tips",
      "New accounts by role",
      "Daily new accounts",
      "New registrations",
      "1 October 2026 — 31 October 2026",
      // Every emergency lifecycle state is named, including the zero ones.
      "Pending",
      "Accepted",
      "In Progress",
      "Done",
      "Rejected",
      "Cancelled",
      "Expired",
      "Patient",
      "Doctor",
      "Admin",
    ]);
  });

  it("stamps a page number on every page", async () => {
    const { text: copy, pages } = await extract(await renderAdminReport(adminData(), GENERATED_AT));
    const found = copy.match(/Page \d+ of \d+/g) ?? [];
    expect(found).toHaveLength(pages);
    expect(new Set(found.map((entry) => entry.split(" ")[3])).size).toBe(1);
  });
});

describe("medical report content", () => {
  const fixture = (): DoctorReportData => ({
    period: PERIOD,
    doctor: buildDoctorSummary(DOCTOR_ROW),
    patient: buildPatientSummary(PATIENT_ROW),
    history: HISTORY,
    counts: COUNTS,
  });

  it("names the patient, the clinician and the observed values", async () => {
    const copy = await text(await renderDoctorReport(fixture(), GENERATED_AT));

    expectText(copy, [
      "Salma Juma",
      "Dr. Amina Hassan",
      "Cardiology",
      "Vital signs",
      "Clinician",
      "Laboratory tests",
      "Ordered by: Dr. Amina Hassan",
      "Complete blood count",
      "Penicillin",
      "Emergency",
      // Missing values are labelled, never blank.
      "Not provided",
    ]);
  });

  it("renders the patient's own report with the same honesty", async () => {
    const data: PatientReportData = {
      period: PERIOD,
      patient: buildPatientSummary(PATIENT_ROW),
      history: HISTORY,
      counts: COUNTS,
    };
    const copy = await text(await renderPatientReport(data, GENERATED_AT));

    expectText(copy, [
      "Salma Juma",
      "Emergency",
      "142/90 mmHg",
      "Not provided",
      "Scope: everything on your record",
      "nothing in this document is inferred",
    ]);
  });
});
