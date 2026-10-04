-- Real geolocation for patients & doctors — schema.prisma replaced the free
-- text location columns with actual coordinates.
--
-- Why: `patients_patient.city/address` and `doctors_doctor.city/office_address`
-- were human-typed strings. Nothing could compute a distance from them, so the
-- "nearby doctors" surface was a city-name substring match and the emergency
-- nearby-doctors endpoint returned `distance: 0` for everyone. Coordinates let
-- the app sort/filter by real metres and print a working directions link.
--
-- Every dropped column is NOT NULL today, but each carries `@default("")` in
-- the schema, so no row depends on the value. Existing rows keep NULL coords —
-- that is deliberate: NULL is exactly the "not filled in yet" signal the
-- frontend's fill-location prompt and the booking gate key off.
--
-- Index notes (verified against the live database):
--   * doctors_doctor has a btree index on `city` named `doctors_doctor_city_idx`
--     (Prisma's default naming for `@@index([city])`).
--   * patients_patient has NO city index in this database — the
--     `patients_patient_city_*` index only exists in the legacy Django dump
--     (backups/old-pg-medibook-backup.sql), so there is nothing to drop here.
--
-- Applied via `prisma migrate deploy` (never `db push` — see schema header).

-- AlterTable: patients_patient gains coordinates, loses address/city.
ALTER TABLE "patients_patient"
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "location_accuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "location_captured_at" TIMESTAMP(3);

ALTER TABLE "patients_patient"
  DROP COLUMN IF EXISTS "address",
  DROP COLUMN IF EXISTS "city";

-- AlterTable: doctors_doctor gains coordinates, loses city/office_address.
ALTER TABLE "doctors_doctor"
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "location_accuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "location_captured_at" TIMESTAMP(3);

ALTER TABLE "doctors_doctor"
  DROP COLUMN IF EXISTS "office_address",
  DROP COLUMN IF EXISTS "city";

-- DropIndex
DROP INDEX IF EXISTS "doctors_doctor_city_idx";
