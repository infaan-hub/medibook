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

/**
 * Resolves an incoming article `image` value to a MediaFile id: accepts
 * "/media/{id}" (or a bare id) and verifies the row exists, so the API can
 * never persist a reference that 404s. Uploads themselves go through the
 * centralized uploadImage() service (multipart file field "image").
 */
async function resolveArticleImageId(value: string | null | undefined): Promise<number | null> {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const match = /^\/?media\/(\d+)\/?$/.exec(trimmed) ?? /^(\d+)$/.exec(trimmed);
  if (!match) {
    throw new ValidationError({
      image: ["Expected a media URL like '/media/125' — or upload the image file."],
    });
  }
  const id = Number(match[1]);
  const { prisma } = await import("@/lib/db");
  const exists = await prisma.mediaFile.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw new ValidationError({ image: ["Unknown media id — upload the image file first."] });
  }
  return id;
}

async function storeArticleImage(
  user: AuthUser,
  file: File | null | undefined
): Promise<number> {
  const { uploadImage } = await import("@/lib/media/uploadImage");
  const media = await uploadImage(file as File, {
    subdir: "articles",
    ownerId: user.id,
    kind: "image",
  });
  return media.id;
}

/** Admin create (POST /api/admin/blog/articles/) — JSON or multipart with `image`. */
export async function adminCreateArticle(
  req: Request,
  user: AuthUser,
  body: unknown,
  file?: File | null
) {
  const input = parse(articleSchema, body);
  const slug = await uniqueSlug(input.slug ?? input.title);
  const published = input.published ?? false;
  let imageId: number | null = null;
  if (file && file.size > 0) imageId = await storeArticleImage(user, file);
  else if (input.image !== undefined) imageId = await resolveArticleImageId(input.image);
  const article = await content.createArticle({
    title: input.title,
    slug,
    excerpt: input.excerpt ?? "",
    content: input.content,
    image_id: imageId,
    category: input.category ?? "general",
    published,
    author_id: user.id,
    published_at: published ? new Date() : null, // perform_create hook
  });
  return articleDetailDto(article, req);
}

/** Admin partial update (PATCH /api/admin/blog/articles/{id}/). */
export async function adminPatchArticle(
  req: Request,
  user: AuthUser,
  id: number,
  body: unknown,
  file?: File | null
) {
  const existing = await content.findArticle(id);
  if (!existing) throw notFound();
  const input = parse(articleSchema.partial(), body);
  const data: Record<string, unknown> = {};
  for (const key of ["title", "excerpt", "content", "category"] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (file && file.size > 0) {
    data.image_id = await storeArticleImage(user, file);
  } else if (input.image !== undefined) {
    data.image_id = await resolveArticleImageId(input.image);
  }
  if (input.slug !== undefined && input.slug !== existing.slug) {
    data.slug = await uniqueSlug(input.slug, id);
  }
  if (input.published !== undefined) {
    data.published = input.published;
    if (input.published && !existing.published_at) data.published_at = new Date();
  }
  const previousImageId = existing.image_id;
  const updated = await content.updateArticle(id, data);
  // Image swapped or cleared → drop the old binary unless still referenced.
  if ("image_id" in data && previousImageId && previousImageId !== data.image_id) {
    const { deleteMediaIfUnreferenced } = await import("@/lib/media/uploadImage");
    await deleteMediaIfUnreferenced(previousImageId);
  }
  return articleDetailDto(updated, req);
}

export const adminRetrieveArticle = (req: Request, id: number) =>
  content.findArticle(id).then((article) => (article ? articleDetailDto(article, req) : null));

export const adminListArticles = (skip: number, take: number) => content.listAllArticles(skip, take);
export const adminArticleCount = () => content.countAllArticles();

export async function adminDestroyArticle(id: number): Promise<void> {
  const existing = await content.findArticle(id);
  if (!existing) throw notFound();
  // Article + its image go away together; the binary is only dropped when
  // nothing else references it.
  const { deleteMediaIfUnreferenced } = await import("@/lib/media/uploadImage");
  const { prisma } = await import("@/lib/db");
  await prisma.$transaction(async (tx) => {
    await content.deleteArticle(id, tx);
    await deleteMediaIfUnreferenced(existing.image_id, tx);
  });
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

