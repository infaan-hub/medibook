/**
 * Centralized upload service — THE single path for every image/file that
 * enters MediBook (admin, doctor and patient profile images, health-record
 * files, blog article images, OAuth avatars). There is no per-role storage
 * logic anywhere else.
 *
 * Pipeline (never trusts filename or `file.type`):
 *   File → read bytes → size check → magic-byte sniff → real MIME →
 *   extension → server-generated safe filename → Prisma Bytes (PostgreSQL
 *   BYTEA) → MediaFile row → id (served as GET /media/{id}).
 *
 * Storage is Neon PostgreSQL only: no cloud buckets, no permanent local
 * disk, no base64. Errors are precise: 400 empty/invalid, 413 too large,
 * 415 unsupported image format — never a generic 500 for validation.
 */
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { MediaFile, Prisma } from "@prisma/client";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/db";

/* ------------------------------ Limits (Phase 7) ------------------------------ */

const DEFAULT_MAX_IMAGE_SIZE = 5 * 1024 * 1024; // profile/article images (UI enforces 5 MB)
const DEFAULT_MAX_FILE_SIZE = 15 * 1024 * 1024; // health-record documents (PDF, scans, …)

function limitFrom(env: string | undefined, fallback: number): number {
  const parsed = Number(env);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Centralized, env-overridable image size cap — never hard-coded elsewhere. */
export const MAX_IMAGE_SIZE = limitFrom(process.env.MAX_IMAGE_SIZE, DEFAULT_MAX_IMAGE_SIZE);
/** Centralized, env-overridable document size cap for health records. */
export const MAX_FILE_SIZE = limitFrom(process.env.MAX_FILE_SIZE, DEFAULT_MAX_FILE_SIZE);

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

/* ------------------------------ Format detection (Phase 3) ------------------------------ */

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "application/pdf": ".pdf",
};

const TYPE_BY_EXT: Record<string, string> = {
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

/** Whitelist of image formats the system accepts (SVG deliberately excluded). */
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
]);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Magic-byte sniff — the actual bytes are authoritative, never file.type. */
export function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_MAGIC)) return "image/png";
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString("latin1");
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString("latin1") === "ftyp" &&
    ["avif", "avis"].includes(bytes.subarray(8, 12).toString("latin1"))
  ) {
    return "image/avif";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  return null;
}

/** Extension→MIME for legacy path-based links still in old bookmarks. */
export function contentTypeForPath(relative: string): string {
  return TYPE_BY_EXT[path.extname(relative).toLowerCase()] ?? "application/octet-stream";
}

/* ------------------------------ Safe names (Phase 5) ------------------------------ */

function safeExt(name?: string): string {
  const match = /\.[A-Za-z0-9]{1,10}$/.exec(name ?? "");
  return match ? match[0].toLowerCase() : ".bin";
}

/**
 * Server-generated storage name: `{userId}-{randomHex}{ext}` (e.g.
 * "123-a82f91c4e5f60718.jpg"). The user's original filename never becomes
 * a storage path and can never overflow a column — `anon` is used when no
 * owner is known.
 */
export function generateStorageName(
  ownerId: number | null | undefined,
  contentType: string,
  originalName?: string
): string {
  const owner =
    typeof ownerId === "number" && Number.isInteger(ownerId) && ownerId > 0
      ? String(ownerId)
      : "anon";
  const ext = EXT_BY_TYPE[contentType] ?? safeExt(originalName);
  return `${owner}-${randomBytes(8).toString("hex")}${ext}`;
}

/* ------------------------------ Validation (Phases 4/7/18) ------------------------------ */

export type UploadKind = "image" | "file";

interface ValidatedPayload {
  bytes: Buffer;
  contentType: string;
  filename: string;
}

/** Pure validation stage — exported for tests/media.test.ts. */
export function validate(
  bytes: Buffer,
  kind: UploadKind,
  ownerId: number | null | undefined,
  originalName?: string
): ValidatedPayload {
  if (bytes.length === 0) {
    throw new ApiError(400, "The request could not be processed.", {
      non_field_errors: ["The submitted file is empty."],
    });
  }

  const limit = kind === "image" ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
  if (bytes.length > limit) {
    throw new ApiError(413, "The request could not be processed.", {
      non_field_errors: [`File is too large (max ${mb(limit)} MB).`],
    });
  }

  const sniffed = sniffMime(bytes);

  if (kind === "image") {
    // Bytes-first: a JPEG with an empty file.type is accepted; a text file
    // claiming image/jpeg is rejected with 415, not stored.
    if (!sniffed || !IMAGE_TYPES.has(sniffed)) {
      throw new ApiError(415, "The submitted data type is not supported.", {
        non_field_errors: ["Please upload a valid image file."],
      });
    }
    return {
      bytes,
      contentType: sniffed,
      filename: generateStorageName(ownerId, sniffed, originalName),
    };
  }

  // Document upload (health records): a file claiming to be a PDF must REALLY
  // be a PDF — including when its bytes are unidentifiable (null sniff).
  // Anything else we cannot identify is stored as application/octet-stream so
  // browsers never execute it as HTML/JS on our origin (stored-XSS guard).
  const declared = (originalName ?? "").toLowerCase();
  if (declared.endsWith(".pdf") && sniffed !== "application/pdf") {
    throw new ApiError(400, "The request could not be processed.", {
      non_field_errors: ["The uploaded file is not a valid PDF."],
    });
  }
  const contentType = sniffed ?? "application/octet-stream";
  return { bytes, contentType, filename: generateStorageName(ownerId, contentType, originalName) };
}

/* ------------------------------ Store (Phase 6) ------------------------------ */

async function insertMedia(
  db: Prisma.TransactionClient | typeof prisma,
  subdir: string,
  payload: ValidatedPayload,
  ownerId: number | null | undefined,
  originalName?: string
): Promise<MediaFile> {
  const storageName = payload.filename;
  const relative = path.posix.join(subdir, storageName);
  return db.mediaFile.create({
    data: {
      path: relative,
      filename: (originalName ?? "").replace(/[^\w.\-]+/g, "_").slice(0, 200) || storageName,
      contentType: payload.contentType,
      data: new Uint8Array(payload.bytes),
      size: payload.bytes.length,
      owner_id: ownerId ?? null,
    },
  });
}

export interface UploadOptions {
  /** Namespace inside storage, e.g. "profile_images" / "health_records". */
  subdir: string;
  /** User the file belongs to (owner metadata + name prefix). */
  ownerId?: number | null;
  /** "image" (default) enforces the image whitelist; "file" allows documents. */
  kind?: UploadKind;
  /** Provide when the bytes did not come from a web File (e.g. downloads). */
  name?: string;
  /**
   * Insert inside an existing transaction (Phase 8): the caller's
   * create→update→delete-old flow then commits or rolls back as one unit.
   */
  tx?: Prisma.TransactionClient;
}

/**
 * One upload request → one validation pipeline → one MediaFile row.
 * Returns the created row; the public URL is `/media/{id}`.
 */
export async function uploadImage(file: File, options: UploadOptions): Promise<MediaFile> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const payload = validate(bytes, options.kind ?? "image", options.ownerId, file.name || options.name);
  const db = options.tx ?? prisma;
  return insertMedia(db, options.subdir, payload, options.ownerId, file.name || options.name);
}

/** Same pipeline for raw bytes (OAuth avatar downloads, server-side sources). */
export async function uploadImageBytes(
  bytes: Uint8Array | Buffer,
  options: UploadOptions
): Promise<MediaFile> {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const payload = validate(buf, options.kind ?? "image", options.ownerId, options.name);
  const db = options.tx ?? prisma;
  return insertMedia(db, options.subdir, payload, options.ownerId, options.name);
}

/* ------------------------------ Orphan cleanup (Phase 9) ------------------------------ */

/**
 * Deletes a MediaFile row (and its binary) only when NO reference column
 * still points at it — profile images, health-record files and article
 * images are all counted first. Safe to call inside a transaction; never
 * throws for an already-missing row.
 */
export async function deleteMediaIfUnreferenced(
  mediaId: number | null | undefined,
  tx?: Prisma.TransactionClient
): Promise<void> {
  if (!mediaId || !Number.isInteger(mediaId)) return;
  const db = tx ?? prisma;
  try {
    const [users, records, articles] = await Promise.all([
      db.user.count({ where: { profile_image_id: mediaId } }),
      db.healthRecord.count({ where: { file_id: mediaId } }),
      db.article.count({ where: { image_id: mediaId } }),
    ]);
    if (users + records + articles > 0) return;
    await db.mediaFile.delete({ where: { id: mediaId } });
  } catch {
    /* already gone — cleanup must never fail the surrounding request */
  }
}
