import { apiGet } from "./client";
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
  created_at: string;
  updated_at?: string;
}

export function listArticles(category?: string): Promise<Envelope<Paginated<Article>>> {
  const params = category ? `?category=${category}` : "";
  return apiGet<Paginated<Article>>(`/blog/articles/${params}`);
}

export function getArticle(slug: string): Promise<Envelope<Article>> {
  return apiGet<Article>(`/blog/articles/${slug}/`);
}
