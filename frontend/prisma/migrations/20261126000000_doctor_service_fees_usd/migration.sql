-- USD prices for the admin-managed service fees. Each service is priced in
-- TSh and USD independently so international patients see an exact amount
-- rather than a value derived from a hard-coded exchange rate.
ALTER TABLE "doctors_doctor"
  ADD COLUMN "appointment_fee_usd" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "home_service_fee_usd" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "psychotherapy_fee_usd" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "training_fee_usd" DECIMAL(10,2) NOT NULL DEFAULT 0;
