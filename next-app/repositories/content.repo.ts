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
    skip,
    take,
  });

export const findPublishedArticle = (slug: string) =>
  prisma.article.findFirst({ where: { slug, published: true }, include: { author: true } });

export const countAllArticles = () => prisma.article.count();

export const listAllArticles = (skip: number, take: number) =>
  prisma.article.findMany({
    orderBy: [{ published_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
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
