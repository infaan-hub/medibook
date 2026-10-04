-- Emergency-appointment feature columns — schema.prisma and the API code were
-- updated but this migration was never created, so production was missing:
--   * appointments_appointment.appointment_type + emergency_* (P2022 at runtime:
--     GET /api/appointments/ returned 500 "The request failed.")
--   * notifications_notification.related_appointment_id still NOT NULL (system/
--     review notifications have no appointment and cannot be inserted)
--   * media_file.updated_at still carried a DB default the schema doesn't have
-- Generated with `prisma migrate diff --from-url <db> --to-schema-datamodel
-- prisma/schema.prisma --script` and applied via `prisma migrate deploy`.

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('NORMAL', 'EMERGENCY');

-- AlterTable
ALTER TABLE "appointments_appointment" ADD COLUMN     "appointment_type" "AppointmentType" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "emergency_description" TEXT,
ADD COLUMN     "emergency_latitude" DOUBLE PRECISION,
ADD COLUMN     "emergency_location_accuracy" DOUBLE PRECISION,
ADD COLUMN     "emergency_longitude" DOUBLE PRECISION,
ADD COLUMN     "emergency_reason" TEXT,
ADD COLUMN     "emergency_requested_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "media_file" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notifications_notification" ALTER COLUMN "related_appointment_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "appointments_appointment_appointment_type_idx" ON "appointments_appointment"("appointment_type");
