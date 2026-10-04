/**
 * Structured e-prescriptions (phase 1) — validation, plain-text rendering and
 * the read/write authorization gates. Everything here is pure (no database),
 * the same way health-records.test.ts covers its service helpers.
 */
import { describe, expect, it } from "vitest";
import {
  normalizePrescriptionItems,
  prescriptionText,
  resolvePrescriptionTarget,
} from "@/services/prescription.service";
import { prescriptionWhere } from "@/repositories/clinical.repo";
import {
  prescriptionCreateSchema,
  prescriptionPatchSchema,
  prescriptionItemSchema,
} from "@/validators/clinical";
import { treatmentCreateSchema, treatmentPatchSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import { ValidationError } from "@/lib/errors";
import { prescriptionDto, treatmentDto } from "@/lib/serializers";
import type { MedicalTreatment, Prescription, PrescriptionItem } from "@prisma/client";

const line = (over: Partial<Parameters<typeof normalizePrescriptionItems>[0][number]> = {}) => ({
  medication: "Amoxicillin",
  dosage: "500 mg",
  frequency: "3 times daily",
  route: "oral",
  duration_days: 7,
  refills: 0,
  instructions: "Take with food",
  ...over,
});

describe("normalizePrescriptionItems", () => {
  it("trims every text field and defaults the blanks", () => {
    const [item] = normalizePrescriptionItems([
      { medication: "  Paracetamol ", dosage: " ", frequency: undefined, route: " oral " },
    ]);
    expect(item).toEqual({
      medication: "Paracetamol",
      dosage: "",
      frequency: "",
      route: "oral",
      duration_days: null,
      refills: 0,
      instructions: "",
    });
  });

  it("keeps numeric fields intact", () => {
    const [item] = normalizePrescriptionItems([line({ duration_days: 14, refills: 2 })]);
    expect(item.duration_days).toBe(14);
    expect(item.refills).toBe(2);
  });
});

describe("prescriptionText", () => {
  it("renders drug, dose, schedule, route and duration on one line", () => {
    expect(prescriptionText([line()])).toBe(
      "Amoxicillin 500 mg — 3 times daily, oral, 7 days\n  Take with food"
    );
  });

  it("omits empty parts instead of printing stray separators", () => {
    expect(prescriptionText([{ medication: "ORS sachet" }])).toBe("ORS sachet");
    expect(
      prescriptionText([line({ dosage: "", frequency: "", route: "", duration_days: null })])
    ).toBe("Amoxicillin\n  Take with food");
    expect(
      prescriptionText([
        { medication: "ORS sachet", dosage: "", frequency: "", route: "", duration_days: null },
      ])
    ).toBe("ORS sachet");
  });

  it("adds refills and appends the free-text notes below the list", () => {
    const text = prescriptionText([line({ refills: 1 })], "Review in 2 weeks");
    expect(text).toContain("Amoxicillin 500 mg — 3 times daily, oral, 7 days, 1 refill");
    expect(text.endsWith("\n\nReview in 2 weeks")).toBe(true);
  });

  it("returns the notes alone when there are no medication lines", () => {
    expect(prescriptionText([], "No changes")).toBe("No changes");
    expect(prescriptionText([], "")).toBe("");
  });
});

describe("resolvePrescriptionTarget", () => {
  it("lets a doctor issue one for a named patient", () => {
    expect(resolvePrescriptionTarget("doctor", { patient: 7 })).toEqual({
      ok: true,
      role: "doctor",
      patientId: 7,
    });
  });

  it("requires the patient field for a doctor", () => {
    const target = resolvePrescriptionTarget("doctor", {});
    expect(target.ok).toBe(false);
    if (!target.ok) {
      expect(target.field).toBe("patient");
      expect(target.message).toBe("This field is required.");
    }
  });

  it("never lets a patient issue one (read-only role)", () => {
    const target = resolvePrescriptionTarget("patient", { patient: 7 });
    expect(target.ok).toBe(false);
    if (!target.ok) expect(target.field).toBe("non_field_errors");
  });

  it("refuses roles with no prescribing rights", () => {
    for (const role of ["admin", ""]) {
      expect(resolvePrescriptionTarget(role, { patient: 2 }).ok).toBe(false);
    }
  });
});

describe("prescriptionWhere", () => {
  it("locks a patient to their own prescriptions even when ?patient= is supplied", () => {
    expect(prescriptionWhere("patient", 7, null)).toEqual({ patient_id: 7 });
    expect(prescriptionWhere("patient", 7, null, "999")).toEqual({ patient_id: 7 });
  });

  it("scopes a doctor to their own prescriptions, optionally narrowed", () => {
    expect(prescriptionWhere("doctor", 7, 3)).toEqual({ doctor_id: 3 });
    expect(prescriptionWhere("doctor", 7, 3, "12")).toEqual({ doctor_id: 3, patient_id: 12 });
  });

  it("matches nothing for junk filters and roles without a scope", () => {
    expect(prescriptionWhere("doctor", 7, 3, "abc")).toEqual({ doctor_id: 3, patient_id: -1 });
    expect(prescriptionWhere("admin", 1, null)).toEqual({ id: -1 });
    expect(prescriptionWhere("doctor", 1, null)).toEqual({ doctor_id: -1 });
  });
});

describe("prescription schemas", () => {
  it("accepts a full prescription payload and coerces numeric strings", () => {
    const input = parse(prescriptionCreateSchema, {
      patient: "7",
      items: [{ medication: "Metformin", dosage: "500 mg", duration_days: "30", refills: "2" }],
      notes: "Take after meals",
    });
    expect(input.patient).toBe(7);
    expect(input.items[0].duration_days).toBe(30);
    expect(input.items[0].refills).toBe(2);
  });

  it("rejects a prescription with no medication line", () => {
    expect(() => parse(prescriptionCreateSchema, { patient: 7, items: [] })).toThrow(
      ValidationError
    );
  });

  it("rejects a blank medication name with a DRF field error", () => {
    let caught: ValidationError | null = null;
    try {
      parse(prescriptionItemSchema, { medication: "   " });
    } catch (error) {
      caught = error as ValidationError;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught?.errors.medication).toBeDefined();
  });

  it("rejects an out-of-range duration or refill count", () => {
    expect(() => parse(prescriptionItemSchema, { medication: "A", duration_days: 0 })).toThrow(
      ValidationError
    );
    expect(() => parse(prescriptionItemSchema, { medication: "A", duration_days: 999 })).toThrow(
      ValidationError
    );
    expect(() => parse(prescriptionItemSchema, { medication: "A", refills: 99 })).toThrow(
      ValidationError
    );
  });

  it("caps the number of medication lines", () => {
    const items = Array.from({ length: 31 }, (_, i) => ({ medication: `Drug ${i}` }));
    expect(() => parse(prescriptionCreateSchema, { patient: 1, items })).toThrow(ValidationError);
  });

  it("lets a PATCH clear every medication line", () => {
    const input = parse(prescriptionPatchSchema, { items: [], notes: "" });
    expect(input.items).toEqual([]);
  });

  it("rejects a non-integer patient id", () => {
    expect(() => parse(prescriptionCreateSchema, { patient: "abc", items: [line()] })).toThrow(
      ValidationError
    );
  });
});

describe("treatment schemas carry the structured prescription", () => {
  it("accepts items + prescription_notes on create", () => {
    const input = parse(treatmentCreateSchema, {
      patient: 7,
      diagnosis: "Urticaria",
      items: [{ medication: "Cetirizine", dosage: "10 mg" }],
      prescription_notes: "Nightly",
    });
    expect(input.items).toHaveLength(1);
    expect(input.prescription_notes).toBe("Nightly");
  });

  it("accepts an empty items array (medication lines removed)", () => {
    const input = parse(treatmentPatchSchema, { items: [], prescription_notes: "" });
    expect(input.items).toEqual([]);
  });

  it("still accepts the legacy free-text payload unchanged", () => {
    const input = parse(treatmentCreateSchema, {
      patient: 7,
      prescription: "Amoxicillin 500 mg thrice daily",
    });
    expect(input.prescription).toBe("Amoxicillin 500 mg thrice daily");
    expect(input.items).toBeUndefined();
  });
});

describe("DTOs", () => {
  const item = {
    id: 11,
    medication: "Amoxicillin",
    dosage: "500 mg",
    frequency: "3 times daily",
    route: "oral",
    duration_days: 7,
    refills: 0,
    instructions: "Take with food",
    sort_order: 0,
    created_at: new Date("2026-09-30T10:00:00Z"),
    prescription_id: 5,
  } as PrescriptionItem;

  it("serializes a prescription with its medication lines", () => {
    const dto = prescriptionDto({
      id: 5,
      notes: "Review in 2 weeks",
      doctor_id: 3,
      patient_id: 7,
      appointment_id: 9,
      treatment_id: 4,
      created_at: new Date("2026-09-30T10:00:00Z"),
      updated_at: new Date("2026-09-30T10:00:00Z"),
      items: [item],
    } as Prescription & { items: PrescriptionItem[] });
    expect(dto.patient).toBe(7);
    expect(dto.doctor).toBe(3);
    expect(dto.treatment).toBe(4);
    expect(dto.notes).toBe("Review in 2 weeks");
    expect(dto.items).toHaveLength(1);
    expect((dto.items as Record<string, unknown>[])[0].medication).toBe("Amoxicillin");
    expect(dto.created_at).toBe("2026-09-30T10:00:00.000Z");
  });

  it("attaches the structured prescription to the treatment DTO", () => {
    const base = {
      id: 4,
      doctor_id: 3,
      patient_id: 7,
      appointment_id: null,
      diagnosis: "Urticaria",
      treatment_notes: "",
      prescription: "Amoxicillin 500 mg — 3 times daily, oral, 7 days",
      follow_up_date: null,
      follow_up_notes: "",
      created_at: new Date("2026-09-30T10:00:00Z"),
      updated_at: new Date("2026-09-30T10:00:00Z"),
    } as MedicalTreatment;
    const withRx = treatmentDto({
      ...base,
      prescriptions: [
        {
          id: 5,
          notes: "",
          doctor_id: 3,
          patient_id: 7,
          appointment_id: null,
          treatment_id: 4,
          created_at: new Date("2026-09-30T10:00:00Z"),
          updated_at: new Date("2026-09-30T10:00:00Z"),
          items: [item],
        } as Prescription & { items: PrescriptionItem[] },
      ],
    });
    expect(withRx.prescription_id).toBe(5);
    expect(withRx.prescription_items).toHaveLength(1);
    expect(withRx.prescription).toBe("Amoxicillin 500 mg — 3 times daily, oral, 7 days");
  });

  it("falls back to an empty list when the include is missing", () => {
    const dto = treatmentDto({
      id: 4,
      doctor_id: 3,
      patient_id: 7,
      appointment_id: null,
      diagnosis: "",
      treatment_notes: "",
      prescription: "",
      follow_up_date: null,
      follow_up_notes: "",
      created_at: new Date(),
      updated_at: new Date(),
    } as MedicalTreatment);
    expect(dto.prescription_id).toBeNull();
    expect(dto.prescription_items).toEqual([]);
  });
});
