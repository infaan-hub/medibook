/**
 * GET /media/[...path] — THE media delivery endpoint.
 *
 *   /media/125                        → MediaFile id 125 (bytes from BYTEA)
 *   /media/profile_images/x.jpg       → legacy path lookup (old bookmarks)
 *
 * Design decisions:
 *  - Phase 16 caching: ids are immutable (a replaced image is a NEW id), so
 *    id responses are cached for a year; legacy paths revalidate hourly.
 *  - Phase 18/429: image delivery uses its OWN generous throttle bucket
 *    ("media") instead of the 60/min API anon bucket — <img> requests never
 *    carry auth headers, so sharing the API bucket made avatar-heavy pages
 *    429 into broken images. Rate limiting still exists, sized for assets.
 *  - Phase 19 privacy: see lib/media/access.ts (profile/article = public,
 *    health-record files = doctor/patient/admin only).
 *  - Phase 15: raw BYTEA bytes, no base64. Phase 18/500: bad ids are 404s.
 */
import { handler, notFound, forbidden } from "@/lib/route";
import { prisma } from "@/lib/db";
import { contentTypeForPath } from "@/lib/media/uploadImage";
import { assertMediaReadable } from "@/lib/media/access";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const REVALIDATE_CACHE = "public, max-age=3600, must-revalidate";

function bytesResponse(data: Buffer, contentType: string, cache: string): Response {
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": cache },
  });
}

export const GET = handler(
  async (ctx) => {
    const raw = ctx.params.path;
    const parts = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
    const segments = parts.split("/").filter(Boolean);
    if (segments.length === 0) throw notFound();

    // 1) Canonical form: /media/{id} — validate id, authorize, stream bytes.
    if (segments.length === 1 && /^\d+$/.test(segments[0])) {
      const id = Number(segments[0]);
      if (!Number.isInteger(id) || id <= 0) throw notFound();
      const row = await prisma.mediaFile.findUnique({ where: { id } });
      if (!row) throw notFound();
      await assertMediaReadable(ctx.user, id);
      return bytesResponse(
        Buffer.from(row.data),
        row.contentType || "application/octet-stream",
        IMMUTABLE_CACHE
      );
    }

    // 2) Legacy path form (pre-id links). Path lookups are exact-match Prisma
    //    keys (no SQL injection); dot segments are still rejected. The old
    //    local-disk fallback is gone — Neon is the single source of truth.
    for (const segment of segments) {
      if (segment === ".." || segment === "." || segment.includes("\0")) throw forbidden();
    }
    const relative = segments.join("/");
    const row = await prisma.mediaFile.findUnique({ where: { path: relative } });
    if (!row) throw notFound();
    return bytesResponse(
      Buffer.from(row.data),
      row.contentType || contentTypeForPath(relative),
      REVALIDATE_CACHE
    );
  },
  { throttle: "media" }
);
