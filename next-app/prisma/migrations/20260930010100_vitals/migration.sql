-- CreateTable
CREATE TABLE "vitals_vital" (
    "id" SERIAL NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "systolic_bp" INTEGER,
    "diastolic_bp" INTEGER,
    "pulse_bpm" INTEGER,
    "temperature_c" DOUBLE PRECISION,
    "glucose_mg_dl" INTEGER,
    "weight_kg" DOUBLE PRECISION,
    "height_cm" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "spo2_percent" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "appointment_id" INTEGER,

    CONSTRAINT "vitals_vital_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vitals_vital_patient_id_recorded_at_idx" ON "vitals_vital"("patient_id", "recorded_at");

-- CreateIndex
CREATE INDEX "vitals_vital_doctor_id_patient_id_idx" ON "vitals_vital"("doctor_id", "patient_id");

-- CreateIndex
CREATE INDEX "vitals_vital_doctor_id_idx" ON "vitals_vital"("doctor_id");

-- CreateIndex
CREATE INDEX "vitals_vital_patient_id_idx" ON "vitals_vital"("patient_id");

-- CreateIndex
CREATE INDEX "vitals_vital_appointment_id_idx" ON "vitals_vital"("appointment_id");

-- CreateIndex
CREATE INDEX "vitals_vital_created_at_idx" ON "vitals_vital"("created_at");

-- AddForeignKey
ALTER TABLE "vitals_vital" ADD CONSTRAINT "vitals_vital_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals_vital" ADD CONSTRAINT "vitals_vital_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals_vital" ADD CONSTRAINT "vitals_vital_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments_appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

