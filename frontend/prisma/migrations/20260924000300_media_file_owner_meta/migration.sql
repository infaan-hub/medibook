-- Harden media_file: surrogate id PK (path stays the unique stored reference),
-- original filename, owner, updated_at. Existing rows preserved.
ALTER TABLE "media_file" ADD COLUMN "id" SERIAL NOT NULL;
ALTER TABLE "media_file" DROP CONSTRAINT "MediaFile_pkey";
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_pkey" PRIMARY KEY ("id");
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_path_key" UNIQUE ("path");

ALTER TABLE "media_file" ADD COLUMN "filename" VARCHAR(255) NOT NULL DEFAULT '';
UPDATE "media_file" SET "filename" = regexp_replace("path", '^.*/', '') WHERE "filename" = '';

ALTER TABLE "media_file" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "media_file" ADD COLUMN "owner_id" INTEGER;
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "accounts_user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "media_file_owner_id_idx" ON "media_file"("owner_id");

-- Backfill owners from existing User.profile_image references.
UPDATE "media_file" m
SET "owner_id" = u."id"
FROM accounts_user u
WHERE u."profile_image" = m."path";

