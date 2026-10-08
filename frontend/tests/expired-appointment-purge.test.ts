/**
 * 24-hour auto-delete for expired emergency appointments (repo layer):
 *
 *  • only `expired` EMERGENCY rows are ever considered — every other status
 *    is untouched no matter how old it is,
 *  • a row is deleted when its expiry moment (`emergency_expired_at`, falling
 *    back to its scheduled end) is at or before the cutoff,
 *  • the removed rows come back with id + parties so the caller can broadcast
 *    `appointment.deleted`, and the guarded delete re-asserts the status.
 *
 * The fake honours the delete guard but returns the seeded rows from
 * findMany, so the WHERE shape is asserted rather than emulated.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type Row = Record<string, any>;

  const rows: Row[] = [];
  const state = { findWhere: null as Row | null, deleteWhere: null as Row | null };

  const prisma: any = {
    appointment: {
      findMany: async ({ where }: Row) => {
        state.findWhere = where;
        return rows.map((row) => ({ ...row }));
      },
      deleteMany: async ({ where }: Row) => {
        state.deleteWhere = where;
        const ids: number[] = where.id.in;
        const kept = rows.filter((row) => !(ids.includes(row.id) && row.status === where.status));
        const count = rows.length - kept.length;
        rows.splice(0, rows.length, ...kept);
        return { count };
      },
    },
  };

  return {
    prisma,
    state,
    rows,
    reset() {
      rows.length = 0;
      state.findWhere = null;
      state.deleteWhere = null;
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: harness.prisma }));

import { purgeExpiredEmergencies } from "@/repositories/appointments.repo";

const HOUR = 3_600_000;
/** The service passes "now minus 24h"; tests pass a fixed instant instead. */
const CUTOFF = new Date("2026-10-08T12:00:00.000Z");

function expiredRow(overrides: Record<string, any> = {}) {
  return {
    status: "expired",
    emergency_expired_at: new Date(CUTOFF.getTime() - HOUR),
    appointment_date: new Date("2026-10-07T00:00:00.000Z"),
    end_time: "09:00",
    patient_id: 7,
    doctor: { user_id: 12 },
    ...overrides,
  };
}

beforeEach(() => harness.reset());

describe("purgeExpiredEmergencies", () => {
  it("scopes the query to expired emergency rows", async () => {
    await purgeExpiredEmergencies(CUTOFF);

    expect(harness.state.findWhere).toMatchObject({
      status: "expired",
      appointment_type: "EMERGENCY",
    });
  });

  it("deletes only rows whose expiry is at or before the cutoff", async () => {
    harness.rows.push(
      expiredRow({ id: 1, emergency_expired_at: new Date(CUTOFF.getTime() - 24 * HOUR - HOUR) }),
      expiredRow({ id: 2, emergency_expired_at: new Date(CUTOFF.getTime() + HOUR) }),
      expiredRow({ id: 3, emergency_expired_at: new Date(CUTOFF.getTime()) }), // boundary counts
      expiredRow({ id: 4, emergency_expired_at: null, end_time: "08:00" }),
      expiredRow({
        id: 5,
        emergency_expired_at: null,
        appointment_date: new Date("2026-10-08T00:00:00.000Z"),
        end_time: "18:00",
      }),
      expiredRow({ id: 6, emergency_expired_at: null, end_time: "07:30:00" }) // seconds form
    );

    const removed = await purgeExpiredEmergencies(CUTOFF);

    expect(removed.map((row) => row.id)).toEqual([1, 3, 4, 6]);
    expect(removed[0]).toMatchObject({ patient_id: 7, doctor: { user_id: 12 } });
    expect(harness.state.deleteWhere).toMatchObject({
      status: "expired",
      id: { in: [1, 3, 4, 6] },
    });
    expect(harness.rows.map((row) => row.id)).toEqual([2, 5]);
  });

  it("does nothing when no expired row is old enough", async () => {
    harness.rows.push(expiredRow({ id: 9, emergency_expired_at: new Date(CUTOFF.getTime() + 3 * HOUR) }));

    const removed = await purgeExpiredEmergencies(CUTOFF);

    expect(removed).toEqual([]);
    expect(harness.state.deleteWhere).toBeNull();
  });
});
