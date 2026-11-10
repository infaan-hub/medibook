CREATE TABLE "api_rate_limit_bucket" (
    "key" VARCHAR(64) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_rate_limit_bucket_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "api_rate_limit_bucket_hits_check" CHECK ("hits" >= 0)
);

CREATE INDEX "api_rate_limit_bucket_reset_at_idx"
ON "api_rate_limit_bucket"("reset_at");
