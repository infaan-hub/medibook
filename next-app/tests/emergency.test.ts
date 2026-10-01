/**
 * Emergency section — the regressions that broke it end-to-end:
 *
 *  1. notify() was called with `emergency_appointment_*` notification types the
 *     `NotificationType` enum does not have, so every create/accept/reject threw
 *     a Prisma validation error → 500 on POST /api/emergency/.
 *  2. The create schema silently required GPS + a reason — payloads without them
 *     must fail loudly with field errors rather than a crash.
 *  3. The admin "add doctor" form gained phone fields — they must validate.
 *  4. Dispatch runs on the CURRENT time: a doctor counts as available only when
 *     an active window covers that moment (no break, no closure on the date),
 *     and a payload may omit date/time entirely (the server stamps "now").
 *
 * Pure tests (no database), same style as the other suites.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emergencyNotificationType, isDoctorAvailableAt } from "@/services/emergency.service";
import { emergencyAppointmentCreateSchema } from "@/validators/misc";
import { adminDoctorCreateSchema } from "@/validators/more";
import { parse } from "@/validators/base";
import { ValidationError } from "@/lib/errors";

const state = vi.hoisted(() => ({
  windows: [] as {
    id: number;
    doctor_id: number;
    weekday: number;
    is_active: boolean;
    start_time: string;
    end_time: string;
  }[],
  breaks: [] as { availability_id: number; start_time: string; end_time: string }[],
  exceptions: [] as {
    doctor_id: number;
    date: Date;
    start_time: string | null;
    end_time: string | null;
  }[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    doctor: { findMany: async () => [] },
    availability: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const id = where.doctor_id as number;
        return state.windows
          .filter(
            (row) =>
              row.doctor_id === id &&
              row.weekday === where.weekday &&
              row.is_active === where.is_active
          )
          .map((row) => ({
            ...row,
            breaks: state.breaks
              .filter((item) => item.availability_id === row.id)
              .sort((a, b) => (a.start_time < b.start_time ? -1 : 1)),
          }));
      },
    },
    scheduleException: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const id = where.doctor_id as number;
        const date = where.date as Date;
        return state.exceptions.filter(
          (row) => row.doctor_id === id && row.date.getTime() === date.getTime()
        );
      },
    },
  },
}));

describe("emergencyNotificationType", () => {
  it("maps every emergency event onto a member of the NotificationType enum", () => {
    const valid = [
      "appointment_request",
      "appointment_confirmed",
      "appointment_cancelled",
      "appointment_rejected",
      "appointment_reminder",
      "review",
      "system",
    ];
    for (const kind of ["requested", "accepted", "rejected"] as const) {
      expect(valid).toContain(emergencyNotificationType(kind));
    }
  });

  it("regression: never returns an emergency_* name the DB enum lacks", () => {
    for (const kind of ["requested", "accepted", "rejected"] as const) {
      expect(emergencyNotificationType(kind)).not.toMatch(/^emergency_/);
    }
  });
});

describe("emergencyAppointmentCreateSchema", () => {
  const base = {
    doctor: "4",
    appointment_date: "2026-10-01",
    start_time: "09:00",
    end_time: "09:30",
    emergency_reason: "severe_pain",
    emergency_latitude: -6.7924,
    emergency_longitude: 39.2083,
  };

  it("accepts a full SOS payload (string ids coerced, extras passed through)", () => {
    const input = parse(emergencyAppointmentCreateSchema, {
      ...base,
      emergency_description: "Chest pain since morning",
      emergency_location_accuracy: 12,
    });
    expect(input.doctor).toBe(4);
    expect(input.emergency_latitude).toBeCloseTo(-6.7924);
    expect(input.emergency_reason).toBe("severe_pain");
  });

  it("accepts a payload with no doctor — auto-dispatch picks the nearest free one", () => {
    const { doctor: _omitted, ...withoutDoctor } = base;
    const input = parse(emergencyAppointmentCreateSchema, withoutDoctor);
    expect(input.doctor).toBeUndefined();
    expect(input.emergency_reason).toBe("severe_pain");
    expect(input.emergency_latitude).toBeCloseTo(-6.7924);
  });

  it("rejects a payload with no location (the API requires GPS)", () => {
    let caught: ValidationError | null = null;
    try {
      parse(emergencyAppointmentCreateSchema, {
        ...base,
        emergency_latitude: undefined,
        emergency_longitude: undefined,
      });
    } catch (error) {
      caught = error as ValidationError;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught?.status).toBe(400);
    expect(caught?.errors.emergency_latitude).toBeDefined();
    expect(caught?.errors.emergency_longitude).toBeDefined();
  });

  it("rejects an unknown emergency reason", () => {
    expect(() =>
      parse(emergencyAppointmentCreateSchema, { ...base, emergency_reason: "zombie_attack" })
    ).toThrow(ValidationError);
  });

  it("rejects an end time at or before the start time", () => {
    expect(() =>
      parse(emergencyAppointmentCreateSchema, { ...base, start_time: "10:00", end_time: "10:00" })
    ).toThrow(ValidationError);
  });

  it("accepts a payload with no date or time — the server stamps the current time", () => {
    const {
      appointment_date: _date,
      start_time: _start,
      end_time: _end,
      ...withoutTimes
    } = base;
    const input = parse(emergencyAppointmentCreateSchema, withoutTimes);
    expect(input.appointment_date).toBeUndefined();
    expect(input.start_time).toBeUndefined();
    expect(input.end_time).toBeUndefined();
    expect(input.emergency_reason).toBe("severe_pain");
  });
});

describe("isDoctorAvailableAt — dispatch availability on the current moment", () => {
  const DOCTOR = 7;
  const MONDAY = 0;
  const DATE = "2026-10-05";
  const TEN_AM = 10 * 3600;

  const window = (
    overrides: Partial<{ weekday: number; is_active: boolean; start_time: string; end_time: string }> = {}
  ) => ({
    id: 1,
    doctor_id: DOCTOR,
    weekday: MONDAY,
    is_active: true,
    start_time: "09:00:00",
    end_time: "17:00:00",
    ...overrides,
  });

  beforeEach(() => {
    state.windows = [];
    state.breaks = [];
    state.exceptions = [];
  });

  it("is available when an active window covers the moment and nothing blocks it", async () => {
    state.windows = [window()];

    await expect(isDoctorAvailableAt(DOCTOR, MONDAY, DATE, TEN_AM)).resolves.toBe(true);
  });

  it("is unavailable outside the window — 17:00 is the exclusive end", async () => {
    state.windows = [window()];

    await expect(isDoctorAvailableAt(DOCTOR, MONDAY, DATE, 17 * 3600)).resolves.toBe(false);
  });

  it("is unavailable when the day was never scheduled for that weekday", async () => {
    state.windows = [window({ weekday: 1 })];

    await expect(isDoctorAvailableAt(DOCTOR, MONDAY, DATE, TEN_AM)).resolves.toBe(false);
  });

  it("is unavailable when the window is deactivated", async () => {
    state.windows = [window({ is_active: false })];

    await expect(isDoctorAvailableAt(DOCTOR, MONDAY, DATE, TEN_AM)).resolves.toBe(false);
  });

  it("is unavailable while a break covers the moment", async () => {
    state.windows = [window()];
    state.breaks = [{ availability_id: 1, start_time: "10:00:00", end_time: "11:00:00" }];

    await expect(isDoctorAvailableAt(DOCTOR, MONDAY, DATE, TEN_AM)).resolves.toBe(false);
  });

  it("is unavailable on a full-day closure", async () => {
    state.windows = [window()];
    state.exceptions = [{ doctor_id: DOCTOR, date: new Date(`${DATE}T00:00:00Z`), start_time: null, end_time: null }];

    await expect(isDoctorAvailableAt(DOCTOR, MONDAY, DATE, TEN_AM)).resolves.toBe(false);
  });

  it("is unavailable during a partial closure but available outside it", async () => {
    state.windows = [window()];
    state.exceptions = [
      {
        doctor_id: DOCTOR,
        date: new Date(`${DATE}T00:00:00Z`),
        start_time: "09:30:00",
        end_time: "10:30:00",
      },
    ];

    await expect(isDoctorAvailableAt(DOCTOR, MONDAY, DATE, TEN_AM)).resolves.toBe(false);
    await expect(isDoctorAvailableAt(DOCTOR, MONDAY, DATE, 11 * 3600)).resolves.toBe(true);
  });

  it("ignores closures recorded on another date", async () => {
    state.windows = [window()];
    state.exceptions = [
      {
        doctor_id: DOCTOR,
        date: new Date("2026-10-06T00:00:00Z"),
        start_time: null,
        end_time: null,
      },
    ];

    await expect(isDoctorAvailableAt(DOCTOR, MONDAY, DATE, TEN_AM)).resolves.toBe(true);
  });
});

describe("adminDoctorCreateSchema phone fields", () => {
  const base = {
    username: "drkimaro",
    email: "kimaro@clinic.tz",
    password: "s3cret-pass",
    first_name: "Neema",
    last_name: "Kimaro",
  };

  it("accepts primary and secondary phone numbers", () => {
    const input = parse(adminDoctorCreateSchema, {
      ...base,
      phone: "+255712345678",
      phone_secondary: "+255755000111",
      experience_years: "8",
    });
    expect(input.phone).toBe("+255712345678");
    expect(input.phone_secondary).toBe("+255755000111");
  });

  it("still works without any phone number (both optional)", () => {
    const input = parse(adminDoctorCreateSchema, base);
    expect(input.username).toBe("drkimaro");
    expect(input.phone).toBeUndefined();
    expect(input.phone_secondary).toBeUndefined();
  });

  it("rejects a phone number longer than the 16-char column", () => {
    let caught: ValidationError | null = null;
    try {
      parse(adminDoctorCreateSchema, { ...base, phone: "1".repeat(17) });
    } catch (error) {
      caught = error as ValidationError;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught?.errors.phone).toBeDefined();
  });
});
