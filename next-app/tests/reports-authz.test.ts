/**
 * Report authorization and aggregation — the gates behind the three PDF
 * endpoints, plus the admin numbers that were easy to get subtly wrong.
 *
 * Everything runs without a database: `@/lib/db` is replaced with a stub, so
 * each assertion sees exactly which rows a collector asked for. That is the
 * point — a report must never be able to read a chart it is not scoped to.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/errors";
import { collectAdminReport } from "@/reports/data/admin";
import { collectDoctorReport } from "@/reports/data/doctor";
import { collectPatientReport } from "@/reports/data/patient";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { count: fn(), findUnique: fn(), findMany: fn() },
    doctor: { count: fn(), findUnique: fn(), findMany: fn() },
    appointment: { count: fn(), findMany: fn() },
    medicalTreatment: { count: fn(), findMany: fn() },
    prescription: { count: fn(), findMany: fn() },
    vital: { count: fn(), findMany: fn() },
    labOrder: { count: fn(), findMany: fn() },
    healthRecord: { count: fn(), findMany: fn() },
    article: { count: fn(), findMany: fn() },
  };
});

vi.mock("@/lib/db", () => ({ prisma: db }));

const DOCTOR = {
  id: 3,
  user: { first_name: "Amina", last_name: "Hassan", username: "amina", email: "amina@example.com" },
  specialties: [{ specialty: { name: "Cardiology" } }],
  hospitals: [],
};

const PATIENT = {
  id: 7,
  role: "patient",
  username: "salma",
  email: "salma@example.com",
  phone: "+255777000111",
  first_name: "Salma",
  last_name: "Juma",
  created_at: new Date("2025-11-14T08:00:00.000Z"),
  patient: { date_of_birth: new Date("1992-04-11T00:00:00.000Z"), gender: "female" },
};

/** Reset every stub to a benign, empty database. */
function emptyDb() {
  vi.clearAllMocks();
  db.user.count.mockResolvedValue(0);
  db.user.findUnique.mockResolvedValue(null);
  db.user.findMany.mockResolvedValue([]);
  db.doctor.count.mockResolvedValue(0);
  db.doctor.findUnique.mockResolvedValue(null);
  db.doctor.findMany.mockResolvedValue([]);
  db.appointment.count.mockResolvedValue(0);
  db.appointment.findMany.mockResolvedValue([]);
  for (const model of [
    db.medicalTreatment,
    db.prescription,
    db.vital,
    db.labOrder,
    db.healthRecord,
  ]) {
    model.count.mockResolvedValue(0);
    model.findMany.mockResolvedValue([]);
  }
  db.article.count.mockResolvedValue(0);
  db.article.findMany.mockResolvedValue([]);
}

beforeEach(emptyDb);

/** Assert a rejection carries the HTTP status the route would answer with. */
async function expectStatus(promise: Promise<unknown>, status: number): Promise<ApiError> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ApiError);
  expect((caught as ApiError).status).toBe(status);
  return caught as ApiError;
}

/* ======================= doctor report authorization ======================= */

describe("collectDoctorReport - who may generate a chart", () => {
  beforeEach(() => {
    db.doctor.findUnique.mockResolvedValue(DOCTOR);
    db.user.findUnique.mockResolvedValue(PATIENT);
  });

  it("refuses a request that names no patient", async () => {
    const error = await expectStatus(collectDoctorReport(3, {}), 400);
    expect(error.message).toMatch(/select a patient/i);
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });

  it("404s a patient id that does not exist", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expectStatus(collectDoctorReport(3, { patient: 999 }), 404);
  });

  it("404s a patient id that belongs to a non-patient account", async () => {
    db.user.findUnique.mockResolvedValue({ ...PATIENT, role: "admin" });
    await expectStatus(collectDoctorReport(3, { patient: 7 }), 404);
  });

  it("refuses a doctor with no recorded activity at all", async () => {
    // Every relationship count is 0: appointment, treatment, prescription,
    // vital, lab order and health record.
    const error = await expectStatus(collectDoctorReport(3, { patient: 7 }), 403);
    expect(error.message).toMatch(/recorded activity/i);
    // The chart is never even assembled — no clinical rows are read.
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });

  it("allows a doctor who shares only an appointment with the patient", async () => {
    db.appointment.count.mockResolvedValue(2);
    const data = await collectDoctorReport(3, { patient: 7 });
    expect(data.patient.reference).toBe("salma");
    expect(data.doctor.reference).toBe("amina");
  });

  it("allows a doctor who shares only a vital with the patient", async () => {
    db.vital.count.mockResolvedValue(1);
    const data = await collectDoctorReport(3, { patient: 7 });
    expect(data.patient.reference).toBe("salma");
  });

  it("reads the patient's full chart while the link gate stays doctor-scoped", async () => {
    db.appointment.count.mockResolvedValue(1);
    await collectDoctorReport(3, { patient: 7 });

    // Authorization: the link check is still scoped to this doctor.
    expect(db.appointment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ doctor_id: 3, patient_id: 7 }),
      })
    );
    // The chart itself is the patient's whole record — never narrowed to one
    // clinician, so the printout cannot hide another doctor's entries.
    expect(db.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patient_id: 7 }),
      })
    );
    expect(db.appointment.findMany.mock.calls[0][0].where).not.toHaveProperty("doctor_id");
    expect(db.vital.findMany.mock.calls[0][0].where).not.toHaveProperty("doctor_id");
    expect(db.healthRecord.findMany.mock.calls[0][0].where).not.toHaveProperty("doctor_id");
  });
});

/* ======================= patient report authorization ====================== */

describe("collectPatientReport - always the caller's own chart", () => {
  it("404s a non-patient caller", async () => {
    db.user.findUnique.mockResolvedValue({ ...PATIENT, role: "doctor" });
    await expectStatus(collectPatientReport(7, {}), 404);
  });

  it("reads the caller's chart, ignoring anything in the query string", async () => {
    db.user.findUnique.mockResolvedValue(PATIENT);
    const data = await collectPatientReport(7, {
      preset: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
      // A hostile extra parameter must never select another chart.
      patient: 999,
    } as never);

    expect(data.patient.reference).toBe("salma");
    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } })
    );
    expect(db.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patient_id: 7 }),
      })
    );
    // Own-record reports are not narrowed to one doctor.
    expect(db.appointment.findMany.mock.calls[0][0].where).not.toHaveProperty("doctor_id");
  });

  it("spans the WHOLE record when no period is requested", async () => {
    db.user.findUnique.mockResolvedValue(PATIENT);

    const data = await collectPatientReport(7, {});

    // Start = the patient's registration date, not the first of this month, so
    // the PDF carries every appointment/treatment/vital/lab they have ever had.
    expect(data.period.start).toBe("2025-11-14");
    expect(data.period.name).toBe("Full record");
    // ISO dates sort lexicographically, so this proves the window opens-to-closes.
    expect(data.period.end >= data.period.start).toBe(true);
  });

  it("narrows to the requested window only when one is actually asked for", async () => {
    db.user.findUnique.mockResolvedValue(PATIENT);

    const data = await collectPatientReport(7, { preset: "month", month: "2026-09" });

    expect(data.period.start).toBe("2026-09-01");
    expect(data.period.end).toBe("2026-09-30");
  });
});

/* ============================ admin aggregation =========================== */

describe("collectAdminReport - platform numbers", () => {
  it("counts emergencies, health tips and account roles for the period", async () => {
    db.user.count.mockResolvedValue(120);
    db.doctor.count.mockResolvedValue(4);
    db.appointment.count.mockResolvedValue(900);
    db.article.count
      .mockResolvedValueOnce(26) // all time
      .mockResolvedValueOnce(22) // published
      .mockResolvedValueOnce(4); // created in period
    db.appointment.findMany.mockImplementation(
      async (args: { where: { appointment_type?: string } }) =>
        args.where.appointment_type === "EMERGENCY"
          ? [{ appointment_date: new Date("2026-09-05T00:00:00.000Z"), status: "done" }]
          : [
              {
                appointment_date: new Date("2026-09-05T00:00:00.000Z"),
                status: "done",
                checked_in_at: new Date("2026-09-05T09:00:00.000Z"),
                doctor_id: 3,
              },
            ]
    );
    db.user.findMany.mockImplementation(
      async (args: { select: { first_name?: boolean } }) => {
        const accounts = [
          { created_at: new Date("2026-09-02T10:00:00.000Z"), role: "patient" },
          { created_at: new Date("2026-09-03T10:00:00.000Z"), role: "patient" },
          { created_at: new Date("2026-09-04T10:00:00.000Z"), role: "doctor" },
        ];
        if (!args.select.first_name) return accounts;
        // The capped list carries names — same three rows, fully detailed.
        return accounts.map((account, index) => ({
          first_name: index === 2 ? "Juma" : "Neema",
          last_name: `Person${index}`,
          username: `person${index}`,
          email: `person${index}@example.com`,
          role: account.role,
          created_at: account.created_at,
        }));
      }
    );

    const data = await collectAdminReport({ preset: "month", month: "2026-09" });

    expect(data.totals.periodEmergencies).toBe("1");
    expect(data.totals.healthTips).toBe("26");
    expect(data.totals.publishedHealthTips).toBe("22");
    expect(data.totals.periodHealthTips).toBe("4");
    expect(data.totals.newAccounts).toBe("3");
    expect(data.newAccountsByRole).toEqual([
      { role: "Patient", count: "2", share: "66.7%" },
      { role: "Doctor", count: "1", share: "33.3%" },
      { role: "Admin", count: "0", share: "0.0%" },
    ]);
    expect(data.dailyRegistrations).toHaveLength(3);
    expect(data.dailyEmergencies).toHaveLength(1);
    expect(data.registrationsTruncated).toBe(false);
  });

  it("lists every emergency lifecycle status once one request exists", async () => {
    db.appointment.findMany.mockImplementation(
      async (args: { where: { appointment_type?: string } }) =>
        args.where.appointment_type === "EMERGENCY"
          ? [
              { appointment_date: new Date("2026-09-05T00:00:00.000Z"), status: "pending" },
              { appointment_date: new Date("2026-09-06T00:00:00.000Z"), status: "expired" },
            ]
          : []
    );

    const data = await collectAdminReport({ preset: "month", month: "2026-09" });

    expect(data.emergencyBreakdown.map((row) => row.status)).toEqual([
      "pending",
      "accepted",
      "in_progress",
      "done",
      "rejected",
      "cancelled",
      "expired",
    ]);
    expect(data.emergencyBreakdown[0].count).toBe("1");
    expect(data.emergencyBreakdown[0].share).toBe("50.0%");
    expect(data.emergencyBreakdown.find((row) => row.status === "expired")?.count).toBe("1");
    expect(data.emergencyBreakdown.find((row) => row.status === "done")?.count).toBe("0");
  });

  it("keeps the emergency section empty but labelled when there were none", async () => {
    const data = await collectAdminReport({ preset: "month", month: "2026-09" });
    expect(data.emergencyBreakdown).toEqual([]);
    expect(data.dailyEmergencies).toEqual([]);
    expect(data.totals.periodEmergencies).toBe("0");
  });

  it("flags the capped registration list without shrinking the totals", async () => {
    db.user.findMany.mockImplementation(
      async (args: { select: { first_name?: boolean }; take?: number }) => {
        if (args.select.first_name) {
          return Array.from({ length: args.take ?? 40 }, (_, index) => ({
            first_name: `Person`,
            last_name: `${index}`,
            username: `person${index}`,
            email: `person${index}@example.com`,
            role: "patient",
            created_at: new Date("2026-09-02T10:00:00.000Z"),
          }));
        }
        return Array.from({ length: 120 }, () => ({
          created_at: new Date("2026-09-02T10:00:00.000Z"),
          role: "patient",
        }));
      }
    );

    const data = await collectAdminReport({ preset: "month", month: "2026-09" });

    expect(data.registrations).toHaveLength(40);
    expect(data.registrationsTruncated).toBe(true);
    expect(data.totals.newAccounts).toBe("120");
    expect(data.dailyRegistrations[0].accounts).toBe("120");
  });

  it("skips the per-day tables for a period longer than 92 days", async () => {
    const data = await collectAdminReport({
      preset: "custom",
      from: "2025-01-01",
      to: "2026-01-31",
    });

    expect(data.dailyVolumeTruncated).toBe(true);
    expect(data.dailyVolume).toEqual([]);
    expect(data.dailyEmergencies).toEqual([]);
    expect(data.dailyRegistrations).toEqual([]);
    // Row-level sections are still produced — only the per-day views are cut.
    expect(data.newAccountsByRole).toEqual([]);
    expect(data.registrations).toEqual([]);
  });
});
