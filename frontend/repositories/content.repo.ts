/** Content repository — blog articles + specialty/hospital catalogs. */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/* --------------------------------- Articles -------------------------------- */

export const countPublishedArticles = (category?: string) =>
  prisma.article.count({ where: { published: true, ...(category ? { category } : {}) } });

export const listPublishedArticles = (category: string | undefined, skip: number, take: number) =>
  prisma.article.findMany({
    where: { published: true, ...(category ? { category } : {}) },
    orderBy: [{ published_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
    include: { author: true },
    skip,
    take,
  });

export const findPublishedArticle = (slug: string) =>
  prisma.article.findFirst({ where: { slug, published: true }, include: { author: true } });

export const countAllArticles = () => prisma.article.count();

export const listAllArticles = (skip: number, take: number) =>
  prisma.article.findMany({
    orderBy: [{ published_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
    include: { author: true },
    skip,
    take,
  });

export const countAuthorArticles = (authorId: number) =>
  prisma.article.count({ where: { author_id: authorId } });

export const listAuthorArticles = (authorId: number, skip: number, take: number) =>
  prisma.article.findMany({
    where: { author_id: authorId },
    orderBy: [{ created_at: "desc" }],
    include: { author: true },
    skip,
    take,
  });

export const findArticle = (id: number) =>
  prisma.article.findUnique({ where: { id }, include: { author: true } });

export const findArticleBySlug = (slug: string) =>
  prisma.article.findUnique({ where: { slug }, include: { author: true } });

export const createArticle = (data: {
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  image_id?: number | null;
  category?: string;
  published?: boolean;
  author_id?: number | null;
  published_at?: Date | null;
}) =>
  prisma.article.create({
    data: { ...data, excerpt: data.excerpt ?? "", category: data.category ?? "general", published: data.published ?? false },
    include: { author: true },
  });

export const updateArticle = (
  id: number,
  data: Prisma.ArticleUncheckedUpdateInput,
  tx?: Prisma.TransactionClient
) => (tx ?? prisma).article.update({ where: { id }, data, include: { author: true } });

export const deleteArticle = (id: number, tx?: Prisma.TransactionClient) =>
  (tx ?? prisma).article.delete({ where: { id } });

/* ------------------------------ Article likes ------------------------------ */

export const findArticleLike = (articleId: number, userId: number) =>
  prisma.articleLike.findUnique({
    where: { article_id_user_id: { article_id: articleId, user_id: userId } },
  });

export const createArticleLike = (articleId: number, userId: number) =>
  prisma.articleLike.create({ data: { article_id: articleId, user_id: userId } });

export const deleteArticleLike = (articleId: number, userId: number) =>
  prisma.articleLike.deleteMany({ where: { article_id: articleId, user_id: userId } });

export const countArticleLikes = (articleId: number) =>
  prisma.articleLike.count({ where: { article_id: articleId } });

/** Per-article like counts for a page of articles in ONE query (no N+1). */
export const countLikesByArticleIds = async (articleIds: number[]): Promise<Map<number, number>> => {
  const counts = new Map<number, number>();
  if (articleIds.length === 0) return counts;
  const rows = await prisma.articleLike.groupBy({
    by: ["article_id"],
    where: { article_id: { in: articleIds } },
    _count: { _all: true },
  });
  for (const row of rows) counts.set(row.article_id, row._count._all);
  return counts;
};

/** The subset of `articleIds` this user has liked (ONE query). */
export const likedArticleIds = async (userId: number, articleIds: number[]): Promise<Set<number>> => {
  const liked = new Set<number>();
  if (articleIds.length === 0) return liked;
  const rows = await prisma.articleLike.findMany({
    where: { user_id: userId, article_id: { in: articleIds } },
    select: { article_id: true },
  });
  for (const row of rows) liked.add(row.article_id);
  return liked;
};

/* --------------------------- Specialties / hospitals ----------------------- */

export const countSpecialties = () => prisma.specialty.count();

export const listSpecialties = (skip: number, take: number) =>
  prisma.specialty.findMany({ orderBy: { name: "asc" }, skip, take });

export const findSpecialty = (id: number) => prisma.specialty.findUnique({ where: { id } });

export const findSpecialtyByNameExact = (name: string) =>
  prisma.specialty.findUnique({ where: { name } });

export const createSpecialty = (data: Record<string, unknown>) =>
  prisma.specialty.create({ data: data as never });

export const updateSpecialty = (id: number, data: Record<string, unknown>) =>
  prisma.specialty.update({ where: { id }, data: data as never });

export const deleteSpecialty = (id: number) => prisma.specialty.delete({ where: { id } });

export const countHospitals = (city?: string) =>
  prisma.hospital.count({ where: city ? { city: { contains: city, mode: "insensitive" } } : undefined });

export const listHospitals = (city: string | undefined, skip: number, take: number) =>
  prisma.hospital.findMany({
    where: city ? { city: { contains: city, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    skip,
    take,
  });

export const findHospital = (id: number) => prisma.hospital.findUnique({ where: { id } });

export const createHospital = (data: Record<string, unknown>) =>
  prisma.hospital.create({ data: data as never });

export const updateHospital = (id: number, data: Record<string, unknown>) =>
  prisma.hospital.update({ where: { id }, data: data as never });

export const deleteHospital = (id: number) => prisma.hospital.delete({ where: { id } });
