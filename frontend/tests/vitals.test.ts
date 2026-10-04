/**
 * Vitals (phase 2) — validation, BMI derivation and the read/write gates.
 * Pure helpers only, the same way prescriptions.test.ts is written.
 */
import { describe, expect, it } from "vitest";
import {
  computeBmi,
  parseRecordedAt,
  resolveVitalTarget,
} from "@/services/vital.service";
import { vitalWhere } from "@/repositories/vitals.repo";
import { vitalsCreateSchema } from "@/validators/clinical";
import { parse } from "@/validators/base";
import { ValidationError } from "@/lib/errors";
import { vitalDto } from "@/lib/serializers";
import type { Doctor, User, Vital } from "@prisma/client";

describe("computeBmi", () => {
  it("derives kg / m² rounded to one decimal", () => {
    expect(computeBmi(70, 175)).toBe(22.9);
    expect(computeBmi(54.4, 160)).toBe(21.2);
  });

  it("returns null when either measurement is missing", () => {
    expect(computeBmi(null, 175)).toBeNull();
    expect(computeBmi(70, null)).toBeNull();
    expect(computeBmi(undefined, undefined)).toBeNull();
  });

  it("never divides by a zero or negative measurement", () => {
    expect(computeBmi(70, 0)).toBeNull();
    expect(computeBmi(0, 175)).toBeNull();
    expect(computeBmi(-70, 175)).toBeNull();
  });
});

describe("parseRecordedAt", () => {
  it("accepts a bare date as local midnight", () => {
    const parsed = parseRecordedAt("2026-09-30");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(8);
    expect(parsed?.getDate()).toBe(30);
  });

  it("accepts date + time without seconds and full ISO", () => {
    expect(parseRecordedAt("2026-09-30T08:15")?.getSeconds()).toBe(0);
    expect(parseRecordedAt("2026-09-30T08:15:42")?.getSeconds()).toBe(42);
  });

  it("treats blank and unparsable input as absent", () => {
    expect(parseRecordedAt(undefined)).toBeUndefined();
    expect(parseRecordedAt(null)).toBeUndefined();
    expect(parseRecordedAt("   ")).toBeUndefined();
    expect(parseRecordedAt("not-a-date")).toBeUndefined();
  });
});

describe("resolveVitalTarget", () => {
  it("lets a doctor record a reading for a named patient", () => {
    expect(resolveVitalTarget("doctor", { patient: 7 })).toEqual({
      ok: true,
      role: "doctor",
      patientId: 7,
    });
  });

  it("requires the patient field for a doctor", () => {
    const target = resolveVitalTarget("doctor", {});
    expect(target.ok).toBe(false);
    if (!target.ok) expect(target.field).toBe("patient");
  });

  it("refuses every non-doctor role", () => {
    for (const role of ["patient", "admin", ""]) {
      const target = resolveVitalTarget(role, { patient: 7 });
      expect(target.ok).toBe(false);
      if (!target.ok) expect(target.field).toBe("non_field_errors");
    }
  });
});

describe("vitalWhere", () => {
  it("locks a patient to their own readings even when ?patient= is supplied", () => {
    expect(vitalWhere("patient", 7, null)).toEqual({ patient_id: 7 });
    expect(vitalWhere("patient", 7, null, "999")).toEqual({ patient_id: 7 });
  });

  it("scopes a doctor to their own readings, optionally narrowed", () => {
    expect(vitalWhere("doctor", 7, 3)).toEqual({ doctor_id: 3 });
    expect(vitalWhere("doctor", 7, 3, "12")).toEqual({ doctor_id: 3, patient_id: 12 });
  });

  it("matches nothing for junk filters and roles without a scope", () => {
    expect(vitalWhere("doctor", 7, 3, "abc")).toEqual({ doctor_id: 3, patient_id: -1 });
    expect(vitalWhere("admin", 1, null)).toEqual({ id: -1 });
  });
});

describe("vitalsCreateSchema", () => {
  it("coerces numeric strings and rounds temperature/weight/height to 1 decimal", () => {
    const input = parse(vitalsCreateSchema, {
      patient: "7",
      systolic_bp: "120",
      diastolic_bp: "80",
      temperature_c: "37.25",
      weight_kg: "70.46",
      height_cm: "175.44",
    });
    expect(input.systolic_bp).toBe(120);
    expect(input.temperature_c).toBe(37.3);
    expect(input.weight_kg).toBe(70.5);
    expect(input.height_cm).toBe(175.4);
  });

  it("rejects an all-blank reading", () => {
    let caught: ValidationError | null = null;
    try {
      parse(vitalsCreateSchema, { patient: 7, notes: "nothing measured" });
    } catch (error) {
      caught = error as ValidationError;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught?.errors.non_field_errors).toBeDefined();
  });

  it("stores systolic, diastolic and pulse exactly as entered", () => {
    // Each half stands on its own: no pairing rule, no ordering rule, no range.
    expect(() => parse(vitalsCreateSchema, { patient: 7, systolic_bp: 120 })).not.toThrow();
    expect(() => parse(vitalsCreateSchema, { patient: 7, diastolic_bp: 80 })).not.toThrow();
    expect(() =>
      parse(vitalsCreateSchema, { patient: 7, systolic_bp: 120, diastolic_bp: 80 })
    ).not.toThrow();
    // systolic <= diastolic is the doctor's call, not an error
    expect(parse(vitalsCreateSchema, { patient: 7, systolic_bp: 80, diastolic_bp: 90 })
      .systolic_bp).toBe(80);
    expect(parse(vitalsCreateSchema, { patient: 7, systolic_bp: 80, diastolic_bp: 90 })
      .diastolic_bp).toBe(90);
    // out of any previously enforced range
    expect(parse(vitalsCreateSchema, { patient: 7, pulse_bpm: 500 }).pulse_bpm).toBe(500);
    expect(parse(vitalsCreateSchema, { patient: 7, systolic_bp: 4 }).systolic_bp).toBe(4);
  });

  it("still requires the recorded integers to be whole numbers", () => {
    expect(() => parse(vitalsCreateSchema, { patient: 7, systolic_bp: 120.5 })).toThrow(
      ValidationError
    );
    expect(() => parse(vitalsCreateSchema, { patient: 7, pulse_bpm: 70.4 })).toThrow(
      ValidationError
    );
  });

  it("enforces measurement ranges on the remaining vitals", () => {
    expect(() =>
      parse(vitalsCreateSchema, { patient: 7, temperature_c: 20 })
    ).toThrow(ValidationError);
    expect(() => parse(vitalsCreateSchema, { patient: 7, weight_kg: 0 })).toThrow(
      ValidationError
    );
    expect(() => parse(vitalsCreateSchema, { patient: 7, spo2_percent: 30 })).toThrow(
      ValidationError
    );
    expect(() => parse(vitalsCreateSchema, { patient: 7, glucose_mg_dl: 5000 })).toThrow(
      ValidationError
    );
  });

  it("rejects a malformed recorded_at", () => {
    expect(() =>
      parse(vitalsCreateSchema, { patient: 7, pulse_bpm: 70, recorded_at: "30/09/2026" })
    ).toThrow(ValidationError);
    expect(() =>
      parse(vitalsCreateSchema, { patient: 7, pulse_bpm: 70, recorded_at: "2026-09-30" })
    ).not.toThrow();
  });

  it("treats a blank recorded_at as omitted", () => {
    const input = parse(vitalsCreateSchema, { patient: 7, pulse_bpm: 70, recorded_at: "" });
    expect(input.recorded_at).toBeUndefined();
    expect(() =>
      parse(vitalsCreateSchema, { patient: 7, pulse_bpm: 70, recorded_at: "   " })
    ).not.toThrow();
  });
});

describe("vitalDto", () => {
  const user = {
    id: 3,
    first_name: "Asha",
    last_name: "Moshi",
  } as User;
  const doctor = { id: 5, user } as unknown as Doctor & { user: User };

  const reading = {
    id: 11,
    patient_id: 7,
    doctor_id: 5,
    appointment_id: null,
    recorded_at: new Date("2026-09-30T08:15:00Z"),
    systolic_bp: 120,
    diastolic_bp: 80,
    pulse_bpm: 72,
    temperature_c: 37.2,
    glucose_mg_dl: null,
    weight_kg: 70.5,
    height_cm: 175.4,
    bmi: 22.9,
    spo2_percent: 98,
    notes: "Seated",
    created_at: new Date("2026-09-30T08:15:00Z"),
    updated_at: new Date("2026-09-30T08:15:00Z"),
    doctor,
  } as Vital & { doctor: Doctor & { user: User } };

  it("serializes the readings plus who took them", () => {
    const dto = vitalDto(reading);
    expect(dto.patient).toBe(7);
    expect(dto.doctor).toBe(5);
    expect(dto.systolic_bp).toBe(120);
    expect(dto.diastolic_bp).toBe(80);
    expect(dto.glucose_mg_dl).toBeNull();
    expect(dto.bmi).toBe(22.9);
    expect(dto.notes).toBe("Seated");
    expect(dto.recorded_by).toBe("Asha Moshi");
    expect(dto.recorded_at).toBe("2026-09-30T08:15:00.000Z");
  });

  it("leaves recorded_by null when the doctor include is missing", () => {
    const dto = vitalDto({ ...reading, doctor: undefined } as unknown as Vital);
    expect(dto.recorded_by).toBeNull();
  });
});
