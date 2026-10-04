/**
 * Report page chrome — the branded header and footer stamped on every page.
 *
 * Mirrors the app shell header (surface background + hairline bottom border,
 * §22.6) with the MediBook teal as the brand accent, and reuses the official
 * logo asset (never a replacement). The footer carries the confidentiality
 * language, the server-side generation timestamp and "Page X of Y".
 */
import { branding, borderWidth, fontFamily, page, palette, radius, space, type as typeScale } from "../design/tokens";
import type { ReportDoc, ReportChrome } from "./doc";
import { loadLogo } from "./assets";
import { formatDateTime } from "../../reports/data/format";

/** Logo tile edge length, in points (the app header renders the mark at 28px). */
export const LOGO_SIZE = 24;

/**
 * Draw the MediBook mark as a crisp square tile.
 *
 * The embedded PNG is already a square crop of the official asset, so the
 * mark keeps its real aspect ratio and is never stretched or distorted.
 */
export function drawLogo(target: ReportDoc, x: number, y: number, size: number = LOGO_SIZE): void {
  const doc = target.doc;
  const bytes = loadLogo();
  if (!bytes) {
    // Extremely defensive: a flat brand tile still keeps the report branded.
    target.rect(x, y, size, size, { fill: palette.primary, radius: radius.sm });
    return;
  }

  doc.save();
  doc.roundedRect(x, y, size, size, radius.sm).clip();
  doc.image(bytes, x, y, { width: size, height: size });
  doc.restore();
}

/** Draw the header band (brand + report title + period) for the current page. */
export function drawHeader(target: ReportDoc, chrome: ReportChrome): void {
  const doc = target.doc;
  const left = target.left;
  const right = target.right;
  const topRule = page.headerHeight - 12;

  drawLogo(target, left, 18, LOGO_SIZE);

  target.textAt(left + LOGO_SIZE + space[2], 19, branding.organisation, {
    font: "semibold",
    size: typeScale.sm,
    color: palette.primary,
  });

  target.textAt(left + LOGO_SIZE + space[2], 32, chrome.title, {
    font: "semibold",
    size: typeScale.sm,
    color: palette.text,
  });

  if (chrome.periodLine) {
    target.textAt(left + LOGO_SIZE + space[2], 45, chrome.periodLine, {
      font: "regular",
      size: typeScale.micro,
      color: palette.textMuted,
    });
  }

  if (chrome.rightLine) {
    target.textAt(left, 32, chrome.rightLine, {
      font: "semibold",
      size: typeScale.sm,
      color: palette.primaryHover,
      align: "right",
      width: target.width,
    });
  }

  // Shell-header hairline + the MediBook teal brand accent.
  target.rule(topRule, { color: palette.border, lineWidth: borderWidth.hairline });
  target.rule(topRule, { color: palette.primary, lineWidth: borderWidth.emphasis, width: 54 });
  doc.y = page.headerHeight;
}

/** Draw the footer band for the current page. */
export function drawFooter(
  target: ReportDoc,
  chrome: ReportChrome,
  options: { pageNumber: number; pageCount: number }
): void {
  const doc = target.doc;
  const ruleY = page.height - page.footerHeight + 8;
  const line1 = ruleY + 6;
  const line2 = line1 + 10;
  const left = target.left;

  target.rule(ruleY, { color: palette.border, lineWidth: borderWidth.hairline });

  target.textAt(left, line1, branding.organisation, {
    font: "semibold",
    size: typeScale.micro,
    color: palette.text,
  });
  target.textAt(left, line2, chrome.footerNote ?? "", {
    font: "regular",
    size: typeScale.micro,
    color: palette.textMuted,
  });

  target.textAt(left, line1, `Generated: ${formatDateTime(target.generatedAt)}`, {
    font: "regular",
    size: typeScale.micro,
    color: palette.textMuted,
    align: "right",
    width: target.width,
  });
  target.textAt(left, line2, `Page ${options.pageNumber} of ${options.pageCount}`, {
    font: "regular",
    size: typeScale.micro,
    color: palette.textMuted,
    align: "right",
    width: target.width,
  });

  doc.font(fontFamily.regular);
}

/** Stamp header + footer on the current (already switched-to) page. */
export function stampPage(
  target: ReportDoc,
  chrome: ReportChrome,
  pageIndex: number,
  pageCount: number
): void {
  const original = target.doc.page.margins;
  // Replace (never mutate) the page margins so the footer text may legally be
  // drawn inside the reserved band without PDFKit auto-inserting a page.
  target.doc.page.margins = { top: 0, bottom: 0, left: original.left, right: original.right };
  drawHeader(target, chrome);
  drawFooter(target, chrome, { pageNumber: pageIndex + 1, pageCount });
  target.doc.page.margins = original;
}
