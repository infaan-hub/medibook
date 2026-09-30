/**
 * Waiting-room queue (phase 11) — line ordering, timezone-correct check-in
 * dates and the check-in payload. Pure helpers only.
 */
import { describe, expect, it } from "vitest";
import { buildQueue, localDateString, type QueueRow } from "@/services/queue.service";
import { queueCheckInSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import { ValidationError } from "@/lib/errors";
import { appointmentDto, queueSlotDto } from "@/lib/serializers";
import type { Appointment, Doctor, User } from "@prisma/client";

const row = (over: Partial<QueueRow> & { id: number }): QueueRow => ({
  status: "confirmed",
  start_time: "09:00:00",
  checked_in_at: null,
  consultation_started_at: null,
  ...over,
});

const at = (iso: string) => new Date(iso);

describe("buildQueue", () => {
  const now = at("2026-09-30T10:00:00Z");

  it("numbers checked-in patients by check-in time, earliest first", () => {
    const slots = buildQueue(
      [
        row({ id: 1, checked_in_at: at("2026-09-30T09:30:00Z") }),
        row({ id: 2, checked_in_at: at("2026-09-30T09:05:00Z") }),
        row({ id: 3, checked_in_at: at("2026-09-30T09:20:00Z") }),
      ],
      now
    );
    const positions = Object.fromEntries(slots.map((slot) => [slot.appointment, slot.position]));
    expect(positions).toEqual({ 1: 3, 2: 1, 3: 2 });
    expect(slots.every((slot) => slot.waiting_count === 3)).toBe(true);
  });

  it("breaks check-in ties with the earlier slot, then the id", () => {
    const same = at("2026-09-30T09:10:00Z");
    const slots = buildQueue(
      [
        row({ id: 9, start_time: "10:00:00", checked_in_at: same }),
        row({ id: 8, start_time: "09:00:00", checked_in_at: same }),
        row({ id: 7, start_time: "09:00:00", checked_in_at: same }),
      ],
      now
    );
    expect(slots.map((slot) => [slot.appointment, slot.position])).toEqual([
      [9, 3],
      [8, 2],
      [7, 1],
    ]);
  });

  it("keeps the patient being seen out of the numbered line", () => {
    const slots = buildQueue(
      [
        row({ id: 1, checked_in_at: at("2026-09-30T08:55:00Z"), consultation_started_at: at("2026-09-30T09:00:00Z") }),
        row({ id: 2, checked_in_at: at("2026-09-30T09:05:00Z") }),
        row({ id: 3, checked_in_at: at("2026-09-30T09:07:00Z") }),
      ],
      now
    );
    const seen = slots.find((slot) => slot.appointment === 1);
    expect(seen).toMatchObject({ position: null, being_seen: true, checked_in: true, waited_minutes: null });
    expect(slots.find((slot) => slot.appointment === 2)?.position).toBe(1);
    expect(slots.find((slot) => slot.appointment === 3)?.position).toBe(2);
    expect(seen?.waiting_count).toBe(2);
  });

  it("gives patients who never checked in no position", () => {
    const slots = buildQueue([row({ id: 1 }), row({ id: 2 })], now);
    expect(slots).toHaveLength(2);
    expect(slots.every((slot) => slot.position === null && !slot.checked_in)).toBe(true);
    expect(slots.every((slot) => slot.waiting_count === 0)).toBe(true);
  });

  it("drops completed and cancelled appointments — they left the room", () => {
    const slots = buildQueue(
      [
        row({ id: 1, status: "completed", checked_in_at: at("2026-09-30T08:00:00Z") }),
        row({ id: 2, status: "cancelled", checked_in_at: at("2026-09-30T08:30:00Z") }),
        row({ id: 3, status: "rejected", checked_in_at: at("2026-09-30T08:40:00Z") }),
        row({ id: 4, status: "pending", checked_in_at: at("2026-09-30T09:00:00Z") }),
      ],
      now
    );
    expect(slots.map((slot) => slot.appointment)).toEqual([4]);
    expect(slots[0].position).toBe(1);
  });

  it("reports whole minutes waited, never negative", () => {
    const slots = buildQueue(
      [
        row({ id: 1, checked_in_at: at("2026-09-30T09:47:30Z") }),
        row({ id: 2, checked_in_at: at("2026-09-30T11:00:00Z") }),
      ],
      now
    );
    expect(slots.find((slot) => slot.appointment === 1)?.waited_minutes).toBe(12);
    expect(slots.find((slot) => slot.appointment === 2)?.waited_minutes).toBe(0);
  });

  it("returns nothing for an empty day", () => {
    expect(buildQueue([], now)).toEqual([]);
  });
});

describe("localDateString", () => {
  it("renders the date as the patient's timezone sees it", () => {
    // 22:30 UTC is already the next day in Dar es Salaam (UTC+3).
    expect(localDateString(at("2026-09-30T22:30:00Z"), "Africa/Dar_es_Salaam")).toBe("2026-10-01");
    expect(localDateString(at("2026-09-30T22:30:00Z"), "UTC")).toBe("2026-09-30");
    expect(localDateString(at("2026-09-30T01:00:00Z"), "Pacific/Kiritimati")).toBe("2026-09-30");
  });

  it("falls back to the UTC date for an unusable timezone", () => {
    expect(localDateString(at("2026-09-30T22:30:00Z"), "Not/AZone")).toBe("2026-09-30");
  });
});

describe("queueCheckInSchema", () => {
  it("accepts an integer appointment id", () => {
    expect(parse(queueCheckInSchema, { appointment: "12" }).appointment).toBe(12);
  });

  it("rejects a missing or non-integer appointment", () => {
    expect(() => parse(queueCheckInSchema, {})).toThrow(ValidationError);
    expect(() => parse(queueCheckInSchema, { appointment: "abc" })).toThrow(ValidationError);
  });
});

describe("queueSlotDto", () => {
  it("passes the computed slot through with JSON-safe keys", () => {
    expect(
      queueSlotDto({
        appointment: 5,
        position: 2,
        being_seen: false,
        checked_in: true,
        waited_minutes: 14,
        waiting_count: 3,
      })
    ).toEqual({
      appointment: 5,
      position: 2,
      being_seen: false,
      checked_in: true,
      waited_minutes: 14,
      waiting_count: 3,
    });
  });
});

describe("appointmentDto carries the waiting-room timestamps", () => {
  const user = { id: 1 } as User;
  const doctor = { user: { id: 2 } as User } as Doctor & { user: User };

  it("serialises check-in and consultation start", () => {
    const dto = appointmentDto({
      id: 4,
      patient_id: 1,
      doctor_id: 2,
      hospital_id: null,
      appointment_date: at("2026-09-30T00:00:00Z"),
      start_time: "09:00:00",
      end_time: "09:30:00",
      status: "confirmed",
      reason: "",
      notes: "",
      cancel_reason: "",
      checked_in_at: at("2026-09-30T08:50:00Z"),
      consultation_started_at: at("2026-09-30T09:02:00Z"),
      patient: user,
      doctor,
    } as unknown as Appointment & { patient: User; doctor: { user: User } });
    expect(dto.checked_in_at).toBe("2026-09-30T08:50:00.000Z");
    expect(dto.consultation_started_at).toBe("2026-09-30T09:02:00.000Z");
  });

  it("leaves them null before check-in", () => {
    const dto = appointmentDto({
      id: 5,
      patient_id: 1,
      doctor_id: 2,
      hospital_id: null,
      appointment_date: at("2026-09-30T00:00:00Z"),
      start_time: "10:00:00",
      end_time: "10:30:00",
      status: "confirmed",
      reason: "",
      notes: "",
      cancel_reason: "",
      checked_in_at: null,
      consultation_started_at: null,
      patient: user,
      doctor,
    } as unknown as Appointment & { patient: User; doctor: { user: User } });
    expect(dto.checked_in_at).toBeNull();
    expect(dto.consultation_started_at).toBeNull();
  });
});
