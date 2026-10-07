-- Brute-force protection for sign-in: a shared failed-attempt counter plus an
-- explicit lock state on the account row.
--
--   failed_login_attempts  consecutive failures (login form + reset-confirm
--                          rejections that resolve to a user); reset on a
--                          successful login or an administrator unlock.
--   account_locked         TRUE while sign-in/refresh/social sign-in are
--                          blocked for this account.
--   locked_until           auto-unlock deadline for temporary locks; NULL for
--                          doctor locks that only an administrator may lift.
--   lock_reason            "TEMPORARY" | "ADMIN_REQUIRED" | "ADMIN_TEMPORARY"
--                          ("" whenever the account is not locked).
--   last_failed_login_at   when the most recent failed attempt was recorded.
--
-- Additive only: existing rows start unlocked with a zero counter, so no
-- account's current access changes when this migration runs.
ALTER TABLE "accounts_user" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "accounts_user" ADD COLUMN "account_locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "accounts_user" ADD COLUMN "locked_until" TIMESTAMP(3);
ALTER TABLE "accounts_user" ADD COLUMN "lock_reason" VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE "accounts_user" ADD COLUMN "last_failed_login_at" TIMESTAMP(3);
