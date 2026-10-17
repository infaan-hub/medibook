import { apiGet, http } from "./client";
import type { Envelope, Paginated } from "./types";

export interface Article {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  content?: string;
  image?: string;
  category: string;
  published?: boolean;
  published_at?: string;
  author?: number;
  author_name?: string;
  author_role?: string;
  /** Total likes on this tip. */
  likes_count?: number;
  /** True when the signed-in user has liked this tip. */
  liked_by_me?: boolean;
  created_at: string;
  updated_at?: string;
}

export function listArticles(category?: string): Promise<Envelope<Paginated<Article>>> {
  const params = category ? `?category=${category}` : "";
  return apiGet<Paginated<Article>>(`/blog/articles/${params}`);
}

/** GET /api/blog/articles/?mine=1 — the signed-in doctor's own articles. */
export function listMyArticles(): Promise<Envelope<Paginated<Article>>> {
  return apiGet<Paginated<Article>>("/blog/articles/", { mine: 1 });
}

/**
 * POST /api/blog/articles/ — multipart (title/excerpt/content/category/image).
 * The shared client defaults to JSON, which would stringify FormData and drop
 * the File; multipart must be requested explicitly (same as uploadProfileImage).
 */
export function createArticle(form: FormData): Promise<Envelope<Article>> {
  return http
    .post<Envelope<Article>>("/blog/articles/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
}

/** PATCH /api/blog/articles/{slug}/ — author-owned edit (multipart, image optional). */
export function updateArticle(slug: string, form: FormData): Promise<Envelope<Article>> {
  return http
    .patch<Envelope<Article>>(`/blog/articles/${slug}/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
}

/** DELETE /api/blog/articles/{slug}/ — author-owned delete. */
export function deleteArticle(slug: string): Promise<void> {
  return http.delete(`/blog/articles/${slug}/`).then((r) => r.data).then(() => undefined);
}

export function getArticle(slug: string): Promise<Envelope<Article>> {
  return apiGet<Article>(`/blog/articles/${slug}/`);
}

/** What POST /api/blog/articles/{slug}/like/ answers with after the flip. */
export interface ArticleLikeResult {
  liked: boolean;
  likes_count: number;
}

/** POST /api/blog/articles/{slug}/like/ — toggle the caller's like. */
export function toggleArticleLike(slug: string): Promise<Envelope<ArticleLikeResult>> {
  return http
    .post<Envelope<ArticleLikeResult>>(`/blog/articles/${slug}/like/`)
    .then((r) => r.data);
}
