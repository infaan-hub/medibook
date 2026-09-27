/**
 * Emergency section — the regressions that broke it end-to-end:
 *
 *  1. notify() was called with `emergency_appointment_*` notification types the
 *     `NotificationType` enum does not have, so every create/accept/reject threw
 *     a Prisma validation error → 500 on POST /api/emergency/.
 *  2. The create schema silently required GPS + a reason — payloads without them
 *     must fail loudly with field errors rather than a crash.
 *  3. The admin "add doctor" form gained phone fields — they must validate.
 *
 * Pure tests (no database), same style as the other suites.
 */
import { describe, expect, it } from "vitest";
import { emergencyNotificationType } from "@/services/emergency.service";
import { emergencyAppointmentCreateSchema } from "@/validators/misc";
import { adminDoctorCreateSchema } from "@/validators/more";
import { parse } from "@/validators/base";
import { ValidationError } from "@/lib/errors";

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
