/**
 * Media pipeline tests — magic-byte sniffing, size/type validation, safe
 * storage names, legacy content-type fallback (Phases 3–7, 18).
 * Pure functions only: no database, no server.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import {
  MAX_IMAGE_SIZE,
  MAX_FILE_SIZE,
  sniffMime,
  contentTypeForPath,
  generateStorageName,
  validate,
} from "@/lib/media/uploadImage";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  Buffer.alloc(32, 1),
]);
const GIF = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(16, 2)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.alloc(4, 0),
  Buffer.from("WEBPVP8 ", "latin1"),
  Buffer.alloc(8, 0),
]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n", "latin1");
const TEXT = Buffer.from("<html>not an image</html>");

function caught(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected an ApiError to be thrown");
}

describe("sniffMime", () => {
  it("identifies real formats from bytes, ignoring file.type", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(GIF)).toBe("image/gif");
    expect(sniffMime(WEBP)).toBe("image/webp");
    expect(sniffMime(PDF)).toBe("application/pdf");
  });

  it("returns null for content it cannot identify", () => {
    expect(sniffMime(TEXT)).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });
});

describe("validate — image uploads", () => {
  it("accepts real image bytes and derives type from magic, not filename", () => {
    const payload = validate(PNG, "image", 42, "avatar.png");
    expect(payload.contentType).toBe("image/png");
    expect(payload.filename).toMatch(/^42-[0-9a-f]{16}\.png$/);
  });

  it("rejects an empty file with 400", () => {
    const error = caught(() => validate(Buffer.alloc(0), "image", 1, "x.png"));
    expect(error.status).toBe(400);
    expect(error.errors.non_field_errors?.[0]).toMatch(/empty/i);
  });

  it("rejects oversized images with 413", () => {
    const error = caught(() =>
      validate(Buffer.alloc(MAX_IMAGE_SIZE + 1, 1), "image", 1, "big.png")
    );
    expect(error.status).toBe(413);
    expect(error.errors.non_field_errors?.[0]).toMatch(/too large/i);
  });

  it("rejects non-image content with 415 even when it claims image/jpeg", () => {
    const error = caught(() => validate(TEXT, "image", 1, "fake.jpg"));
    expect(error.status).toBe(415);
  });

  it("rejects PDFs for image uploads (415), not a generic 500", () => {
    const error = caught(() => validate(PDF, "image", 1, "doc.pdf"));
    expect(error.status).toBe(415);
  });

  it("rejects SVG/script payloads — SVG is deliberately not whitelisted", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    const error = caught(() => validate(svg, "image", 1, "evil.svg"));
    expect(error.status).toBe(415);
  });
});

describe("validate — health-record documents", () => {
  it("accepts real PDFs under the document cap", () => {
    const payload = validate(PDF, "file", 9, "lab results.pdf");
    expect(payload.contentType).toBe("application/pdf");
    expect(payload.filename).toMatch(/^9-[0-9a-f]{16}\.pdf$/);
  });

  it("rejects a .pdf whose bytes are not a PDF with 400", () => {
    const error = caught(() => validate(TEXT, "file", 1, "evil.pdf"));
    expect(error.status).toBe(400);
    expect(error.errors.non_field_errors?.[0]).toMatch(/not a valid PDF/i);
  });

  it("stores unidentified documents as octet-stream (never HTML)", () => {
    const payload = validate(TEXT, "file", 1, "scan.docx");
    expect(payload.contentType).toBe("application/octet-stream");
  });

  it("enforces the larger document cap", () => {
    const oversized = Buffer.concat([PDF, Buffer.alloc(MAX_FILE_SIZE, 0)]);
    const error = caught(() => validate(oversized, "file", 1, "huge.pdf"));
    expect(error.status).toBe(413);
  });
});

describe("generateStorageName", () => {
  it("prefixes the owner id and a random hex suffix", () => {
    expect(generateStorageName(7, "image/png")).toMatch(/^7-[0-9a-f]{16}\.png$/);
    expect(generateStorageName(null, "image/jpeg")).toMatch(/^anon-[0-9a-f]{16}\.jpg$/);
    expect(generateStorageName(0, "image/webp")).toMatch(/^anon-/);
  });

  it("never leaks the user's original filename into storage", () => {
    const name = generateStorageName(5, "image/png", "../../etc/passwd.png");
    expect(name).toMatch(/^5-[0-9a-f]{16}\.png$/);
    expect(name).not.toContain("..");
    expect(name).not.toContain("/");
  });

  it("produces unique names on every call", () => {
    const names = new Set(Array.from({ length: 50 }, () => generateStorageName(1, "image/png")));
    expect(names.size).toBe(50);
  });
});

describe("contentTypeForPath — legacy path links", () => {
  it("maps known extensions and defaults safely", () => {
    expect(contentTypeForPath("profile_images/a.png")).toBe("image/png");
    expect(contentTypeForPath("articles/COVER.JPG")).toBe("image/jpeg");
    expect(contentTypeForPath("health_records/scan.PDF")).toBe("application/pdf");
    expect(contentTypeForPath("weird/file.xyz")).toBe("application/octet-stream");
    expect(contentTypeForPath("no-extension")).toBe("application/octet-stream");
  });
});
