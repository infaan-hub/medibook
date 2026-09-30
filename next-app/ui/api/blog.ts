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

export function getArticle(slug: string): Promise<Envelope<Article>> {
  return apiGet<Article>(`/blog/articles/${slug}/`);
}
