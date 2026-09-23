/**
 * File uploads — replaces Django's FileSystemStorage under MEDIA_ROOT.
 * Stored paths are relative to the media root (e.g. "profile_images/x.png"),
 * matching FileField values from the old database, and are served at
 * /media/<path> by app/media/[...path]/route.ts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { ApiError, badRequest } from "./errors";

/** Absolute media root (MEDIA_ROOT, default: next-app/uploads). */
export function mediaRoot(): string {
  const configured = process.env.MEDIA_ROOT?.trim();
  const root = configured && configured.length > 0 ? configured : "uploads";
  return path.isAbsolute(root) ? root : path.join(process.cwd(), root);
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "application/pdf": ".pdf",
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp"]);

function sanitizeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
}

/**
 * Saves an uploaded file under `<subdir>/` with a collision-resistant name
 * (Django appended a random suffix on clashes; we always randomize).
 * Returns the relative path stored in the DB.
 */
export async function saveUpload(
  file: File,
  subdir: string,
  options: { imagesOnly?: boolean } = {}
): Promise<string> {
  const type = (file.type || "").toLowerCase();
  if (options.imagesOnly && !IMAGE_TYPES.has(type)) {
    throw new ApiError(400, "The request could not be processed.", {
      non_field_errors: ["Please upload a valid image file."],
    });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    throw badRequest(undefined, { non_field_errors: ["The submitted file is empty."] });
  }

  const original = sanitizeName(file.name || "upload");
  const dot = original.lastIndexOf(".");
  const base = dot > 0 ? original.slice(0, dot) : original;
  const ext =
    (dot > 0 ? original.slice(dot).toLowerCase() : "") ||
    EXT_BY_TYPE[type] ||
    ".bin";
  const filename = `${base}-${randomBytes(6).toString("hex")}${ext}`;

  const relative = path.posix.join(subdir, filename);
  const absolute = path.join(mediaRoot(), ...relative.split("/"));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return relative;
}
