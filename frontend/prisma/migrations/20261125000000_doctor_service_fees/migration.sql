-- Service-specific fees set by administrators. `consultation_fee` is kept as
-- the legacy appointment fee column and backfilled once; new reads/writes use
-- `appointment_fee` plus the other service categories.
ALTER TABLE "doctors_doctor"
  ADD COLUMN "appointment_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "home_service_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "psychotherapy_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "training_fee" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "doctors_doctor" SET "appointment_fee" = "consultation_fee";
