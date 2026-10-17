-- Health-tip likes (blog): one row per (article, user); the unique pair
-- makes the like toggle idempotent and the count a plain row count.
-- Applied via `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "blog_article_like" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_article_like_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blog_article_like_user_id_idx" ON "blog_article_like"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "blog_article_like_article_id_user_id_key" ON "blog_article_like"("article_id", "user_id");

-- AddForeignKey
ALTER TABLE "blog_article_like" ADD CONSTRAINT "blog_article_like_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "blog_article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_article_like" ADD CONSTRAINT "blog_article_like_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "accounts_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;