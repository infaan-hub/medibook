-- Add IANA timezone on Patient (patients_patient) for reminder formatting (default UTC).
ALTER TABLE "patients_patient" ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC';
