/**
 * ReportDoc — the shared PDF engine behind every MediBook report.
 *
 * Responsibilities:
 *  - build a PDFKit document whose margins reserve the header/footer bands,
 *    so automatic page breaks never collide with the chrome;
 *  - register the MediBook type stack (Inter, matching --font-sans);
 *  - expose a small, measured drawing API that the component layer composes;
 *  - stamp the branded header/footer + "Page X of Y" on every page once the
 *    body is complete (buffered pages).
 *
 * Nothing about an individual report lives here — this is the design system's
 * rendering substrate.
 */
import PDFDocument from "pdfkit";
import { bodyBottom, contentWidth, fontFamily, page, palette, type as typeScale } from "../design/tokens";
import type { FontWeight } from "../design/tokens";
import { registerReportFonts } from "./assets";

/** Text/branding shown in the repeated page chrome. */
export interface ReportChrome {
  /** Report title, e.g. "Monthly Administrative Report". */
  title: string;
  /** Optional secondary line under the title. */
  subtitle?: string;
  /** Reporting period / scope line. */
  periodLine?: string;
  /** Right-aligned header line (period in admin reports, subject in medical). */
  rightLine?: string;
  /** Footer confidentiality language. */
  footerNote?: string;
}

export interface TextOptions {
  font?: FontWeight;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right" | "justify";
  width?: number;
  x?: number;
  lineGap?: number;
  characterSpacing?: number;
}

const fontName = (weight: FontWeight): string => fontFamily[weight];

export class ReportDoc {
  readonly doc: PDFKit.PDFDocument;
  readonly chrome: ReportChrome;
  readonly generatedAt: Date;

  constructor(chrome: ReportChrome, generatedAt: Date = new Date()) {
    this.chrome = chrome;
    this.generatedAt = generatedAt;
    this.doc = new PDFDocument({
      size: page.size,
      // Margins reserve the header/footer bands → PDFKit page breaks land
      // inside the content box and never clip a table row or a heading.
      margins: {
        top: page.headerHeight,
        bottom: page.footerHeight,
        left: page.marginX,
        right: page.marginX,
      },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: `${chrome.title} — ${chrome.subtitle ?? "Report"}`,
        Author: "MediBook Zanzibar",
        Subject: chrome.subtitle ?? chrome.title,
        Creator: "MediBook Zanzibar Reporting",
      },
    });
    registerReportFonts(this.doc);
  }

  /* --------------------------- Geometry helpers --------------------------- */

  /** Current content cursor (PDFKit's y). */
  get y(): number {
    return this.doc.y;
  }

  set y(value: number) {
    this.doc.y = value;
  }

  /** Left content edge. */
  get left(): number {
    return page.marginX;
  }

  /** Right content edge. */
  get right(): number {
    return page.width - page.marginX;
  }

  /** Usable content width. */
  get width(): number {
    return contentWidth;
  }

  /** Lowest y body content may occupy before a page break. */
  get bottom(): number {
    return bodyBottom;
  }

  addPage(): void {
    this.doc.addPage();
  }

  /** Start a new page when `height` points would overflow the content box. */
  ensureSpace(height: number): void {
    if (this.doc.y + height > bodyBottom + 0.5) this.doc.addPage();
  }

  moveDown(height: number): void {
    this.doc.y = Math.min(this.doc.y, bodyBottom);
    this.doc.y += height;
  }

  /* ------------------------------- Measuring ------------------------------ */

  /** Height a string needs at the given typography (cursor unchanged). */
  measure(value: string, options: TextOptions = {}): number {
    const { font = "regular", size = typeScale.sm, width = contentWidth, lineGap = 0 } = options;
    this.doc.font(fontName(font)).fontSize(size);
    if (!value) return 0;
    return this.doc.heightOfString(String(value), { width, lineGap });
  }

  /* -------------------------------- Drawing ------------------------------- */

  /** Draw wrapped text at the cursor and return the height it consumed. */
  text(value: string, options: TextOptions = {}): number {
    const {
      font = "regular",
      size = typeScale.sm,
      color = palette.text,
      align = "left",
      width = contentWidth,
      x = page.marginX,
      lineGap = 0,
      characterSpacing,
    } = options;
    this.doc.font(fontName(font)).fontSize(size).fillColor(color);
    const start = this.doc.y;
    this.doc.text(String(value ?? ""), x, start, {
      width,
      align,
      lineGap,
      ...(characterSpacing !== undefined ? { characterSpacing } : {}),
    });
    return this.doc.y - start;
  }

  /** Draw text at an absolute position; returns the measured height. */
  textAt(x: number, y: number, value: string, options: TextOptions = {}): number {
    const {
      font = "regular",
      size = typeScale.sm,
      color = palette.text,
      align = "left",
      width = contentWidth,
      lineGap = 0,
      characterSpacing,
    } = options;
    this.doc.font(fontName(font)).fontSize(size).fillColor(color);
    this.doc.text(String(value ?? ""), x, y, {
      width,
      align,
      lineGap,
      ...(characterSpacing !== undefined ? { characterSpacing } : {}),
    });
    return this.doc.heightOfString(String(value ?? ""), { width, lineGap });
  }

  /** Text width in points at the given typography. */
  widthOf(value: string, options: TextOptions = {}): number {
    const { font = "regular", size = typeScale.sm } = options;
    this.doc.font(fontName(font)).fontSize(size);
    return this.doc.widthOfString(String(value ?? ""));
  }

  /** Fill and/or stroke a rectangle. */
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    options: { fill?: string; stroke?: string; radius?: number; lineWidth?: number } = {}
  ): void {
    const { fill, stroke, radius, lineWidth = 1 } = options;
    if (radius && radius > 0) {
      if (fill) this.doc.roundedRect(x, y, width, height, radius).fill(fill);
      if (stroke) this.doc.roundedRect(x, y, width, height, radius).lineWidth(lineWidth).stroke(stroke);
      return;
    }
    if (fill) this.doc.rect(x, y, width, height).fill(fill);
    if (stroke) this.doc.rect(x, y, width, height).lineWidth(lineWidth).stroke(stroke);
  }

  /** Horizontal rule at an absolute y. */
  rule(
    y: number,
    options: { color?: string; lineWidth?: number; x?: number; width?: number } = {}
  ): void {
    const { color = palette.border, lineWidth = 1, x = page.marginX, width = contentWidth } = options;
    this.doc.moveTo(x, y).lineTo(x + width, y).lineWidth(lineWidth).stroke(color);
  }

  /* ------------------------------- Finalise ------------------------------- */

  /**
   * Stamp the branded header/footer on every buffered page, then return the
   * finished PDF as a Buffer.
   */
  async finish(
    stamp: (doc: ReportDoc, pageIndex: number, pageCount: number) => void
  ): Promise<Buffer> {
    const range = this.doc.bufferedPageRange();
    const pageCount = range.count;
    for (let index = 0; index < pageCount; index += 1) {
      this.doc.switchToPage(range.start + index);
      stamp(this, index, pageCount);
    }
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      this.doc.on("end", () => resolve(Buffer.concat(chunks)));
      this.doc.on("error", reject);
      this.doc.end();
    });
  }
}
