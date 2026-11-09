-- Psychological therapy service: patient requests, the psychologist's plan,
-- planned sessions and the confidential treatment link per session.

CREATE TABLE "psychotherapy_request" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "doctor_id" INTEGER,
    "session_mode" TEXT NOT NULL DEFAULT 'online',
    "preferred_start_date" DATE NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'routine',
    "confidentiality_accepted" BOOLEAN NOT NULL DEFAULT false,
    "gender_preference" TEXT NOT NULL DEFAULT 'any',
    "language_preference" TEXT NOT NULL DEFAULT 'english',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "plan_approach" TEXT,
    "plan_goals" TEXT,
    "plan_frequency" TEXT,
    "plan_session_duration" INTEGER,
    "plan_total_sessions" INTEGER,
    "plan_start_date" DATE,
    "plan_start_time" VARCHAR(8),
    "plan_review_after" INTEGER,
    "assigned_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "psychotherapy_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "psychotherapy_session" (
    "id" SERIAL NOT NULL,
    "psychotherapy_request_id" INTEGER NOT NULL,
    "session_number" INTEGER NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "start_time" VARCHAR(8) NOT NULL,
    "end_time" VARCHAR(8) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "confidential_notes" TEXT,
    "treatment_id" INTEGER,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "psychotherapy_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "psychotherapy_request_status_created_at_idx" ON "psychotherapy_request"("status", "created_at");
CREATE INDEX "psychotherapy_request_patient_id_idx" ON "psychotherapy_request"("patient_id");
CREATE INDEX "psychotherapy_request_doctor_id_idx" ON "psychotherapy_request"("doctor_id");

CREATE UNIQUE INDEX "psychotherapy_session_psychotherapy_request_id_session_number_key" ON "psychotherapy_session"("psychotherapy_request_id", "session_number");
CREATE INDEX "psychotherapy_session_scheduled_date_status_idx" ON "psychotherapy_session"("scheduled_date", "status");
CREATE INDEX "psychotherapy_session_treatment_id_idx" ON "psychotherapy_session"("treatment_id");

ALTER TABLE "psychotherapy_request" ADD CONSTRAINT "psychotherapy_request_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "psychotherapy_request" ADD CONSTRAINT "psychotherapy_request_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors_doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "psychotherapy_session" ADD CONSTRAINT "psychotherapy_session_psychotherapy_request_id_fkey" FOREIGN KEY ("psychotherapy_request_id") REFERENCES "psychotherapy_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "psychotherapy_session" ADD CONSTRAINT "psychotherapy_session_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments_medicaltreatment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
