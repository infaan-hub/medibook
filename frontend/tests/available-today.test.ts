/**
 * available_today — the per-day flag behind the "Available" / "Not available"
 * chip on the patient doctor card.
 *
 * Contract: a card may only read "Available" when ALL of these hold —
 *   1. the doctor's account is active (`is_available`),
 *   2. TODAY's weekday carries an ACTIVE schedule window (`is_active: true`),
 *   3. the day is not cancelled by a full-day schedule exception.
 * A doctor who never set today, whose window is deactivated, who is suspended,
 * or who closed the day must come back `available_today: false`.
 *
 * The GET handler runs end-to-end over a stubbed Prisma client: the real route,
 * service (availableTodayIds) and repository layers all execute. The stub's
 * findMany implementations honour the `where` clause they are handed, so a
 * repository that drops `weekday`, `is_active: true`, the exception date or the
 * `start_time: null` marker cannot pass these tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/doctors/route";
import { addDaysIso, isoWeekday, todayIso } from "@/lib/dates";

type WindowRow = { doctor_id: number; weekday: number; is_active: boolean };
type ClosureRow = { doctor_id: number; date: Date; start_time: string | null };
type DoctorRow = Record<string, unknown> & { id: number; is_available: boolean };

const state = vi.hoisted(() => ({
  doctors: [] as DoctorRow[],
  windows: [] as WindowRow[],
  closures: [] as ClosureRow[],
  lastWindowWhere: null as Record<string, unknown> | null,
  lastClosureWhere: null as Record<string, unknown> | null,
}));

/** Keep the repo honest: only rows matching the real `where` come back. */
const matches = (list: number[] | undefined, id: number) =>
  Array.isArray(list) ? list.includes(id) : list === undefined;

vi.mock("@/lib/db", () => ({
  prisma: {
    doctor: {
      count: async () => state.doctors.length,
      findMany: async ({ skip = 0, take }: { skip?: number; take?: number } = {}) =>
        state.doctors.slice(skip, take === undefined ? undefined : skip + take),
    },
    availability: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        state.lastWindowWhere = where;
        const doctorIds = (where.doctor_id as { in: number[] } | undefined)?.in;
        return state.windows.filter(
          (row) =>
            matches(doctorIds, row.doctor_id) &&
            row.weekday === where.weekday && // dropping `weekday` → nothing matches
            row.is_active === where.is_active, // dropping `is_active: true` → nothing matches
        );
      },
    },
    scheduleException: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        state.lastClosureWhere = where;
        const doctorIds = (where.doctor_id as { in: number[] } | undefined)?.in;
        const date = where.date as Date;
        const startTime = where.start_time as string | null;
        return state.closures.filter(
          (row) =>
            matches(doctorIds, row.doctor_id) &&
            row.date.getTime() === date.getTime() && // date-scoped: tomorrow's closure must not leak
            row.start_time === startTime, // `start_time: null` marks a full-day closure
        );
      },
    },
  },
}));

const TODAY = todayIso();
const TODAY_WEEKDAY = isoWeekday(TODAY);
const OTHER_WEEKDAY = (TODAY_WEEKDAY + 1) % 7;
const TOMORROW = addDaysIso(TODAY, 1);

/** Full doctorDto row: account flag + relations the serializer reads. */
function doctorRow(
  id: number,
  opts: { first: string; last: string; isAvailable?: boolean },
): DoctorRow {
  return {
    id,
    is_available: opts.isAvailable ?? true,
    qualifications: "",
    experience_years: 5,
    consultation_fee: "20000.00",
    bio: "",
    latitude: null,
    longitude: null,
    location_accuracy: null,
    location_captured_at: null,
    phone: "",
    phone_secondary: "",
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    user_id: 100 + id,
    user: {
      id: 100 + id,
      email: `dr${id}@clinic.test`,
      first_name: opts.first,
      last_name: opts.last,
      phone: "",
      profile_image_id: null,
    },
    specialties: [],
    hospitals: [],
    average_rating: "0.00",
    total_reviews: 0,
  };
}

const utcMidnight = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

async function fetchDirectory(): Promise<
  Map<number, { id: number; is_available: boolean; available_today: boolean }>
> {
  const res = await GET(new Request("https://example.test/api/doctors/?page_size=100"), {
    params: Promise.resolve({}),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  return new Map(
    (
      body.data.results as Array<{ id: number; is_available: boolean; available_today: boolean }>
    ).map((row) => [row.id, row]),
  );
}

beforeEach(() => {
  state.doctors = [];
  state.windows = [];
  state.closures = [];
  state.lastWindowWhere = null;
  state.lastClosureWhere = null;
});

describe("GET /api/doctors/ — available_today per weekday", () => {
  it("marks a doctor available today only when an active window covers today's weekday", async () => {
    state.doctors = [
      doctorRow(1, { first: "Neema", last: "Kimaro" }),
      doctorRow(2, { first: "Zawadi", last: "Juma" }),
    ];
    state.windows = [
      { doctor_id: 1, weekday: TODAY_WEEKDAY, is_active: true },
      { doctor_id: 2, weekday: OTHER_WEEKDAY, is_active: true },
    ];

    const byId = await fetchDirectory();

    expect(byId.get(1)?.available_today).toBe(true);
    // Never set today's day → the card must read "Not available".
    expect(byId.get(2)?.available_today).toBe(false);
  });

  it("counts a day only when the window is active — a deactivated window is not availability", async () => {
    state.doctors = [
      doctorRow(1, { first: "Active", last: "Window" }),
      doctorRow(2, { first: "Paused", last: "Window" }),
    ];
    state.windows = [
      { doctor_id: 1, weekday: TODAY_WEEKDAY, is_active: true },
      { doctor_id: 2, weekday: TODAY_WEEKDAY, is_active: false },
    ];

    const byId = await fetchDirectory();

    expect(byId.get(1)?.available_today).toBe(true);
    expect(byId.get(2)?.available_today).toBe(false);
  });

  it("subtracts a full-day closure so a closed day reads Not available", async () => {
    state.doctors = [
      doctorRow(1, { first: "Open", last: "Today" }),
      doctorRow(2, { first: "Closed", last: "Today" }),
    ];
    state.windows = [
      { doctor_id: 1, weekday: TODAY_WEEKDAY, is_active: true },
      { doctor_id: 2, weekday: TODAY_WEEKDAY, is_active: true },
    ];
    state.closures = [{ doctor_id: 2, date: utcMidnight(TODAY), start_time: null }];

    const byId = await fetchDirectory();

    expect(byId.get(1)?.available_today).toBe(true);
    expect(byId.get(2)?.available_today).toBe(false);
  });

  it("scopes closures to the day — tomorrow's closure does not darken today", async () => {
    state.doctors = [doctorRow(1, { first: "Busy", last: "Tomorrow" })];
    state.windows = [{ doctor_id: 1, weekday: TODAY_WEEKDAY, is_active: true }];
    state.closures = [{ doctor_id: 1, date: utcMidnight(TOMORROW), start_time: null }];

    const byId = await fetchDirectory();

    expect(byId.get(1)?.available_today).toBe(true);
  });

  it("never marks a suspended doctor available, window or not", async () => {
    state.doctors = [
      doctorRow(1, { first: "Suspended", last: "Doctor", isAvailable: false }),
      doctorRow(2, { first: "Suspended", last: "NoWindow", isAvailable: false }),
    ];
    state.windows = [{ doctor_id: 1, weekday: TODAY_WEEKDAY, is_active: true }];

    const byId = await fetchDirectory();

    expect(byId.get(1)?.is_available).toBe(false);
    expect(byId.get(1)?.available_today).toBe(false);
    expect(byId.get(2)?.available_today).toBe(false);
  });

  it("queries windows with today's ISO weekday (0=Monday) and is_active: true", async () => {
    state.doctors = [doctorRow(1, { first: "Query", last: "Args" })];
    state.windows = [{ doctor_id: 1, weekday: TODAY_WEEKDAY, is_active: true }];

    await fetchDirectory();

    expect(state.lastWindowWhere).toMatchObject({
      doctor_id: { in: [1] },
      weekday: TODAY_WEEKDAY,
      is_active: true,
    });
    expect(TODAY_WEEKDAY).toBeGreaterThanOrEqual(0);
    expect(TODAY_WEEKDAY).toBeLessThanOrEqual(6);
  });

  it("queries closures as UTC-midnight full-day exceptions (start_time null)", async () => {
    state.doctors = [doctorRow(1, { first: "Closure", last: "Args" })];

    await fetchDirectory();

    expect(state.lastClosureWhere).toMatchObject({
      doctor_id: { in: [1] },
      start_time: null,
      date: utcMidnight(TODAY),
    });
  });

  it("reports available_today=false for every doctor when nobody set a window", async () => {
    state.doctors = [
      doctorRow(1, { first: "No", last: "Schedule" }),
      doctorRow(2, { first: "Also", last: "NoSchedule" }),
    ];

    const byId = await fetchDirectory();

    expect(byId.get(1)?.available_today).toBe(false);
    expect(byId.get(2)?.available_today).toBe(false);
    // The account itself is fine — the day simply was never set.
    expect(byId.get(1)?.is_available).toBe(true);
  });
});
