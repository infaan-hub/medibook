/**
 * Health records — who may upload, whom a record is shared with, and which
 * records each role can read.
 *
 * Everything here is pure (no database): resolveHealthRecordTarget() is the
 * gate on POST /api/health-records/ and healthRecordWhere() is the gate on
 * GET /api/health-records/, so both are covered directly rather than through
 * a live server.
 */
import { describe, expect, it } from "vitest";
import { resolveHealthRecordTarget } from "@/services/treatment.service";
import { healthRecordWhere } from "@/repositories/clinical.repo";
import { healthRecordCreateSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import { ValidationError } from "@/lib/errors";

describe("resolveHealthRecordTarget", () => {
  it("sends a doctor's upload to the patient they name", () => {
    expect(resolveHealthRecordTarget("doctor", 2, { patient: 7 })).toEqual({
      ok: true,
      role: "doctor",
      patientId: 7,
    });
  });

  it("rejects a doctor upload that does not name a patient", () => {
    const target = resolveHealthRecordTarget("doctor", 2, {});
    expect(target.ok).toBe(false);
    if (!target.ok) {
      expect(target.field).toBe("patient");
      expect(target.message).toBe("This field is required.");
    }
  });

  it("sends a patient's upload to the specific doctor they choose", () => {
    expect(resolveHealthRecordTarget("patient", 7, { doctor: 3 })).toEqual({
      ok: true,
      role: "patient",
      doctorId: 3,
    });
  });

  it("rejects a patient upload that does not choose a doctor", () => {
    const target = resolveHealthRecordTarget("patient", 7, {});
    expect(target.ok).toBe(false);
    if (!target.ok) {
      expect(target.field).toBe("doctor");
      expect(target.message).toMatch(/share this record with/i);
    }
  });

  it("never lets a patient post into someone else's chart", () => {
    const target = resolveHealthRecordTarget("patient", 7, { patient: 999, doctor: 3 });
    expect(target).toEqual({ ok: true, role: "patient", doctorId: 3 });
    expect(target.ok && "patientId" in target).toBe(false);
  });

  it("refuses roles that own no chart (admin, anonymous)", () => {
    for (const role of ["admin", ""]) {
      const target = resolveHealthRecordTarget(role, 1, { patient: 2, doctor: 3 });
      expect(target.ok).toBe(false);
      if (!target.ok) expect(target.field).toBe("non_field_errors");
    }
  });
});

describe("healthRecordCreateSchema", () => {
  it("accepts a patient payload with no `patient` field (multipart sends strings)", () => {
    const input = parse(healthRecordCreateSchema, {
      doctor: "3",
      title: "CBC panel — March 2026",
      description: "Fasting sample",
      record_type: "lab_report",
    });
    expect(input.doctor).toBe(3);
    expect(input.patient).toBeUndefined();
    expect(input.title).toBe("CBC panel — March 2026");
    expect(input.record_type).toBe("lab_report");
  });

  it("keeps a doctor payload working exactly as before", () => {
    const input = parse(healthRecordCreateSchema, { patient: "7", title: "X-ray" });
    expect(input.patient).toBe(7);
    expect(input.title).toBe("X-ray");
    expect(input.record_type).toBeUndefined();
  });

  it("rejects an empty title with a DRF field error", () => {
    let caught: ValidationError | null = null;
    try {
      parse(healthRecordCreateSchema, { doctor: 3, title: "" });
    } catch (error) {
      caught = error as ValidationError;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught?.status).toBe(400);
    expect(caught?.errors.title).toBeDefined();
  });

  it("rejects an unknown record type", () => {
    expect(() =>
      parse(healthRecordCreateSchema, { doctor: 3, title: "Scan", record_type: "mri" })
    ).toThrow(ValidationError);
  });
});

describe("healthRecordWhere", () => {
  it("locks a patient to their own records even when ?patient= is supplied", () => {
    expect(healthRecordWhere("patient", 7, null)).toEqual({ patient_id: 7 });
    // Regression: the query param used to overwrite the patient's own id.
    expect(healthRecordWhere("patient", 7, null, "999")).toEqual({ patient_id: 7 });
  });

  it("scopes a doctor to their own records, optionally narrowed to one patient", () => {
    expect(healthRecordWhere("doctor", 7, 3)).toEqual({ doctor_id: 3 });
    expect(healthRecordWhere("doctor", 7, 3, "12")).toEqual({
      doctor_id: 3,
      patient_id: 12,
    });
  });

  it("matches nothing for junk filters and roles without a scope", () => {
    expect(healthRecordWhere("doctor", 7, 3, "abc")).toEqual({
      doctor_id: 3,
      patient_id: -1,
    });
    expect(healthRecordWhere("admin", 1, null, "12")).toEqual({ id: -1 });
    expect(healthRecordWhere("doctor", 1, null)).toEqual({ doctor_id: -1 });
  });
});
