/**
 * Pagination — port of common/pagination.py (StandardResultsSetPagination):
 *
 *   default page size API_PAGE_SIZE (20), client-controlled page_size capped
 *   at 100, page-number navigation, Django-style absolute next/previous links,
 *   and a 404 "Invalid page." for out-of-range / non-numeric pages.
 *
 * The envelope wrapper:
 *   { count, page, page_size, total_pages, next, previous, results }
 */
import { invalidPage } from "./errors";
import { successResponse } from "./responses";

export const MAX_PAGE_SIZE = 100;
const LAST_STRINGS = new Set(["last"]);

function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const forwarded = req.headers.get("x-forwarded-proto");
  const proto = forwarded ?? (url.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}

function buildPageUrl(req: Request, page: number, pageSizeParam: string | null): string {
  const url = new URL(req.url);
  const params = new URLSearchParams(url.search);
  params.set("page", String(page));
  if (pageSizeParam !== null) params.set("page_size", pageSizeParam);
  return `${originOf(req)}${url.pathname}?${params.toString()}`;
}

export interface PaginationParams {
  /** NaN signals a non-numeric page → Django raises "Invalid page." (404). */
  page: number;
  /** 0 disables pagination entirely (Django: page_size=0 → bare array). */
  pageSize: number;
  rawPage: string | null;
  pageSizeParam: string | null;
}

export function paginationParams(req: Request): PaginationParams {
  const url = new URL(req.url);
  const rawPage = url.searchParams.get("page");
  const pageSizeParam = url.searchParams.get("page_size");
  const defaultSize = Number(process.env.API_PAGE_SIZE ?? 20);

  let page = 1;
  if (rawPage !== null && !LAST_STRINGS.has(rawPage)) {
    const parsed = Number(rawPage);
    page = Number.isInteger(parsed) ? parsed : NaN;
  }

  let pageSize = defaultSize;
  if (pageSizeParam !== null) {
    const parsed = Number(pageSizeParam);
    if (Number.isInteger(parsed) && parsed >= 0) {
      pageSize = Math.min(parsed, MAX_PAGE_SIZE); // max_page_size = 100
    }
  }
  return { page, pageSize, rawPage, pageSizeParam };
}

interface PaginateArgs<T> {
  count: (where: Record<string, unknown>) => Promise<number>;
  fetch: (opts: { skip: number; take: number }) => Promise<T[]>;
  fetchAll?: () => Promise<T[]>;
  where: Record<string, unknown>;
  req: Request;
}

/** Runs the Django paginator and produces the paginated success envelope. */
export async function paginate<T>({
  req,
  where,
  count,
  fetch,
  fetchAll,
}: PaginateArgs<T>): Promise<Response> {
  const { page, pageSize, rawPage, pageSizeParam } = paginationParams(req);

  // page_size=0 → paginator disabled → bare array inside data (Django parity).
  if (pageSize === 0) {
    const results = fetchAll ? await fetchAll() : await fetch({ skip: 0, take: 0 });
    return successResponse(results);
  }

  const total = await count(where);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resolvedPage =
    rawPage !== null && LAST_STRINGS.has(rawPage) ? totalPages : page;
  if (!Number.isFinite(resolvedPage) || resolvedPage < 1 || resolvedPage > totalPages) {
    throw invalidPage();
  }

  const results = await fetch({
    skip: (resolvedPage - 1) * pageSize,
    take: pageSize,
  });

  return successResponse({
    count: total,
    page: resolvedPage,
    page_size: pageSize,
    total_pages: totalPages,
    next: resolvedPage < totalPages ? buildPageUrl(req, resolvedPage + 1, pageSizeParam) : null,
    previous: resolvedPage > 1 ? buildPageUrl(req, resolvedPage - 1, pageSizeParam) : null,
    results,
  });
}
