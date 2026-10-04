/**
 * Appointment lifecycle — the accepted/done statuses the doctor works with and
 * the "one open appointment per patient" booking rule. Pure helpers only, the
 * same way vitals.test.ts / lab-orders.test.ts are written.
 */
import { describe, expect, it } from "vitest";
import {
  actionTargetStatus,
  activeAppointmentMessage,
  canTransition,
  isKnownAction,
} from "@/services/appointment.service";
import {
  APPOINTMENT_STATUSES,
  OPEN_APPOINTMENT_STATUSES,
  isAppointmentStatus,
  openAppointmentWhere,
} from "@/repositories/appointments.repo";
import { appointmentActionSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import { ValidationError } from "@/lib/errors";

describe("appointment actions", () => {
  it("turns an accepted request into `accepted` — not `confirmed`", () => {
    expect(actionTargetStatus("accept")).toBe("accepted");
    expect(actionTargetStatus("confirm")).toBe("accepted");
    expect(actionTargetStatus("confirm")).not.toBe("confirmed");
    expect(isKnownAction("accept")).toBe(true);
    expect(isKnownAction("confirm")).toBe(true);
  });

  it("closes the visit as `done` once the patient has been seen", () => {
    expect(actionTargetStatus("done")).toBe("done");
    expect(actionTargetStatus("complete")).toBe("done");
    expect(actionTargetStatus("complete")).not.toBe("completed");
  });

  it("keeps cancel/reject working and refuses unknown actions", () => {
    expect(actionTargetStatus("cancel")).toBe("cancelled");
    expect(actionTargetStatus("reject")).toBe("rejected");
    expect(actionTargetStatus("finish")).toBeNull();
    expect(isKnownAction("finish")).toBe(false);
  });
});

describe("canTransition", () => {
  it("lets a pending request be accepted, cancelled or rejected", () => {
    expect(canTransition("pending", "accepted")).toBe(true);
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("pending", "rejected")).toBe(true);
  });

  it("lets an accepted appointment be marked done or cancelled", () => {
    expect(canTransition("accepted", "done")).toBe(true);
    expect(canTransition("accepted", "cancelled")).toBe(true);
  });

  it("treats done/cancelled/rejected as terminal", () => {
    for (const to of APPOINTMENT_STATUSES) {
      expect(canTransition("done", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
      expect(canTransition("rejected", to)).toBe(false);
    }
  });

  it("refuses skipping the accept step and the retired status names", () => {
    expect(canTransition("pending", "done")).toBe(false);
    expect(canTransition("pending", "confirmed")).toBe(false);
    expect(canTransition("accepted", "completed")).toBe(false);
    expect(canTransition("nonsense", "accepted")).toBe(false);
  });
});

describe("one open appointment per patient", () => {
  it("counts pending, accepted and in_progress as still holding a slot", () => {
    expect([...OPEN_APPOINTMENT_STATUSES]).toEqual(["pending", "accepted", "in_progress"]);
    expect(openAppointmentWhere(11)).toEqual({
      patient_id: 11,
      status: { in: ["pending", "accepted", "in_progress"] },
    });
  });

  it("releases the patient once the visit is done, cancelled, rejected or expired", () => {
    for (const status of ["done", "cancelled", "rejected", "expired"]) {
      expect(OPEN_APPOINTMENT_STATUSES as readonly string[]).not.toContain(status);
    }
  });

  it("names the appointment that is blocking a new booking", () => {
    expect(
      activeAppointmentMessage({
        id: 7,
        status: "accepted",
        appointment_date: new Date("2026-10-05T00:00:00Z"),
        start_time: "09:30:00",
      })
    ).toBe(
      "You already have an appointment on 2026-10-05 at 09:30. It has to be marked as done by your doctor before you can book another one."
    );
  });

  it("validates ?status= against the live enum, not the retired names", () => {
    expect([...APPOINTMENT_STATUSES]).toEqual([
      "pending",
      "accepted",
      "done",
      "cancelled",
      "rejected",
      "in_progress",
      "expired",
    ]);
    expect(isAppointmentStatus("accepted")).toBe(true);
    expect(isAppointmentStatus("done")).toBe(true);
    expect(isAppointmentStatus("in_progress")).toBe(true);
    expect(isAppointmentStatus("expired")).toBe(true);
    expect(isAppointmentStatus("confirmed")).toBe(false);
    expect(isAppointmentStatus("completed")).toBe(false);
  });
});

describe("appointmentActionSchema", () => {
  it("accepts the accepted/done action statuses", () => {
    expect(parse(appointmentActionSchema, { status: "accepted" })).toEqual({
      status: "accepted",
    });
    expect(parse(appointmentActionSchema, { status: "done" })).toEqual({ status: "done" });
  });

  it("rejects the retired confirmed/completed statuses", () => {
    expect(() => parse(appointmentActionSchema, { status: "confirmed" })).toThrow(
      ValidationError
    );
    expect(() => parse(appointmentActionSchema, { status: "completed" })).toThrow(
      ValidationError
    );
  });

  it("still takes a cancel reason with the terminal statuses", () => {
    const input = parse(appointmentActionSchema, {
      status: "cancelled",
      cancel_reason: "No longer needed",
    });
    expect(input.status).toBe("cancelled");
    expect(input.cancel_reason).toBe("No longer needed");
  });
});
