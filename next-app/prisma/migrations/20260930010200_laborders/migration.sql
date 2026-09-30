-- CreateEnum
CREATE TYPE "LabOrderStatus" AS ENUM ('ordered', 'in_progress', 'resulted', 'cancelled');

-- CreateTable
CREATE TABLE "labs_laborder" (
    "id" SERIAL NOT NULL,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'ordered',
    "test_name" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(30) NOT NULL DEFAULT '',
    "reference_min" DOUBLE PRECISION,
    "reference_max" DOUBLE PRECISION,
    "result_value" TEXT NOT NULL DEFAULT '',
    "result_notes" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "resulted_at" TIMESTAMP(3),
    "ordered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "appointment_id" INTEGER,

    CONSTRAINT "labs_laborder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labs_laborder_patient_id_status_idx" ON "labs_laborder"("patient_id", "status");

-- CreateIndex
CREATE INDEX "labs_laborder_doctor_id_patient_id_idx" ON "labs_laborder"("doctor_id", "patient_id");

-- CreateIndex
CREATE INDEX "labs_laborder_doctor_id_idx" ON "labs_laborder"("doctor_id");

-- CreateIndex
CREATE INDEX "labs_laborder_patient_id_idx" ON "labs_laborder"("patient_id");

-- CreateIndex
CREATE INDEX "labs_laborder_appointment_id_idx" ON "labs_laborder"("appointment_id");

-- CreateIndex
CREATE INDEX "labs_laborder_created_at_idx" ON "labs_laborder"("created_at");

-- AddForeignKey
ALTER TABLE "labs_laborder" ADD CONSTRAINT "labs_laborder_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labs_laborder" ADD CONSTRAINT "labs_laborder_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labs_laborder" ADD CONSTRAINT "labs_laborder_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments_appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

