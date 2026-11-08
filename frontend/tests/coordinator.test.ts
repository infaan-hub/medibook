import { describe, expect, it } from "vitest";
import { appointmentListWhere } from "@/repositories/appointments.repo";
import { canReassignAppointment, canReassignEmergency } from "@/services/coordinator.service";
import { adminUserCreateSchema } from "@/validators/more";

describe("system coordinator", () => {
  it("lists platform appointments without patient-only scoping", () => {
    const where = appointmentListWhere({ role: "coordinator", userId: 42, doctorProfileId: null });
    expect(where).not.toHaveProperty("patient_id");
    expect(where).not.toHaveProperty("doctor_id");
    expect(where.deleted_at).toBeNull();
  });

  it("only allows appointment reassignment before consultation starts", () => {
    expect(canReassignAppointment("pending", null)).toBe(true);
    expect(canReassignAppointment("accepted", null)).toBe(true);
    expect(canReassignAppointment("done", null)).toBe(false);
    expect(canReassignAppointment("accepted", new Date())).toBe(false);
  });

  it("only allows emergency transfer before emergency processing", () => {
    expect(canReassignEmergency("pending", null, null)).toBe(true);
    expect(canReassignEmergency("accepted", null, null)).toBe(true);
    expect(canReassignEmergency("accepted", null, new Date())).toBe(false);
    expect(canReassignEmergency("in_progress", new Date(), new Date())).toBe(false);
  });

  it("allows an administrator to create coordinator accounts without opening admin-role creation", () => {
    const base = { username: "coord", email: "coord@example.test", password: "secure-password", role: "coordinator" };
    expect(adminUserCreateSchema.safeParse(base).success).toBe(true);
    expect(adminUserCreateSchema.safeParse({ ...base, role: "admin" }).success).toBe(false);
  });
});
