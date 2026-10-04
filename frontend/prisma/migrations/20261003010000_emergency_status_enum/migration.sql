-- Emergency lifecycle statuses (§27 re-request rules):
--   in_progress → the doctor physically arrived and is seeing the patient.
--                 While an emergency sits here the patient may NOT file another
--                 request, and the 30-minute timeout no longer applies — only
--                 `done` releases them.
--   expired     → the 30-minute window closed before the doctor started it.
--                 Terminal: the patient is free to request again, and the row
--                 stays in the database as history.
--
-- Both values are APPENDED so the DB enum order keeps matching the order
-- declared in schema.prisma (Prisma maps by name, not position, but keeping
-- them aligned means `prisma migrate diff` never proposes a rewrite).
--
-- The new values are only added here — they are first USED by a later
-- migration, because PostgreSQL refuses to read an enum value created in the
-- same transaction.
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'expired';
