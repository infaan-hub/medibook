/**
 * Account locking — the brute-force policy end to end against a stateful
 * stand-in for the User / RefreshToken / PasswordResetToken tables:
 *
 *   • 3 failures lock the account per role — patient = 2-minute auto-unlock,
 *     doctor = administrator-only, admin = bounded 15-minute window,
 *   • a locked account answers HTTP 423 with machine-readable `data` on login
 *     AND on refresh (an already-issued token cannot bypass the lock),
 *   • an expired temporary lock clears lazily on the next attempt,
 *   • password-reset confirm feeds the SAME attempt counter and can never
 *     free a locked account, while a successful reset only clears the counter,
 *   • the admin unlock endpoint lifts the lock, resets the counter and audits,
 *   • an unknown username stays indistinguishable from a wrong password.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

const harness = vi.hoisted(() => {
  type Row = Record<string, any>;

  const users: Row[] = [];
  const refreshTokens: Row[] = [];
  const resetTokens: Row[] = [];
  const otps: Row[] = [];
  const audits: Row[] = [];
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
        if ("equals" in op && op.mode === "insensitive") {
          if (String(value ?? "").toLowerCase() !== String(op.equals).toLowerCase()) return false;
          continue;
        }
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
  const requireRow = (rows: Row[], where: Row) => {
    const row = find(rows, where);
    if (!row) throw new Error("Record to update not found.");
    return row;
  };

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
      update: async ({ where, data }: Row) => Object.assign(requireRow(users, where), data),
      updateMany: async ({ where, data }: Row) => {
        const rows = filter(users, where);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      count: async () => users.length,
      findMany: async ({ where }: Row) => filter(users, where).map((row) => ({ ...row })),
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
      update: async ({ where, data }: Row) =>
        Object.assign(requireRow(refreshTokens, where), data),
      updateMany: async ({ where, data }: Row) => {
        const rows = filter(refreshTokens, where);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    passwordResetToken: {
      create: async ({ data }: Row) => {
        const row = {
          id: seq++,
          used_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          ...data,
        };
        resetTokens.push(row);
        return { ...row };
      },
      findFirst: async ({ where, include }: Row) => {
        const row = find(resetTokens, where);
        if (!row) return null;
        const user = row.user_id != null ? find(users, { id: row.user_id }) : null;
        return { ...row, ...(include?.user && user ? { user: { ...user } } : {}) };
      },
      update: async ({ where, data }: Row) =>
        Object.assign(requireRow(resetTokens, where), data),
      updateMany: async ({ where, data }: Row) => {
        const rows = filter(resetTokens, where);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    auditEvent: {
      create: async ({ data }: Row) => {
        const row = { id: seq++, created_at: new Date(), ...data };
        audits.push(row);
        return { ...row };
      },
    },
    // A successful login now only issues an OTP challenge (no tokens); these
    // flows never verify it, so the row store just has to exist.
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
      update: async ({ where, data }: Row) =>
        Object.assign(requireRow(otps, where), data),
      deleteMany: async ({ where }: Row) => {
        const rows = filter(otps, where ?? {});
        rows.forEach((row) => otps.splice(otps.indexOf(row), 1));
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
    /**
     * Only one raw statement exists in this code path — the atomic
     * failed-attempt UPDATE (increment + threshold lock + RETURNING). Its
     * parameters appear in template order; the fake replays the same logic
     * against the in-memory row so concurrent-shape assertions hold.
     */
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
        return [
          { id, role, account_locked, locked_until, lock_reason, failed_login_attempts },
        ];
      }
      return [];
    },
  };

  function addUser(overrides: Row = {}): Row {
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
  }

  function addResetToken(userId: number): Row {
    const row = {
      id: seq++,
      token: randomBytes(24).toString("base64url"),
      user_id: userId,
      used_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    resetTokens.push(row);
    return row;
  }

  function reset() {
    users.length = 0;
    refreshTokens.length = 0;
    resetTokens.length = 0;
    otps.length = 0;
    audits.length = 0;
    notifications.length = 0;
    seq = 1;
  }

  return {
    prisma,
    users,
    refreshTokens,
    resetTokens,
    audits,
    notifications,
    addUser,
    addResetToken,
    reset,
    user: (id: number) => find(users, { id }) as Row,
    mail: { sendMail: vi.fn(async () => undefined) },
  };
});

// Sign-in needs a signing key, and the routes under test must not 429 while a
// suite hammers them; both are environment switches, not behaviour.
vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-key-for-account-lock-suite-0000";
  process.env.THROTTLE_DISABLED = "true";
});

vi.mock("@/lib/db", () => ({ prisma: harness.prisma }));
vi.mock("@/lib/mail", () => ({
  sendMail: harness.mail.sendMail,
  passwordResetMail: (user: { email: string }, token: string) => ({
    to: user.email,
    subject: "Reset",
    text: token,
  }),
}));

import { ApiError } from "@/lib/errors";
import {
  MAX_LOGIN_ATTEMPTS,
  enforceLock,
  hasExpiredLock,
  invalidCredentialsError,
  lockPlan,
  lockState,
  lockedError,
} from "@/lib/account-lock";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";
import { hashPassword, verifyPassword } from "@/lib/password";
import { login, passwordResetConfirm, passwordResetRequest, refresh } from "@/services/auth.service";
import { POST as unlockAccount } from "@/app/api/admin/users/[id]/unlock/route";

const PASSWORD = "CorrectHorse1!";

function seed(overrides: Record<string, unknown> = {}) {
  return harness.addUser({
    username: "juma",
    email: "juma@example.com",
    password: hashPassword(PASSWORD),
    ...overrides,
  });
}

/** Run login and hand back whatever it threw (null when it succeeded). */
async function attempt(username: string, password: string): Promise<ApiError | null> {
  try {
    await login({ username, password });
    return null;
  } catch (error) {
    return error as ApiError;
  }
}

/** Drive the shared counter up to (and through) the lock threshold. */
async function failTimes(username: string, times: number): Promise<ApiError | null> {
  let last: ApiError | null = null;
  for (let i = 0; i < times; i += 1) last = await attempt(username, "wrong-password");
  return last;
}

beforeEach(() => harness.reset());

describe("lock policy per role", () => {
  it("locks a patient after 3 failures for ~2 minutes with a 423 payload", async () => {
    const user = seed({ role: "patient" });

    const first = await attempt("juma", "nope");
    expect(first?.status).toBe(400);
    expect(first?.data).toMatchObject({ code: "INVALID_CREDENTIALS", remaining_attempts: 2 });

    const second = await attempt("juma", "nope");
    expect(second?.data).toMatchObject({ code: "INVALID_CREDENTIALS", remaining_attempts: 1 });

    const third = await failTimes("juma", 1);
    expect(third?.status).toBe(423);
    expect(third?.data).toMatchObject({
      code: "ACCOUNT_LOCKED",
      role: "patient",
      requires_admin: false,
      remaining_attempts: 0,
    });
    expect(third?.errors.non_field_errors?.[0]).toContain("Try again in");
    const wait = Date.parse(String(third?.data?.locked_until)) - Date.now();
    expect(wait).toBeGreaterThan(110_000);
    expect(wait).toBeLessThanOrEqual(120_000);

    const row = harness.user(user.id);
    expect(row).toMatchObject({
      account_locked: true,
      lock_reason: "TEMPORARY",
      failed_login_attempts: 3,
    });
    expect(row.locked_until).toBeInstanceOf(Date);
  });

  it("locks a doctor until an administrator unlocks it (no deadline)", async () => {
    const user = seed({ username: "dr.amina", email: "amina@example.com", role: "doctor" });

    const error = await failTimes("dr.amina", MAX_LOGIN_ATTEMPTS);
    expect(error?.status).toBe(423);
    expect(error?.data).toMatchObject({ requires_admin: true, locked_until: null });
    expect(error?.errors.non_field_errors?.[0]).toContain("administrator must unlock");

    const row = harness.user(user.id);
    expect(row).toMatchObject({ account_locked: true, lock_reason: "ADMIN_REQUIRED" });
    expect(row.locked_until).toBeNull();
  });

  it("locks an admin for a bounded 15 minutes (never permanently)", async () => {
    const user = seed({ username: "boss", email: "boss@example.com", role: "admin" });

    const error = await failTimes("boss", MAX_LOGIN_ATTEMPTS);
    expect(error?.status).toBe(423);
    expect(error?.data).toMatchObject({ role: "admin", requires_admin: false });
    const wait = Date.parse(String(error?.data?.locked_until)) - Date.now();
    expect(wait).toBeGreaterThan(840_000);
    expect(wait).toBeLessThanOrEqual(900_000);
    expect(harness.user(user.id)).toMatchObject({ lock_reason: "ADMIN_TEMPORARY" });
  });

  it("rejects a CORRECT password while locked, without extending anything", async () => {
    const user = seed();
    await failTimes("juma", MAX_LOGIN_ATTEMPTS);
    const lockedAt = harness.user(user.id).locked_until;

    const error = await attempt("juma", PASSWORD);
    expect(error?.status).toBe(423);
    expect(error?.data).toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(harness.user(user.id).locked_until).toEqual(lockedAt);
    expect(harness.user(user.id).failed_login_attempts).toBe(3);
  });

  it("clears an expired temporary lock lazily and lets the owner back in", async () => {
    const user = seed({
      failed_login_attempts: 3,
      account_locked: true,
      locked_until: new Date(Date.now() - 1_000),
      lock_reason: "TEMPORARY",
    });

    const result = await login({ username: "juma", password: PASSWORD });
    expect(result.otpRequired).toBe(true); // password accepted → OTP challenge, no tokens yet

    expect(harness.user(user.id)).toMatchObject({
      account_locked: false,
      locked_until: null,
      lock_reason: "",
      failed_login_attempts: 0,
    });
  });

  it("keeps an unknown username indistinguishable from a wrong password", async () => {
    seed();
    const error = await attempt("ghost", "whatever");
    expect(error?.status).toBe(400);
    expect(error?.message).toBe("The username or password is incorrect.");
    expect(error?.errors.non_field_errors).toEqual([
      "The username or password is incorrect.",
    ]);
    expect(error?.data).toBeUndefined();
  });

  it("resets the attempt counter on a successful login", async () => {
    const user = seed({ failed_login_attempts: 2 });
    await login({ username: "juma", password: PASSWORD });
    expect(harness.user(user.id).failed_login_attempts).toBe(0);
    expect(harness.user(user.id).account_locked).toBe(false);
  });
});

describe("refresh cannot bypass a lock", () => {
  it("answers 423 for a locked account and works again once unlocked", async () => {
    const user = seed();
    const jti = randomBytes(16).toString("hex");
    const token = await signRefreshToken(user.id, jti);
    harness.refreshTokens.push({
      id: 1,
      user_id: user.id,
      jti,
      expires_at: new Date(Date.now() + 86_400_000),
      revoked_at: null,
    });

    await failTimes("juma", MAX_LOGIN_ATTEMPTS);

    const locked = await refresh({ refresh: token }).catch((error) => error as ApiError);
    expect(locked).toBeInstanceOf(ApiError);
    expect((locked as ApiError).status).toBe(423);
    expect((locked as ApiError).data).toMatchObject({ code: "ACCOUNT_LOCKED" });
    // The lock rejection happens BEFORE rotation, so the token stays usable.
    expect(harness.refreshTokens[0].revoked_at).toBeNull();

    const { unlockUser } = await import("@/repositories/users.repo");
    await unlockUser(user.id);

    const pair = await refresh({ refresh: token });
    expect(pair.access).toBeTruthy();
    expect(pair.refresh).toBeTruthy();
    expect(harness.refreshTokens[0].revoked_at).toBeInstanceOf(Date);
  });
});

describe("password reset handle + shared counter", () => {
  it("hands the forgot-password flow a live handle (case-insensitive email)", async () => {
    seed({ email: "Reset.Me@Example.com" });

    const { reset_handle } = await passwordResetRequest({ email: "reset.me@example.com" });
    expect(reset_handle).toBeTruthy();
    expect(harness.mail.sendMail).toHaveBeenCalledTimes(1);
    const tokenRow = harness.resetTokens[0];
    expect(tokenRow.token).toBe(reset_handle);
    expect(tokenRow.used_at).toBeNull();
  });

  it("still rejects an unknown email explicitly", async () => {
    const error = await passwordResetRequest({ email: "nobody@example.com" }).catch(
      (e) => e as ApiError
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).errors.email).toEqual([
      "No account with this email address.",
    ]);
  });

  it("feeds reset-confirm rejections into the same shared lock", async () => {
    const user = seed({ username: "zawadi", email: "zawadi@example.com" });
    const token = harness.addResetToken(user.id);

    const mismatch = () =>
      passwordResetConfirm({
        token: token.token,
        new_password: "BrandNewPass1!",
        new_password_confirm: "DifferentPass1!",
      });

    const first = await mismatch().catch((e) => e as ApiError);
    expect((first as ApiError).status).toBe(400);
    expect(harness.user(user.id).failed_login_attempts).toBe(1);

    await mismatch().catch(() => undefined);
    expect(harness.user(user.id).failed_login_attempts).toBe(2);

    const third = await mismatch().catch((e) => e as ApiError);
    expect((third as ApiError).status).toBe(423);
    expect((third as ApiError).data).toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(harness.user(user.id).account_locked).toBe(true);
  });

  it("never lets a reset free a locked account", async () => {
    const user = seed({ username: "zawadi", email: "zawadi@example.com" });
    const token = harness.addResetToken(user.id);
    await failTimes("zawadi", MAX_LOGIN_ATTEMPTS);
    expect(harness.user(user.id).account_locked).toBe(true);

    const error = await passwordResetConfirm({
      token: token.token,
      new_password: "BrandNewPass1!",
      new_password_confirm: "BrandNewPass1!",
    }).catch((e) => e as ApiError);

    expect((error as ApiError).status).toBe(423);
    // Lock untouched AND the token not consumed — nothing moved.
    expect(harness.user(user.id)).toMatchObject({
      account_locked: true,
      lock_reason: "TEMPORARY",
      failed_login_attempts: 3,
    });
    expect(token.used_at).toBeNull();
  });

  it("on success clears the counter and revokes sessions, leaving lock fields alone", async () => {
    const user = seed({
      username: "zawadi",
      email: "zawadi@example.com",
      failed_login_attempts: 2,
    });
    const token = harness.addResetToken(user.id);
    harness.refreshTokens.push({
      id: 9,
      user_id: user.id,
      jti: "live-jti",
      expires_at: new Date(Date.now() + 86_400_000),
      revoked_at: null,
    });

    await passwordResetConfirm({
      token: token.token,
      new_password: "BrandNewPass1!",
      new_password_confirm: "BrandNewPass1!",
    });

    const row = harness.user(user.id);
    expect(verifyPassword("BrandNewPass1!", row.password)).toBe(true);
    expect(row.failed_login_attempts).toBe(0);
    expect(row.account_locked).toBe(false);
    expect(row.lock_reason).toBe("");
    expect(row.locked_until).toBeNull();
    expect(token.used_at).toBeInstanceOf(Date);
    expect(harness.refreshTokens[0].revoked_at).toBeInstanceOf(Date);
  });
});

describe("POST /api/admin/users/{id}/unlock/", () => {
  async function callUnlock(actorId: number, targetId: number) {
    const token = await signAccessToken(actorId);
    return unlockAccount(
      new Request(`https://medibook.test/api/admin/users/${targetId}/unlock/`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
      { params: Promise.resolve({ id: String(targetId) }) } as never
    );
  }

  it("lifts the lock, resets the counter and records an audit row", async () => {
    const admin = seed({ username: "root", email: "root@example.com", is_superuser: true });
    const user = seed({ username: "dr.amina", email: "amina@example.com", role: "doctor" });
    await failTimes("dr.amina", MAX_LOGIN_ATTEMPTS);
    expect(harness.user(user.id).account_locked).toBe(true);

    const response = await callUnlock(admin.id, user.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: user.id,
      account_locked: false,
      lock_reason: "",
      failed_login_attempts: 0,
    });
    expect(body.data.locked_until).toBeNull();
    expect(harness.user(user.id).account_locked).toBe(false);

    const audit = harness.audits.find((row) => row.action === "user.unlocked");
    expect(audit).toBeTruthy();
    expect(audit?.target).toBe("dr.amina");
    expect(audit?.actor_id).toBe(admin.id);
  });

  it("refuses to unlock an account that is not locked", async () => {
    const admin = seed({ username: "root", email: "root@example.com", is_superuser: true });
    const user = seed({ username: "fine", email: "fine@example.com" });

    const response = await callUnlock(admin.id, user.id);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors.non_field_errors).toEqual(["This account is not locked."]);
  });

  it("requires a superuser", async () => {
    const patient = seed({ username: "curious", email: "curious@example.com" });
    const user = seed({ username: "locked", email: "locked@example.com" });
    await failTimes("locked", MAX_LOGIN_ATTEMPTS);

    const response = await callUnlock(patient.id, user.id);
    expect(response.status).toBe(403);
    expect(harness.user(user.id).account_locked).toBe(true);
  });
});

describe("policy helpers", () => {
  const fields = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    role: "patient",
    account_locked: false,
    locked_until: null,
    lock_reason: "",
    failed_login_attempts: 0,
    ...overrides,
  });

  it("picks the lock plan from the role", () => {
    expect(lockPlan("patient")).toMatchObject({ reason: "TEMPORARY" });
    expect(lockPlan("doctor")).toEqual({ reason: "ADMIN_REQUIRED", until: null });
    expect(lockPlan("admin")).toMatchObject({ reason: "ADMIN_TEMPORARY" });
    expect(lockPlan("admin").until!.getTime()).toBeGreaterThan(Date.now());
  });

  it("treats a past deadline as unlocked and a null deadline as admin-only", () => {
    expect(hasExpiredLock(fields({ account_locked: true, locked_until: new Date(Date.now() - 5) }))).toBe(true);
    expect(hasExpiredLock(fields({ account_locked: true, locked_until: null }))).toBe(false);
    expect(
      lockState(fields({ account_locked: true, locked_until: null, lock_reason: "ADMIN_REQUIRED" }))
    ).toMatchObject({ locked: true, requires_admin: true, locked_until: null });
  });

  it("counts down remaining attempts toward the threshold", () => {
    expect(lockState(fields({ failed_login_attempts: 1 })).remaining_attempts).toBe(2);
    expect(lockState(fields({ failed_login_attempts: 9 })).remaining_attempts).toBe(0);
  });

  it("renders a 423 with a countdown message and a 400 with attempts left", () => {
    const locked = lockedError(
      fields({
        account_locked: true,
        locked_until: new Date(Date.now() + 120_000),
        lock_reason: "TEMPORARY",
      })
    );
    expect(locked.status).toBe(423);
    expect(locked.message).toContain("Try again in 2 minutes");
    expect(locked.data?.code).toBe("ACCOUNT_LOCKED");

    const wrong = invalidCredentialsError(fields({ failed_login_attempts: 2 }));
    expect(wrong.status).toBe(400);
    expect(wrong.data).toMatchObject({ code: "INVALID_CREDENTIALS", remaining_attempts: 1 });
    expect(invalidCredentialsError().data).toBeUndefined();
  });

  it("enforceLock is a no-op when the account is free", async () => {
    const free = fields();
    await expect(enforceLock(free)).resolves.toEqual(free);
  });
});

describe("administrator lock notifications", () => {
  const addAdmin = (username: string, overrides: Record<string, unknown> = {}) =>
    harness.addUser({
      username,
      email: `${username}@example.com`,
      role: "admin",
      is_superuser: true,
      password: hashPassword(PASSWORD),
      ...overrides,
    });

  it("stays silent until the threshold, then notifies only admins", async () => {
    const root = addAdmin("root");
    harness.addUser({
      username: "dr_nosi",
      email: "dr@example.com",
      role: "doctor",
      password: hashPassword(PASSWORD),
    }); // active non-admin bystander must receive nothing
    seed();

    await failTimes("juma", 2);
    expect(harness.notifications).toHaveLength(0);

    await attempt("juma", "wrong-password"); // 3rd failure → patient lock
    expect(harness.notifications).toHaveLength(1);
    const notice = harness.notifications[0];
    expect(notice.recipient_id).toBe(root.id);
    expect(notice.notification_type).toBe("system");
    expect(notice.title).toBe("Account locked");
    expect(notice.message).toBe(
      'Patient account "juma" was locked after 3 failed sign-in attempts. It unlocks automatically in about 2 minutes.'
    );
  });

  it("tells admins a doctor lock needs a human unlock", async () => {
    const root = addAdmin("root");
    harness.addUser({
      username: "dr_nosi",
      email: "dr@example.com",
      role: "doctor",
      password: hashPassword(PASSWORD),
    });

    await failTimes("dr_nosi", 3);

    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].recipient_id).toBe(root.id);
    expect(harness.notifications[0].message).toBe(
      'Doctor account "dr_nosi" was locked after 3 failed sign-in attempts. An administrator must unlock it before the user can sign in.'
    );
  });

  it("fans out to every active admin and skips inactive ones", async () => {
    const root = addAdmin("root");
    const ops = addAdmin("ops");
    addAdmin("sleeping", { is_active: false });
    seed();

    await failTimes("juma", 3);

    const recipients = harness.notifications
      .map((notice) => notice.recipient_id as number)
      .sort((a, b) => a - b);
    expect(recipients).toEqual([root.id, ops.id].sort((a, b) => a - b));
  });

  it("does not notify when an admin account locks itself", async () => {
    const root = addAdmin("root");

    await failTimes("root", 3);

    expect(harness.user(root.id).account_locked).toBe(true);
    expect(harness.notifications).toHaveLength(0);
  });
});
