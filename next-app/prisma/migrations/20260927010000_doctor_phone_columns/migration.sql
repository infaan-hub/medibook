-- Doctor phone columns - schema.prisma gained `phone` / `phone_secondary`
-- on doctors_doctor but the migration was never created (P2022 at runtime:
-- selecting any doctor row failed with "column doctors_doctor.phone does not
-- exist", so GET /api/doctors/ and every doctor card 500'd).
-- Applied via `prisma migrate deploy`.
ALTER TABLE "doctors_doctor"
  ADD COLUMN IF NOT EXISTS "phone" VARCHAR(16) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "phone_secondary" VARCHAR(16) NOT NULL DEFAULT '';
