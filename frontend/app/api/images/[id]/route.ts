/**
 * GET /api/images/[id] — id-based media delivery (same store and rules as
 * GET /media/{id}: raw BYTEA bytes, immutable cache, medical-file gate from
 * lib/media/access.ts, dedicated "media" throttle bucket).
 */
import { handler, notFound } from "@/lib/route";
import { prisma } from "@/lib/db";
import { assertMediaReadable } from "@/lib/media/access";

export const GET = handler(
  async (ctx) => {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound();
    const row = await prisma.mediaFile.findUnique({ where: { id } });
    if (!row) throw notFound();
    await assertMediaReadable(ctx.user, id);
    return new Response(new Uint8Array(Buffer.from(row.data)), {
      status: 200,
      headers: {
        "Content-Type": row.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  },
  { throttle: "media" }
);
