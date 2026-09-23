/**
 * Content service — blog articles (public + admin CRUD) and the
 * specialty/hospital catalogs (port of blog/views.py, specialties/views.py,
 * hospitals/views.py).
 */
import { ValidationError, notFound } from "@/lib/errors";
import { articleDetailDto, articleListDto, hospitalDto, specialtyDto } from "@/lib/serializers";
import { hospitalWriteSchema, specialtyWriteSchema } from "@/validators/more";
import { articleSchema } from "@/validators/misc";
import { parse } from "@/validators/base";
import * as content from "@/repositories/content.repo";
import type { AuthUser } from "@/lib/auth";

/* --------------------------------- Articles -------------------------------- */

/** Django's django.utils.text.slugify (ASCII-focused equivalent). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 220);
}

async function uniqueSlug(desired: string, excludeId?: number): Promise<string> {
  const base = slugify(desired) || "article";
  let slug = base;
  let counter = 1;
  // Mirrors Article.save(): base, base-1, base-2 … until free.
  for (;;) {
    const existing = await content.findArticleBySlug(slug);
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

/** GET /api/blog/articles/ — published articles (public, paginated). */
export const publicArticleCount = (category?: string) => content.countPublishedArticles(category);
export const publicArticlePage = (category: string | undefined, skip: number, take: number) =>
  content.listPublishedArticles(category, skip, take);

/** GET /api/blog/articles/{slug}/ — single published article. */
export async function publicArticleDetail(req: Request, slug: string) {
  const article = await content.findPublishedArticle(slug);
  if (!article) throw notFound("Article not found."); // custom Django message
  return articleDetailDto(article, req);
}

/** Admin create (POST /api/admin/blog/articles/). */
export async function adminCreateArticle(req: Request, user: AuthUser, body: unknown) {
  const input = parse(articleSchema, body);
  const slug = await uniqueSlug(input.slug ?? input.title);
  const published = input.published ?? false;
  const article = await content.createArticle({
    title: input.title,
    slug,
    excerpt: input.excerpt ?? "",
    content: input.content,
    image: input.image ?? null,
    category: input.category ?? "general",
    published,
    author_id: user.id,
    published_at: published ? new Date() : null, // perform_create hook
  });
  return articleDetailDto(article, req);
}

/** Admin partial update (PATCH /api/admin/blog/articles/{id}/). */
export async function adminPatchArticle(req: Request, id: number, body: unknown) {
  const existing = await content.findArticle(id);
  if (!existing) throw notFound();
  const input = parse(articleSchema.partial(), body);
  const data: Record<string, unknown> = {};
  for (const key of ["title", "excerpt", "content", "image", "category"] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (input.slug !== undefined && input.slug !== existing.slug) {
    data.slug = await uniqueSlug(input.slug, id);
  }
  if (input.published !== undefined) {
    data.published = input.published;
    if (input.published && !existing.published_at) data.published_at = new Date();
  }
  const updated = await content.updateArticle(id, data);
  return articleDetailDto(updated, req);
}

export const adminRetrieveArticle = (req: Request, id: number) =>
  content.findArticle(id).then((article) => (article ? articleDetailDto(article, req) : null));

export const adminListArticles = (skip: number, take: number) => content.listAllArticles(skip, take);
export const adminArticleCount = () => content.countAllArticles();

export async function adminDestroyArticle(id: number): Promise<void> {
  if (!(await content.findArticle(id))) throw notFound();
  await content.deleteArticle(id);
}

export { articleListDto };

/* --------------------------- Specialties / hospitals ----------------------- */

export const listSpecialtyPage = (skip: number, take: number) => content.listSpecialties(skip, take);
export const countSpecialtyRows = () => content.countSpecialties();

export async function retrieveSpecialty(id: number) {
  const row = await content.findSpecialty(id);
  if (!row) throw notFound();
  return specialtyDto(row);
}

export async function createSpecialty(body: unknown) {
  const input = parse(specialtyWriteSchema, body);
  if (await content.findSpecialtyByNameExact(input.name)) {
    throw new ValidationError({ name: ["specialty specialty with this name already exists."] });
  }
  const row = await content.createSpecialty({
    name: input.name,
    patient_friendly_name: input.patient_friendly_name ?? "",
    description: input.description ?? "",
    what_to_expect: input.what_to_expect ?? "",
    icon_url: input.icon_url ?? "",
  });
  return specialtyDto(row);
}

export async function updateSpecialty(id: number, body: unknown, full: boolean) {
  const existing = await content.findSpecialty(id);
  if (!existing) throw notFound();
  const schema = full ? specialtyWriteSchema : specialtyWriteSchema.partial();
  const input = parse(schema, body);
  const row = await content.updateSpecialty(id, { ...(input as Record<string, unknown>) });
  return specialtyDto(row);
}

export async function destroySpecialty(id: number): Promise<void> {
  if (!(await content.findSpecialty(id))) throw notFound();
  await content.deleteSpecialty(id);
}

export const listHospitalPage = (city: string | undefined, skip: number, take: number) =>
  content.listHospitals(city, skip, take);
export const countHospitalRows = (city?: string) => content.countHospitals(city);

export async function retrieveHospital(id: number) {
  const row = await content.findHospital(id);
  if (!row) throw notFound();
  return hospitalDto(row);
}

export async function createHospital(body: unknown) {
  const input = parse(hospitalWriteSchema, body);
  const row = await content.createHospital({
    name: input.name,
    city: input.city,
    address: input.address ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    location_details: input.location_details ?? {},
  });
  return hospitalDto(row);
}

export async function updateHospital(id: number, body: unknown, full: boolean) {
  const existing = await content.findHospital(id);
  if (!existing) throw notFound();
  const schema = full ? hospitalWriteSchema : hospitalWriteSchema.partial();
  const input = parse(schema, body);
  const row = await content.updateHospital(id, { ...(input as Record<string, unknown>) });
  return hospitalDto(row);
}

export async function destroyHospital(id: number): Promise<void> {
  if (!(await content.findHospital(id))) throw notFound();
  await content.deleteHospital(id);
}

