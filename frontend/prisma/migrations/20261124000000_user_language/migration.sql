-- Per-account UI language preference. Existing rows default to English so
-- the migration is safe on a live database; the client validates the value
-- against the five supported codes before writing it.
ALTER TABLE "accounts_user" ADD COLUMN "language" VARCHAR(8) NOT NULL DEFAULT 'en';
