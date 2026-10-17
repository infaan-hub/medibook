/**
 * Likes on health tips (blog articles) — the contract the UI depends on:
 *   1. a like is one row per (article, user) — double-taps never inflate the
 *      count, the toggle flips by insert/delete;
 *   2. the list/detail serializers carry `likes_count` and (for the viewer)
 *      `liked_by_me`, so the heart answers instantly with the right number;
 *   3. unauthenticated, unliked, etc. all route through the same service,
 *      never by hand-crafted request against the UI.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import {
  articleListDto,
  articleLikeState,
  toggleArticleLike,
} from "@/services/content.service";

const repo = vi.hoisted(() => ({
  findPublishedArticle: vi.fn(),
  findArticleLike: vi.fn(),
  createArticleLike: vi.fn(),
  deleteArticleLike: vi.fn(),
  countArticleLikes: vi.fn(),
  countLikesByArticleIds: vi.fn(),
  likedArticleIds: vi.fn(),
}));

vi.mock("@/repositories/content.repo", () => repo);

// Never touched — stubbed so no Prisma client is constructed in a unit test.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const ADMIN = { id: 1, role: "doctor", is_superuser: false } as AuthUser;
const PATIENT = { id: 7, role: "patient", is_superuser: false } as AuthUser;

const ARTICLE = {
  id: 42,
  title: "Managing hypertension at home",
  slug: "managing-hypertension-at-home",
  excerpt: "Some tips...",
  content: "full text",
  category: "health_tips",
  image_id: null,
  author_id: null,
  published: true,
  published_at: new Date("2026-09-01T09:00:00Z"),
  created_at: new Date("2026-09-01T09:00:00Z"),
  updated_at: new Date("2026-09-01T09:00:00Z"),
  author: null,
};

const likeRow = (articleId: number, userId: number) => ({
  article_id: articleId,
  user_id: userId,
  created_at: new Date().toISOString(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toggleArticleLike", () => {
  it("creates a like for a user that has none and reports the count", async () => {
    repo.findPublishedArticle.mockResolvedValue(ARTICLE);
    repo.findArticleLike.mockResolvedValue(null);
    repo.createArticleLike.mockResolvedValue(likeRow(42, 1));
    repo.countArticleLikes.mockResolvedValue(1);

    const result = await toggleArticleLike(ADMIN, ARTICLE.slug);

    expect(result).toEqual({ liked: true, likes_count: 1 });
    expect(repo.findPublishedArticle).toHaveBeenCalledOnce();
    expect(repo.createArticleLike).toHaveBeenCalledWith(42, 1);
  });

  it("deletes a like that already exists and reports the refreshed count", async () => {
    repo.findPublishedArticle.mockResolvedValue(ARTICLE);
    repo.findArticleLike.mockResolvedValue(likeRow(42, 1));
    repo.deleteArticleLike.mockResolvedValue({ count: 1 });
    repo.countArticleLikes.mockResolvedValue(0);

    const result = await toggleArticleLike(ADMIN, ARTICLE.slug);

    expect(result).toEqual({ liked: false, likes_count: 0 });
    expect(repo.deleteArticleLike).toHaveBeenCalledWith(42, 1);
  });

  it("404s for a slug that has no published tip", async () => {
    repo.findPublishedArticle.mockResolvedValue(null);
    await expect(toggleArticleLike(ADMIN, "nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("articleLikeState", () => {
  it("maps per-article counts and the viewer's own likes (one query each)", async () => {
    repo.countLikesByArticleIds.mockResolvedValue(new Map([[42, 3], [43, 1]]));
    repo.likedArticleIds.mockResolvedValue(new Set([42]));

    const state = await articleLikeState(PATIENT.id, [42, 43]);

    expect(state.get(42)).toEqual({ count: 3, liked: true });
    expect(state.get(43)).toEqual({ count: 1, liked: false });
  });

  it("gives guests no liked flags", async () => {
    repo.countLikesByArticleIds.mockResolvedValue(new Map([[42, 2]]));
    repo.likedArticleIds.mockResolvedValue(new Set());

    const state = await articleLikeState(null, [42]);

    expect(state.get(42)).toEqual({ count: 2, liked: false });
  });
});

describe("articleListDto / articleDetailDto", () => {
  it("attaches likes_count and liked_by_me when provided", () => {
    const dto = articleListDto({ ...ARTICLE, author: null }, new Request("http://x/"), {
      count: 5,
      liked: true,
    });
    expect(dto.likes_count).toBe(5);
    expect(dto.liked_by_me).toBe(true);
  });

  it("defaults to zero likes and not-liked", () => {
    const dto = articleListDto(
      { ...ARTICLE, author: null },
      new Request("http://x/"),
      undefined
    );
    expect(dto.likes_count).toBe(0);
    expect(dto.liked_by_me).toBe(false);
  });
});
