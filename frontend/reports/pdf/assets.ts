/**
 * Report asset loading (fonts from disk + the embedded MediBook logo).
 *
 * Fonts are resolved against the project root so the same code works under
 * `node server.js` and in a traced standalone build, and every read is cached
 * in-process: a report request must never re-read the same bytes from disk.
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
    // Bundled/standalone fallback: assets sit next to this module.
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
 * The official MediBook logo mark, embedded in the bundle as a 128×128 PNG
 * (square crop of `public/images/logo.jpeg`, the same asset the app shell
 * renders). Embedding keeps the real mark in production too: the standalone
 * serverless runtime has no `public/` directory on disk, so a filesystem read
 * would silently fall back to a flat teal tile.
 */
import { LOGO_MARK_HEIGHT, LOGO_MARK_PNG_BASE64, LOGO_MARK_WIDTH } from "../assets/logo-mark";

let logoBytes: Buffer | null = null;

export function loadLogo(): Buffer | null {
  if (!logoBytes) logoBytes = Buffer.from(LOGO_MARK_PNG_BASE64, "base64");
  return logoBytes;
}

/** Natural pixel size of the embedded mark (square). */
export function logoDimensions(): { width: number; height: number } | null {
  return { width: LOGO_MARK_WIDTH, height: LOGO_MARK_HEIGHT };
}

