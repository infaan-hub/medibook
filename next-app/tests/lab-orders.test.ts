/**
 * Lab orders (phase 3) — validation, result flagging, status timestamps and
 * the read/write gates. Pure helpers only, same style as the other phases.
 */
import { describe, expect, it } from "vitest";
import {
  resolveLabOrderTarget,
  stampResultedAt,
} from "@/services/lab-order.service";
import { labOrderWhere } from "@/repositories/lab-orders.repo";
import { labOrderCreateSchema, labOrderPatchSchema } from "@/validators/clinical";
import { parse } from "@/validators/base";
import { ValidationError } from "@/lib/errors";
import { labOrderDto, labResultFlag } from "@/lib/serializers";
import type { Doctor, LabOrder, User } from "@prisma/client";

describe("resolveLabOrderTarget", () => {
  it("lets a doctor order a test for a named patient", () => {
    expect(resolveLabOrderTarget("doctor", { patient: 7 })).toEqual({
      ok: true,
      role: "doctor",
      patientId: 7,
    });
  });

  it("requires the patient field for a doctor", () => {
    const target = resolveLabOrderTarget("doctor", {});
    expect(target.ok).toBe(false);
    if (!target.ok) expect(target.field).toBe("patient");
  });

  it("refuses patients, admins and unknown roles", () => {
    for (const role of ["patient", "admin", ""]) {
      const target = resolveLabOrderTarget(role, { patient: 7 });
      expect(target.ok).toBe(false);
      if (!target.ok) expect(target.field).toBe("non_field_errors");
    }
  });
});

describe("stampResultedAt", () => {
  const now = new Date("2026-09-30T10:00:00Z");

  it("stamps the moment an order reaches resulted", () => {
    expect(stampResultedAt("resulted", null, now)).toEqual(now);
  });

  it("keeps the original stamp on later saves", () => {
    const earlier = new Date("2026-09-29T08:00:00Z");
    expect(stampResultedAt("resulted", earlier, now)).toEqual(earlier);
  });

  it("clears the stamp when the order leaves resulted", () => {
    const earlier = new Date("2026-09-29T08:00:00Z");
    expect(stampResultedAt("in_progress", earlier, now)).toBeNull();
    expect(stampResultedAt("cancelled", earlier, now)).toBeNull();
    expect(stampResultedAt("ordered", null, now)).toBeNull();
  });
});

describe("labOrderWhere", () => {
  it("locks a patient to their own orders even when ?patient= is supplied", () => {
    expect(labOrderWhere("patient", 7, null)).toEqual({ patient_id: 7 });
    expect(labOrderWhere("patient", 7, null, "999")).toEqual({ patient_id: 7 });
  });

  it("scopes a doctor to their own orders, optionally narrowed", () => {
    expect(labOrderWhere("doctor", 7, 3)).toEqual({ doctor_id: 3 });
    expect(labOrderWhere("doctor", 7, 3, "12")).toEqual({ doctor_id: 3, patient_id: 12 });
  });

  it("matches nothing for junk filters and roles without a scope", () => {
    expect(labOrderWhere("doctor", 7, 3, "abc")).toEqual({ doctor_id: 3, patient_id: -1 });
    expect(labOrderWhere("admin", 1, null)).toEqual({ id: -1 });
  });
});

describe("labOrderCreateSchema", () => {
  it("requires a test name, a results date and coerces the reference bounds", () => {
    const input = parse(labOrderCreateSchema, {
      patient: "7",
      test_name: "  Fasting glucose  ",
      result_due_date: "2026-10-05",
      reference_min: "3.9",
      reference_max: "5.5",
      unit: "mmol/L",
    });
    expect(input.patient).toBe(7);
    expect(input.test_name).toBe("Fasting glucose");
    expect(input.result_due_date).toBe("2026-10-05");
    expect(input.reference_min).toBe(3.9);
    expect(input.reference_max).toBe(5.5);
  });

  it("rejects a blank test name with a DRF field error", () => {
    let caught: ValidationError | null = null;
    try {
      parse(labOrderCreateSchema, {
        patient: 7,
        test_name: "   ",
        result_due_date: "2026-10-05",
      });
    } catch (error) {
      caught = error as ValidationError;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught?.errors.test_name).toBeDefined();
  });

  it("requires the results date", () => {
    let caught: ValidationError | null = null;
    try {
      parse(labOrderCreateSchema, { patient: 7, test_name: "CBC" });
    } catch (error) {
      caught = error as ValidationError;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught?.errors.result_due_date).toEqual(["This field is required."]);
  });

  it("rejects a results date that is not YYYY-MM-DD", () => {
    let caught: ValidationError | null = null;
    try {
      parse(labOrderCreateSchema, {
        patient: 7,
        test_name: "CBC",
        result_due_date: "05/10/2026",
      });
    } catch (error) {
      caught = error as ValidationError;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught?.errors.result_due_date).toEqual([
      "Date has wrong format. Use YYYY-MM-DD.",
    ]);
  });

  it("rejects a reference minimum above the maximum", () => {
    expect(() =>
      parse(labOrderCreateSchema, {
        patient: 7,
        test_name: "CBC",
        result_due_date: "2026-10-05",
        reference_min: 9,
        reference_max: 4,
      })
    ).toThrow(ValidationError);
  });

  it("rejects unparsable reference bounds", () => {
    expect(() =>
      parse(labOrderCreateSchema, {
        patient: 7,
        test_name: "CBC",
        result_due_date: "2026-10-05",
        reference_min: "high",
      })
    ).toThrow(ValidationError);
  });

  it("accepts an order with no reference range at all", () => {
    expect(() =>
      parse(labOrderCreateSchema, {
        patient: 7,
        test_name: "Urinalysis",
        result_due_date: "2026-10-05",
      })
    ).not.toThrow();
  });
});

describe("labOrderPatchSchema", () => {
  it("accepts each workflow status", () => {
    for (const status of ["ordered", "in_progress", "resulted", "cancelled"]) {
      expect(parse(labOrderPatchSchema, { status }).status).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => parse(labOrderPatchSchema, { status: "pending" })).toThrow(ValidationError);
  });

  it("accepts result fields and rejects an over-long result value", () => {
    const input = parse(labOrderPatchSchema, {
      status: "resulted",
      result_value: "13.8",
      result_notes: "Slightly elevated",
    });
    expect(input.result_value).toBe("13.8");
    expect(() =>
      parse(labOrderPatchSchema, { result_value: "x".repeat(201) })
    ).toThrow(ValidationError);
  });

  it("allows an empty patch (nothing to change)", () => {
    expect(parse(labOrderPatchSchema, {})).toEqual({});
  });
});

describe("labResultFlag", () => {
  it("compares the reported number against the reference range", () => {
    expect(labResultFlag("4.4", 3.9, 5.5)).toBe("normal");
    expect(labResultFlag("6.2", 3.9, 5.5)).toBe("high");
    expect(labResultFlag("3.1", 3.9, 5.5)).toBe("low");
  });

  it("parses a value that carries its unit", () => {
    expect(labResultFlag("13.8 g/dL", 13.5, 17.5)).toBe("normal");
    expect(labResultFlag("18.1 g/dL", 13.5, 17.5)).toBe("high");
  });

  it("honours a one-sided range", () => {
    expect(labResultFlag("90", 100, null)).toBe("low");
    expect(labResultFlag("110", 100, null)).toBe("normal");
    expect(labResultFlag("90", null, 100)).toBe("normal");
    expect(labResultFlag("110", null, 100)).toBe("high");
  });

  it("reports unparsable values as unknown and blank results as null", () => {
    expect(labResultFlag("trace", 0, 10)).toBe("unknown");
    expect(labResultFlag("4.4", null, null)).toBe("unknown");
    expect(labResultFlag("", 3.9, 5.5)).toBeNull();
    expect(labResultFlag(null, 3.9, 5.5)).toBeNull();
  });
});

describe("labOrderDto", () => {
  const user = { id: 3, first_name: "Asha", last_name: "Moshi" } as User;
  const doctor = { id: 5, user } as unknown as Doctor & { user: User };

  const order = {
    id: 21,
    patient_id: 7,
    doctor_id: 5,
    appointment_id: null,
    status: "resulted",
    test_name: "Fasting glucose",
    result_due_date: new Date("2026-10-05T00:00:00Z"),
    unit: "mmol/L",
    reference_min: 3.9,
    reference_max: 5.5,
    result_value: "6.2",
    result_notes: "Repeat in a week",
    notes: "Fasting 12 hours",
    resulted_at: new Date("2026-09-30T09:00:00Z"),
    ordered_at: new Date("2026-09-29T09:00:00Z"),
    created_at: new Date("2026-09-29T09:00:00Z"),
    updated_at: new Date("2026-09-30T09:00:00Z"),
    doctor,
  } as unknown as LabOrder & { doctor: Doctor & { user: User } };

  it("serializes the order with its computed flag and who ordered it", () => {
    const dto = labOrderDto(order);
    expect(dto.patient).toBe(7);
    expect(dto.doctor).toBe(5);
    expect(dto.status).toBe("resulted");
    expect(dto.test_name).toBe("Fasting glucose");
    expect(dto.result_due_date).toBe("2026-10-05");
    expect(dto.result_value).toBe("6.2");
    expect(dto.flag).toBe("high");
    expect(dto.ordered_by).toBe("Asha Moshi");
    expect(dto.resulted_at).toBe("2026-09-30T09:00:00.000Z");
    expect(dto.ordered_at).toBe("2026-09-29T09:00:00.000Z");
  });

  it("leaves the flag null while the result is outstanding", () => {
    const dto = labOrderDto({
      ...order,
      status: "ordered",
      result_value: "",
      resulted_at: null,
      doctor: undefined,
    } as unknown as LabOrder);
    expect(dto.flag).toBeNull();
    expect(dto.resulted_at).toBeNull();
    expect(dto.ordered_by).toBeNull();
  });
});
