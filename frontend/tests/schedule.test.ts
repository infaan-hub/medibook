import { beforeEach, describe, expect, it, vi } from "vitest";

const doctors = vi.hoisted(() => ({
  listExceptionsForDate: vi.fn(),
  listActiveWindowsForWeekday: vi.fn(),
}));
const bookings = vi.hoisted(() => ({
  bookedSlotKeysForDate: vi.fn(),
}));

vi.mock("@/repositories/doctors.repo", () => doctors);
vi.mock("@/repositories/appointments.repo", () => bookings);
vi.mock("@/lib/notify", () => ({ broadcastAvailabilityUpdated: vi.fn() }));

import { availableSlots } from "@/services/schedule.service";

beforeEach(() => {
  vi.clearAllMocks();
  doctors.listExceptionsForDate.mockResolvedValue([]);
  doctors.listActiveWindowsForWeekday.mockResolvedValue([
    {
      start_time: "09:00:00",
      end_time: "11:00:00",
      slot_duration_minutes: 30,
      breaks: [],
    },
  ]);
  bookings.bookedSlotKeysForDate.mockResolvedValue(new Set<string>());
});

describe("available appointment times", () => {
  it("allows any minute in the doctor's hours while keeping appointments 30 minutes", async () => {
    const slots = await availableSlots(4, true, "2099-01-05");

    expect(slots).toHaveLength(91);
    expect(slots).toContainEqual({ start_time: "09:17:00", end_time: "09:47:00" });
    expect(slots.at(-1)).toEqual({ start_time: "10:30:00", end_time: "11:00:00" });
  });

  it("excludes appointments overlapping a partial time-off range", async () => {
    doctors.listExceptionsForDate.mockResolvedValue([
      { start_time: "10:00:00", end_time: "10:30:00" },
    ]);

    const slots = await availableSlots(4, true, "2099-01-05");
    const starts = slots.map((slot) => slot.start_time);

    expect(starts).toContain("09:30:00");
    expect(starts).not.toContain("09:31:00");
    expect(starts).not.toContain("10:29:00");
    expect(starts).toContain("10:30:00");
  });

  it("excludes starts that overlap an existing appointment", async () => {
    bookings.bookedSlotKeysForDate.mockResolvedValue(new Set(["09:45:00|10:15:00"]));

    const slots = await availableSlots(4, true, "2099-01-05");
    const starts = slots.map((slot) => slot.start_time);

    expect(starts).toContain("09:14:00");
    expect(starts).toContain("09:15:00");
    expect(starts).not.toContain("09:16:00");
    expect(starts).not.toContain("10:14:00");
    expect(starts).toContain("10:15:00");
  });

  it("returns no appointment times during a full-day time off", async () => {
    doctors.listExceptionsForDate.mockResolvedValue([{ start_time: null, end_time: null }]);

    await expect(availableSlots(4, true, "2099-01-05")).resolves.toEqual([]);
    expect(bookings.bookedSlotKeysForDate).not.toHaveBeenCalled();
  });
});
