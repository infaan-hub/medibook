-- CreateTable
CREATE TABLE "prescriptions_prescription" (
    "id" SERIAL NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "appointment_id" INTEGER,
    "treatment_id" INTEGER,

    CONSTRAINT "prescriptions_prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions_prescriptionitem" (
    "id" SERIAL NOT NULL,
    "medication" VARCHAR(200) NOT NULL,
    "dosage" VARCHAR(100) NOT NULL DEFAULT '',
    "frequency" VARCHAR(100) NOT NULL DEFAULT '',
    "route" VARCHAR(50) NOT NULL DEFAULT '',
    "duration_days" INTEGER,
    "refills" INTEGER NOT NULL DEFAULT 0,
    "instructions" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prescription_id" INTEGER NOT NULL,

    CONSTRAINT "prescriptions_prescriptionitem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prescriptions_prescription_doctor_id_patient_id_idx" ON "prescriptions_prescription"("doctor_id", "patient_id");

-- CreateIndex
CREATE INDEX "prescriptions_prescription_doctor_id_idx" ON "prescriptions_prescription"("doctor_id");

-- CreateIndex
CREATE INDEX "prescriptions_prescription_patient_id_idx" ON "prescriptions_prescription"("patient_id");

-- CreateIndex
CREATE INDEX "prescriptions_prescription_appointment_id_idx" ON "prescriptions_prescription"("appointment_id");

-- CreateIndex
CREATE INDEX "prescriptions_prescription_treatment_id_idx" ON "prescriptions_prescription"("treatment_id");

-- CreateIndex
CREATE INDEX "prescriptions_prescription_created_at_idx" ON "prescriptions_prescription"("created_at");

-- CreateIndex
CREATE INDEX "prescriptions_prescriptionitem_prescription_id_idx" ON "prescriptions_prescriptionitem"("prescription_id");

-- AddForeignKey
ALTER TABLE "prescriptions_prescription" ADD CONSTRAINT "prescriptions_prescription_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions_prescription" ADD CONSTRAINT "prescriptions_prescription_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions_prescription" ADD CONSTRAINT "prescriptions_prescription_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments_appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions_prescription" ADD CONSTRAINT "prescriptions_prescription_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments_medicaltreatment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions_prescriptionitem" ADD CONSTRAINT "prescriptions_prescriptionitem_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions_prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

