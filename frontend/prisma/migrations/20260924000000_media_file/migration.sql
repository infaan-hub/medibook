-- Uploaded media stored in Postgres (BYTEA) so files survive ephemeral serverless disks.
CREATE TABLE "MediaFile" (
    "path" TEXT NOT NULL,
    "contentType" VARCHAR(100) NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("path")
);
