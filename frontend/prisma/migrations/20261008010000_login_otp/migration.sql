-- Second-step login challenge (OTP): a correct password now issues a one-time
-- code instead of a JWT pair; the code is verified at
-- POST /api/auth/login/verify/, which answers with the tokens.
--
--   challenge  opaque handle the client carries between the two steps
--   code_hash  scrypt hash of the 6-digit code (never the code itself)
--   attempts   wrong guesses against this challenge; the third one burns it
--   expires_at 5 minutes after issue; a fresh login replaces the row
--
-- Additive only: no existing row or session changes when this migration runs.
CREATE TABLE "auth_loginotp" (
    "id" SERIAL NOT NULL,
    "challenge" VARCHAR(64) NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "auth_loginotp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_loginotp_challenge_key" ON "auth_loginotp"("challenge");
CREATE INDEX "auth_loginotp_user_id_idx" ON "auth_loginotp"("user_id");
CREATE INDEX "auth_loginotp_created_at_idx" ON "auth_loginotp"("created_at");

ALTER TABLE "auth_loginotp" ADD CONSTRAINT "auth_loginotp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
