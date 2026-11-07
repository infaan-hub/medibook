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
  it("returns one-minute-interval slots across the window", async () => {
    const slots = await availableSlots(4, true, "2099-01-05");

    // 09:00 through 10:30 inclusive, one slot per minute (30-min duration fits until 11:00)
    expect(slots).toHaveLength(91);
    expect(slots[0]).toEqual({ start_time: "09:00:00", end_time: "09:30:00" });
    expect(slots[1]).toEqual({ start_time: "09:01:00", end_time: "09:31:00" });
    expect(slots[90]).toEqual({ start_time: "10:30:00", end_time: "11:00:00" });
  });

  it("excludes appointments overlapping a partial time-off range", async () => {
    doctors.listExceptionsForDate.mockResolvedValue([
      { start_time: "10:00:00", end_time: "10:30:00" },
    ]);

    const slots = await availableSlots(4, true, "2099-01-05");
    const starts = slots.map((slot) => slot.start_time);

    expect(starts).toContain("09:00:00");
    expect(starts).toContain("09:30:00");
    expect(starts).not.toContain("10:00:00");
    expect(starts).toContain("10:30:00");
  });

  it("excludes starts that overlap an existing appointment", async () => {
    bookings.bookedSlotKeysForDate.mockResolvedValue(new Set(["09:45:00|10:15:00"]));

    const slots = await availableSlots(4, true, "2099-01-05");
    const starts = slots.map((slot) => slot.start_time);

    expect(starts).toContain("09:00:00");
    expect(starts).not.toContain("09:30:00"); // overlaps 09:45-10:15
    expect(starts).not.toContain("10:00:00"); // overlaps 09:45-10:15
    expect(starts).toContain("10:30:00");
  });

  it("returns no appointment times during a full-day time off", async () => {
    doctors.listExceptionsForDate.mockResolvedValue([{ start_time: null, end_time: null }]);

    await expect(availableSlots(4, true, "2099-01-05")).resolves.toEqual([]);
    expect(bookings.bookedSlotKeysForDate).not.toHaveBeenCalled();
  });
});
