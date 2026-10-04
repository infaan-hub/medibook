-- Server-side lifecycle stamps for an emergency request. Every eligibility and
-- timeout decision reads THESE columns (server time), never a client clock:
--
--   emergency_requested_at     → patient filed the request (start of the
--                                30-minute window; already existed)
--   emergency_accepted_at      → doctor accepted
--   emergency_in_progress_at   → doctor tapped "Emergency In Progress"
--                                (the 30-minute rule stops here)
--   emergency_completed_at     → doctor tapped "Done" (patient released)
--   emergency_expired_at       → the 30-minute window closed first
--
-- All nullable: only the emergency rows carry them, and each is stamped once.
ALTER TABLE "appointments_appointment"
  ADD COLUMN IF NOT EXISTS "emergency_accepted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emergency_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emergency_expired_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emergency_in_progress_at" TIMESTAMP(3);

-- The eligibility check ("does this patient already hold an active emergency?")
-- runs on every POST /api/emergency/, and the expiry sweep uses the same
-- (patient, type, status) prefix.
CREATE INDEX IF NOT EXISTS "appointments_appointment_patient_id_appointment_type_status_idx"
  ON "appointments_appointment"("patient_id", "appointment_type", "status");
