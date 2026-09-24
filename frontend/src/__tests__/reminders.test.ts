/**
 * Reminder preference rules + idempotency helpers (mirrors lib/reminders.ts).
 */
import { describe, it, expect } from "vitest";

/** Preference key matches reminder_type ("1h" | "24h" | "1w"). Missing = enabled. */
function reminderEnabled(prefs: unknown, reminderType: string): boolean {
  if (prefs === null || prefs === undefined || typeof prefs !== "object") return true;
  const record = prefs as Record<string, unknown>;
  if (record.appointment_reminders === false) return false;
  if (record.all === false) return false;
  return record[reminderType] !== false;
}

describe("reminder preferences", () => {
  it("enables all types by default (missing prefs)", () => {
    expect(reminderEnabled(null, "1h")).toBe(true);
    expect(reminderEnabled(undefined, "24h")).toBe(true);
    expect(reminderEnabled({}, "1w")).toBe(true);
  });

  it("respects per-type opt-out", () => {
    expect(reminderEnabled({ "1h": false }, "1h")).toBe(false);
    expect(reminderEnabled({ "1h": false }, "24h")).toBe(true);
    expect(reminderEnabled({ "24h": true }, "24h")).toBe(true);
  });

  it("respects master switches", () => {
    expect(reminderEnabled({ appointment_reminders: false }, "1h")).toBe(false);
    expect(reminderEnabled({ all: false }, "1w")).toBe(false);
    expect(reminderEnabled({ all: true, "1h": false }, "1h")).toBe(false);
  });
});

describe("atomic claim idempotency", () => {
  /** Simulates updateMany({ where: { id, sent: false }, data: { sent: true } }). */
  function makeClaimStore() {
    const rows = new Map<number, { sent: boolean }>([
      [1, { sent: false }],
      [2, { sent: false }],
    ]);
    return {
      claim(id: number): number {
        const row = rows.get(id);
        if (!row || row.sent) return 0;
        row.sent = true;
        return 1;
      },
      release(id: number): void {
        const row = rows.get(id);
        if (row) row.sent = false;
      },
      isSent(id: number): boolean {
        return rows.get(id)?.sent ?? true;
      },
    };
  }

  it("only one concurrent runner claims a row", () => {
    const store = makeClaimStore();
    expect(store.claim(1)).toBe(1);
    expect(store.claim(1)).toBe(0);
    expect(store.isSent(1)).toBe(true);
  });

  it("releases claim on failure so a later run can retry", () => {
    const store = makeClaimStore();
    expect(store.claim(2)).toBe(1);
    store.release(2);
    expect(store.isSent(2)).toBe(false);
    expect(store.claim(2)).toBe(1);
  });
});
