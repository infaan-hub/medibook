-- Column name mismatch: model field is created_at (no @map), SQL created createdAt.
ALTER TABLE "media_file" RENAME COLUMN "createdAt" TO "created_at";
