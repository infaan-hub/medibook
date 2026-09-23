/** GET /media/[...path] — serve uploaded files from MEDIA_ROOT (Django /media/). */
import { handler, notFound, forbidden } from "@/lib/route";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { mediaRoot } from "@/lib/upload";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
};

export const GET = handler(async (ctx) => {
  const raw = ctx.params.path;
  const parts = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
  const segments = parts.split("/").filter(Boolean);
  if (segments.length === 0) throw notFound();
  for (const segment of segments) {
    if (segment === ".." || segment === "." || segment.includes("\0")) throw forbidden();
  }
  const absolute = path.join(mediaRoot(), ...segments);
  const root = mediaRoot();
  if (!absolute.startsWith(root)) throw forbidden();
  try {
    const bytes = await readFile(absolute);
    const ext = path.extname(absolute).toLowerCase();
    const type = CONTENT_TYPES[ext] ?? "application/octet-stream";
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    throw notFound();
  }
});
