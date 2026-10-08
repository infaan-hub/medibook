/**
 * Two-step login (password → OTP) through the REAL route handlers against a
 * stateful stand-in for the User / LoginOtp / RefreshToken / Notification
 * tables:
 *
 *   • a wrong password still counts toward the account lock (unchanged),
 *   • a correct password answers with an OTP challenge and NO tokens — the
 *     code is delivered through notify() (inbox row + push) and only its
 *     scrypt hash is stored,
 *   • a wrong code costs one attempt on the CHALLENGE (three burn it), never
 *     a failed sign-in on the account,
 *   • the right code mints the JWT pair and consumes the challenge; every
 *     other challenge state (expired, burned, replayed, unknown) answers with
 *     one identical field error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type Row = Record<string, any>;

  const users: Row[] = [];
  const otps: Row[] = [];
  const refreshTokens: Row[] = [];
  const notifications: Row[] = [];
  let seq = 1;

  /** Minimal Prisma `where` matcher covering the operators these flows use. */
  function matches(row: Row, where: Row | undefined): boolean {
    for (const [key, cond] of Object.entries(where ?? {})) {
      if (key === "NOT") {
        if (matches(row, cond as Row)) return false;
        continue;
      }
      if (key === "OR") {
        if (!(cond as Row[]).some((clause) => matches(row, clause))) return false;
        continue;
      }
      const value = row[key];
      if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
        const op = cond as Row;
        if ("equals" in op && value !== op.equals) return false;
        if ("gt" in op && !(value > op.gt)) return false;
        if ("gte" in op && !(value >= op.gte)) return false;
        if ("lt" in op && !(value < op.lt)) return false;
        if ("lte" in op && !(value <= op.lte)) return false;
        if ("not" in op) {
          if (op.not === null ? value === null : value === op.not) return false;
        }
        continue;
      }
      if (value !== cond) return false;
    }
    return true;
  }

  const find = (rows: Row[], where: Row) => rows.find((row) => matches(row, where)) ?? null;
  const filter = (rows: Row[], where: Row) => rows.filter((row) => matches(row, where));

  const prisma: any = {
    user: {
      findUnique: async ({ where }: Row) => {
        const row = find(users, where);
        return row ? { ...row } : null;
      },
      findFirst: async ({ where }: Row) => {
        const row = find(users, where);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: Row) => {
        const row = find(users, where);
        if (!row) throw new Error("Record to update not found.");
        return Object.assign(row, data);
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = filter(users, where);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      findMany: async ({ where }: Row) => filter(users, where).map((row) => ({ ...row })),
      count: async () => users.length,
    },
    loginOtp: {
      create: async ({ data }: Row) => {
        const row = {
          id: seq++,
          attempts: 0,
          created_at: new Date(),
          updated_at: new Date(),
          ...data,
        };
        otps.push(row);
        return { ...row };
      },
      findUnique: async ({ where }: Row) => {
        const row = find(otps, where);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: Row) => {
        const row = find(otps, where);
        if (!row) throw new Error("Record to update not found.");
        return Object.assign(row, data);
      },
      deleteMany: async ({ where }: Row) => {
        const rows = filter(otps, where ?? {});
        rows.forEach((row) => otps.splice(otps.indexOf(row), 1));
        return { count: rows.length };
      },
    },
    refreshToken: {
      create: async ({ data }: Row) => {
        const row = { id: seq++, revoked_at: null, ...data };
        refreshTokens.push(row);
        return { ...row };
      },
      findUnique: async ({ where }: Row) => {
        const row = find(refreshTokens, where);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: Row) => {
        const row = find(refreshTokens, where);
        if (!row) throw new Error("Record to update not found.");
        return Object.assign(row, data);
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = filter(refreshTokens, where);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    notification: {
      create: async ({ data }: Row) => {
        const row = {
          id: seq++,
          is_read: false,
          push_sent: false,
          push_provider_id: "",
          related_appointment_id: null,
          created_at: new Date(),
          updated_at: new Date(),
          ...data,
        };
        notifications.push(row);
        return { ...row };
      },
    },
    pushSubscription: { findMany: async () => [] },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    // The atomic failed-attempt UPDATE (registerFailedAttempt) — replayed
    // against the in-memory row so the shared lock counter still works.
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]): Promise<Row[]> => {
      const sql = strings.join("?");
      if (sql.includes("failed_login_attempts") && sql.includes("+ 1")) {
        const [lastFailedAt, updatedAt, max, , until, , reason, userId] = values;
        const row = find(users, { id: Number(userId) });
        if (!row) return [];
        row.failed_login_attempts += 1;
        row.last_failed_login_at = lastFailedAt;
        row.updated_at = updatedAt;
        if (row.failed_login_attempts >= max) {
          row.account_locked = true;
          row.locked_until = until;
          row.lock_reason = reason;
        }
        const {
          id,
          role,
          account_locked,
          locked_until,
          lock_reason,
          failed_login_attempts,
        } = row;
        return [{ id, role, account_locked, locked_until, lock_reason, failed_login_attempts }];
      }
      return [];
    },
  };

  return {
    prisma,
    users,
    otps,
    refreshTokens,
    notifications,
    addUser(overrides: Row = {}): Row {
      const row: Row = {
        id: seq++,
        password: "",
        is_superuser: false,
        username: "",
        email: "",
        phone: "",
        first_name: "",
        last_name: "",
        role: "patient",
        doctor_onboarding_completed: false,
        profile_image_id: null,
        is_active: true,
        is_staff: false,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        failed_login_attempts: 0,
        account_locked: false,
        locked_until: null,
        lock_reason: "",
        last_failed_login_at: null,
        ...overrides,
      };
      users.push(row);
      return row;
    },
    reset() {
      users.length = 0;
      otps.length = 0;
      refreshTokens.length = 0;
      notifications.length = 0;
      seq = 1;
    },
  };
});

// JWT signing and the route throttle are environment switches, not behaviour.
vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-key-for-login-otp-suite-000";
  process.env.THROTTLE_DISABLED = "true";
});

vi.mock("@/lib/db", () => ({ prisma: harness.prisma }));

import { hashPassword } from "@/lib/password";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as verifyRoute } from "@/app/api/auth/login/verify/route";

const PASSWORD = "CorrectHorse1!";
const OTP_ERROR = ["The code is incorrect or expired."];

function seed(overrides: Record<string, unknown> = {}) {
  return harness.addUser({
    username: "juma",
    email: "juma@example.com",
    password: hashPassword(PASSWORD),
    ...overrides,
  });
}

function post(route: typeof loginRoute, body: unknown): Promise<Response> {
  return route(
    new Request("https://medibook.test/api/auth/login/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) } as never
  );
}

const submitLogin = (username: string, password: string) =>
  post(loginRoute, { username, password });
const submitOtp = (challenge: string, otp: string) => post(verifyRoute, { challenge, otp });

/** Start the flow and hand back { challenge, code } (code from the notify row). */
async function startChallenge(username = "juma", password = PASSWORD) {
  const response = await submitLogin(username, password);
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data.otp_required).toBe(true);
  const notice = harness.notifications[harness.notifications.length - 1];
  const match = /login code is (\d{6})/.exec(notice.message);
  expect(match).not.toBeNull();
  return { challenge: body.data.challenge as string, code: match![1], notice };
}

beforeEach(() => harness.reset());

describe("the password step", () => {
  it("keeps counting wrong passwords toward the lock, with no challenge issued", async () => {
    seed();

    const response = await submitLogin("juma", "wrong-password");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors.non_field_errors).toEqual(["The username or password is incorrect."]);
    expect(body.data).toMatchObject({ code: "INVALID_CREDENTIALS", remaining_attempts: 2 });
    expect(harness.otps).toHaveLength(0);
    expect(harness.notifications).toHaveLength(0);
  });

  it("answers a correct password with a challenge and NO tokens", async () => {
    const user = seed({ failed_login_attempts: 2 });

    const response = await submitLogin("juma", PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Verification code sent.");
    expect(body.data).toEqual({
      otp_required: true,
      challenge: expect.stringMatching(/^[0-9a-f]{64}$/),
      expires_in: 300,
    });
    // No session material leaks before the code is typed.
    expect(body.data.access).toBeUndefined();
    expect(body.data.refresh).toBeUndefined();
    expect(body.data.user).toBeUndefined();

    // The attempt budget resets at the password stage…
    expect(harness.users[0].failed_login_attempts).toBe(0);
    // …and the row stores only the scrypt hash, never the code.
    const row = harness.otps[0];
    expect(row.user_id).toBe(user.id);
    expect(row.code_hash).not.toMatch(/^\d{6}$/);
    expect(Math.abs(row.expires_at.getTime() - (Date.now() + 5 * 60_000))).toBeLessThan(15_000);

    // Delivery: one system notification titled "Login code" carrying the code.
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0]).toMatchObject({
      recipient_id: user.id,
      notification_type: "system",
      title: "Login code",
    });
    expect(harness.notifications[0].message).toMatch(/login code is \d{6}/);
    expect(harness.notifications[0].message).toContain("expires in 5 minutes");
  });
});

describe("the OTP step", () => {
  it("mints the JWT pair for the right code and consumes the challenge", async () => {
    const user = seed();
    const { challenge, code } = await startChallenge();

    const response = await submitOtp(challenge, code);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Login successful.");
    expect(body.data.access).toBeTruthy();
    expect(body.data.refresh).toBeTruthy();
    expect(body.data.user.username).toBe("juma");
    expect(harness.otps).toHaveLength(0); // single-use: success consumed it
    expect(harness.refreshTokens).toHaveLength(1);
    expect(harness.refreshTokens[0].user_id).toBe(user.id);
  });

  it("charges a wrong guess to the challenge, never to the account", async () => {
    seed();
    const { challenge, code } = await startChallenge();
    const wrong = code === "000000" ? "111111" : "000000";

    const response = await submitOtp(challenge, wrong);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors.otp).toEqual(OTP_ERROR);
    expect(harness.otps[0].attempts).toBe(1);
    expect(harness.users[0].failed_login_attempts).toBe(0); // untouched
    expect(harness.users[0].account_locked).toBe(false);
  });

  it("burns the challenge after the third wrong guess", async () => {
    seed();
    const { challenge, code } = await startChallenge();
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 3; i += 1) {
      const attempt = await submitOtp(challenge, wrong);
      expect(attempt.status).toBe(400);
    }
    expect(harness.otps).toHaveLength(0); // third wrong → row gone

    // Even the REAL code is dead now.
    const late = await submitOtp(challenge, code);
    expect(late.status).toBe(400);
    expect((await late.json()).errors.otp).toEqual(OTP_ERROR);
  });

  it("rejects a replayed (already consumed) challenge", async () => {
    seed();
    const { challenge, code } = await startChallenge();
    expect((await submitOtp(challenge, code)).status).toBe(200);

    const replay = await submitOtp(challenge, code);
    expect(replay.status).toBe(400);
    expect((await replay.json()).errors.otp).toEqual(OTP_ERROR);
  });

  it("rejects an expired challenge with the same generic error", async () => {
    seed();
    const { challenge, code } = await startChallenge();
    harness.otps[0].expires_at = new Date(Date.now() - 1_000);

    const response = await submitOtp(challenge, code);
    expect(response.status).toBe(400);
    expect((await response.json()).errors.otp).toEqual(OTP_ERROR);
  });

  it("rejects an unknown challenge identically", async () => {
    seed();

    const response = await submitOtp("f".repeat(64), "123456");
    expect(response.status).toBe(400);
    expect((await response.json()).errors.otp).toEqual(OTP_ERROR);
  });

  it("rejects a malformed code with the field message", async () => {
    seed();
    const { challenge } = await startChallenge();

    const response = await submitOtp(challenge, "12ab56");
    expect(response.status).toBe(400);
    expect((await response.json()).errors.otp).toEqual(["Enter the 6-digit code."]);
  });

  it("lets a fresh login supersede the previous challenge", async () => {
    seed();
    const first = await startChallenge();
    const second = await startChallenge();
    expect(second.challenge).not.toBe(first.challenge);
    expect(harness.otps).toHaveLength(1); // one active challenge per user

    expect((await submitOtp(first.challenge, first.code)).status).toBe(400);
    expect((await submitOtp(second.challenge, second.code)).status).toBe(200);
  });
});

describe("the lock gate", () => {
  it("never reaches the OTP step for a locked account", async () => {
    seed({
      account_locked: true,
      locked_until: new Date(Date.now() + 60_000),
      lock_reason: "TEMPORARY",
      failed_login_attempts: 3,
    });

    const response = await submitLogin("juma", PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body.data.code).toBe("ACCOUNT_LOCKED");
    expect(harness.otps).toHaveLength(0);
    expect(harness.notifications).toHaveLength(0);
  });
});
