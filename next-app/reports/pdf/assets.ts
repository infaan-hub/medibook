/**
 * Report asset loading (fonts + the official MediBook logo).
 *
 * Everything is cached in-process: a report request must never re-read the
 * same bytes from disk. Paths are resolved against the project root so the
 * same code works under `node server.js` and in a traced standalone build.
 */
import fs from "node:fs";
import path from "node:path";
import type PDFKit from "pdfkit";
import { fontFamily } from "../design/tokens";

const FONT_FILES: Record<keyof typeof fontFamily, string> = {
  regular: "Inter_400Regular.ttf",
  medium: "Inter_500Medium.ttf",
  semibold: "Inter_600SemiBold.ttf",
  bold: "Inter_700Bold.ttf",
};

/** Candidate roots, most specific first. */
function candidateRoots(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "reports", "assets"),
    path.join(cwd, "next-app", "reports", "assets"),
    path.join(__dirname, "..", "assets"),
  ];
}

function resolveAsset(relative: string): string | null {
  for (const root of candidateRoots()) {
    const candidate = path.join(root, relative);
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const cache = new Map<string, Buffer | null>();

/** Read (and memoize) an asset; returns null when the file is unavailable. */
function readAsset(relative: string): Buffer | null {
  if (cache.has(relative)) return cache.get(relative) ?? null;
  const resolved = resolveAsset(relative);
  let bytes: Buffer | null = null;
  if (resolved) {
    try {
      bytes = fs.readFileSync(resolved);
    } catch {
      bytes = null;
    }
  }
  cache.set(relative, bytes);
  return bytes;
}

/** True when the real Inter faces were found (drives an honest footer note). */
let embeddedFontsAvailable: boolean | null = null;

export function reportFontsAvailable(): boolean {
  if (embeddedFontsAvailable === null) {
    embeddedFontsAvailable = readAsset(path.join("fonts", FONT_FILES.regular)) !== null;
  }
  return embeddedFontsAvailable;
}

/**
 * Register the MediBook type stack on a document.
 *
 * The application declares `--font-sans: "Inter", "Segoe UI", system-ui, …`,
 * so the PDF embeds Inter. If the faces are unavailable at runtime the
 * document still renders: each slot falls back to a built-in font rather than
 * failing the whole report.
 */
export function registerReportFonts(doc: PDFKit.PDFDocument): void {
  for (const weight of Object.keys(FONT_FILES) as (keyof typeof fontFamily)[]) {
    const bytes = readAsset(path.join("fonts", FONT_FILES[weight]));
    const fallback = weight === "bold" || weight === "semibold" ? "Helvetica-Bold" : "Helvetica";
    // registerFont accepts raw bytes (a Buffer) or a built-in face name.
    doc.registerFont(fontFamily[weight], bytes ?? fallback);
  }
}

/**
 * The official MediBook logo already used by the app shell
 * (`/images/logo.jpeg`, rendered at 28–32px in the header/sidebar).
 * Served from the app's own public directory — never a replacement asset.
 */
export function loadLogo(): Buffer | null {
  return readAsset(path.join("..", "..", "public", "images", "logo.jpeg"));
}

/**
 * Natural pixel size of the logo (JPEG SOF marker). Cached after first read so
 * the report can crop the icon tile without ever distorting it.
 */
let logoSize: { width: number; height: number } | null | undefined;

export function logoDimensions(): { width: number; height: number } | null {
  if (logoSize !== undefined) return logoSize;
  logoSize = null;
  const bytes = loadLogo();
  if (!bytes) return logoSize;
  try {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        logoSize = { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
        break;
      }
      const length = bytes.readUInt16BE(offset + 2);
      if (length <= 0) break;
      offset += 2 + length;
    }
  } catch {
    logoSize = null;
  }
  return logoSize;
}

