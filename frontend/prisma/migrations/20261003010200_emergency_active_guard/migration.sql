-- One active emergency per patient, enforced by the DATABASE (§8 — race
-- safety). Two simultaneous POST /api/emergency/ calls can both pass a
-- read-then-insert check in JavaScript; a partial unique index cannot be
-- bypassed: the loser gets a constraint violation and the API turns it into
-- the same 409 the winner's guard produces.
--
-- The predicate mirrors the eligibility rule: pending / accepted /
-- in_progress all count as "active". `expired` rows drop out of the predicate,
-- which is exactly what lets the 30-minute timeout release the patient —
-- services/emergency.service.ts stamps them EXPIRED before inserting.
--
-- Before the index can be created, any patient already holding more than one
-- active emergency (possible before this guard existed) is normalised: keep
-- the one actually being treated (in_progress), else the newest, and mark the
-- rest EXPIRED so nothing is deleted and no history is rewritten to `done`.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "patient_id"
      ORDER BY ("status" = 'in_progress') DESC, "id" DESC
    ) AS rn
  FROM "appointments_appointment"
  WHERE "appointment_type" = 'EMERGENCY'
    AND "status" IN ('pending', 'accepted', 'in_progress')
)
UPDATE "appointments_appointment" AS a
SET "status" = 'expired',
    "emergency_expired_at" = NOW(),
    "updated_at" = NOW()
FROM ranked AS r
WHERE a."id" = r."id"
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_active_patient_emergency"
  ON "appointments_appointment"("patient_id")
  WHERE "appointment_type" = 'EMERGENCY'
    AND "status" IN ('pending', 'accepted', 'in_progress');
