-- Centralized id-based media references (Phase 2/11/12):
-- User.profile_image / HealthRecord.file / Article.image used to store path
-- strings; the actual bytes already live in media_file.data (BYTEA). Switch
-- every reference to the MediaFile id and serve as GET /media/{id}.
--
-- Backfill first (verified: every existing reference resolves to a media_file
-- row — no dangling values), then drop the path columns.

-- 1. Add id-based reference columns.
ALTER TABLE "accounts_user" ADD COLUMN "profile_image_id" INTEGER;
ALTER TABLE "treatments_healthrecord" ADD COLUMN "file_id" INTEGER;
ALTER TABLE "blog_article" ADD COLUMN "image_id" INTEGER;

-- 2. Backfill ids from the legacy path values.
UPDATE "accounts_user" u
SET "profile_image_id" = m."id"
FROM "media_file" m
WHERE u."profile_image" = m."path";

UPDATE "treatments_healthrecord" h
SET "file_id" = m."id"
FROM "media_file" m
WHERE h."file" = m."path";

UPDATE "blog_article" a
SET "image_id" = m."id"
FROM "media_file" m
WHERE a."image" = m."path";

-- 3. Indexes (Prisma default naming: _key for @unique, _idx for @@index).
CREATE UNIQUE INDEX "accounts_user_profile_image_id_key" ON "accounts_user"("profile_image_id");
CREATE INDEX "treatments_healthrecord_file_id_idx" ON "treatments_healthrecord"("file_id");
CREATE INDEX "blog_article_image_id_idx" ON "blog_article"("image_id");

-- 4. Foreign keys — a reference must point at a real MediaFile row; deleting
--    the media row clears the reference instead of breaking it (SET NULL).
ALTER TABLE "accounts_user" ADD CONSTRAINT "accounts_user_profile_image_id_fkey"
  FOREIGN KEY ("profile_image_id") REFERENCES "media_file"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "treatments_healthrecord" ADD CONSTRAINT "treatments_healthrecord_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "media_file"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_image_id_fkey"
  FOREIGN KEY ("image_id") REFERENCES "media_file"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Drop the legacy path columns (nothing stores paths anymore).
ALTER TABLE "accounts_user" DROP COLUMN "profile_image";
ALTER TABLE "treatments_healthrecord" DROP COLUMN "file";
ALTER TABLE "blog_article" DROP COLUMN "image";
