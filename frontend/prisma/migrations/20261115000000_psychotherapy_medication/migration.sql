CREATE TABLE "psychotherapy_medication" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "diagnosis" TEXT NOT NULL DEFAULT '',
    "treatment_notes" TEXT NOT NULL DEFAULT '',
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "psychotherapy_medication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "psychotherapy_medication_session_id_key" ON "psychotherapy_medication"("session_id");

ALTER TABLE "psychotherapy_medication"
ADD CONSTRAINT "psychotherapy_medication_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "psychotherapy_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
