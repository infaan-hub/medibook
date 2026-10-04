/**
 * Reusable report components (§34) — the MediBook PDF component inventory.
 *
 * Every renderer (admin / doctor / patient) is composed from these blocks, so
 * the three report families cannot drift apart visually. All styling comes
 * from `reports/design/tokens` — the typed mirror of the live design system.
 */
import {
  borderWidth,
  fontFamily,
  geometry,
  palette,
  radius,
  space,
  toneStyles,
  type as typeScale,
} from "../design/tokens";
import type { FontWeight, Tone } from "../design/tokens";
import type { ReportDoc } from "./doc";

/* ============================== Headings ================================= */

export interface SectionTitleOptions {
  title: string;
  subtitle?: string;
  /** Optional small eyebrow above the title (e.g. "Section 3"). */
  eyebrow?: string;
}

/**
 * Space kept free beneath a heading so it never ends up alone at the bottom of
 * a page: enough for a table header plus one minimum-height row (the most
 * common block that follows a heading).
 */
const KEEP_WITH_NEXT = 56;

/** A labelled report section heading with the MediBook teal accent. */
export function sectionTitle(d: ReportDoc, options: SectionTitleOptions): void {
  const { title, subtitle, eyebrow: kicker } = options;
  const titleH = d.measure(title, { font: "semibold", size: typeScale.md });
  const subtitleH = subtitle ? d.measure(subtitle, { size: typeScale.micro, width: d.width - 14 }) : 0;
  const eyebrowH = kicker ? typeScale.label + 3 : 0;
  const blockH = titleH + subtitleH + eyebrowH + 6;
  d.ensureSpace(blockH + 8 + KEEP_WITH_NEXT);

  const y = d.y;
  d.rect(d.left, y + 1, 3, Math.min(16, titleH + 2), { fill: palette.primary, radius: 1.5 });
  let cursor = y;
  if (kicker) {
    d.textAt(d.left + 11, cursor, kicker.toUpperCase(), {
      font: "bold",
      size: typeScale.micro,
      color: palette.eyebrow,
      characterSpacing: 0.7,
    });
    cursor += eyebrowH;
  }
  d.textAt(d.left + 11, cursor, title, { font: "semibold", size: typeScale.md, color: palette.text });
  cursor += titleH + 2;
  if (subtitle) {
    d.textAt(d.left + 11, cursor, subtitle, {
      size: typeScale.micro,
      color: palette.textMuted,
      width: d.width - 14,
    });
    cursor += subtitleH;
  }
  d.y = cursor + 6;
}

/** A smaller heading inside a section (group heading). */
export function subsectionTitle(d: ReportDoc, title: string): void {
  const h = d.measure(title, { font: "semibold", size: typeScale.sm });
  d.ensureSpace(h + 10 + KEEP_WITH_NEXT);
  d.textAt(d.left, d.y, title.toUpperCase(), {
    font: "semibold",
    size: typeScale.label,
    color: palette.primaryHover,
    characterSpacing: 0.5,
  });
  d.y += h + 5;
}

/** Small uppercase eyebrow label (admin `.admin-eyebrow` vocabulary). */
export function eyebrow(d: ReportDoc, text: string): void {
  const h = d.measure(text, { font: "bold", size: typeScale.micro });
  d.ensureSpace(h + 4);
  const startY = d.y;
  d.textAt(d.left, startY, text.toUpperCase(), {
    font: "bold",
    size: typeScale.micro,
    color: palette.eyebrow,
    characterSpacing: 0.7,
    width: d.width,
  });
  // `textAt` already advances the cursor; restate it so the block ends on the
  // exact measured height regardless of the font's own ascent.
  d.y = startY + h + 3;
}

/* ============================== Text blocks ============================== */

export interface ParagraphOptions {
  font?: FontWeight;
  size?: number;
  color?: string;
  lineGap?: number;
  /** Left indent inside the content box. */
  indent?: number;
  /** Teal accent rule on the left of a note block. */
  accent?: boolean;
  /** Soft background behind the block (surfaceAlt / primarySoft). */
  background?: string;
}

/**
 * Wrapped body copy. Long medical narrative flows naturally across pages —
 * nothing is truncated (§29).
 */
export function paragraph(d: ReportDoc, value: string, options: ParagraphOptions = {}): void {
  const {
    font = "regular",
    size = typeScale.sm,
    color = palette.text,
    lineGap = 2,
    indent = 0,
    accent = false,
    background,
  } = options;
  if (!value) return;
  const pad = background ? space[3] : 0;
  const accentW = accent ? 3 : 0;
  const width = d.width - indent - pad * 2 - accentW - 2;
  const height = d.measure(value, { font, size, width, lineGap });
  const boxH = height + pad * 2;

  // Keep at least two lines together before breaking.
  d.ensureSpace(Math.min(boxH, 30) + 6);
  const startY = d.y;
  if (background) d.rect(d.left, startY, d.width, boxH, { fill: background, radius: radius.sm });
  if (accent) {
    d.rect(d.left + pad, startY + pad - 3, accentW, height + 4, { fill: palette.primary, radius: 1 });
  }
  d.textAt(d.left + indent + pad + accentW, startY + pad, value, {
    font,
    size,
    color,
    width,
    lineGap,
  });
  d.y = startY + boxH + 4;
}

/* ============================= Field blocks ============================== */

export interface FieldBlockOptions {
  label: string;
  value: string;
  /** Secondary line under the value (attribution, dates). */
  meta?: string;
  /** Extra supporting metadata lines. */
  metaLines?: string[];
  labelColor?: string;
  valueFont?: FontWeight;
  size?: number;
  width?: number;
  x?: number;
  /** Absolute y — when given, the cursor is left untouched. */
  y?: number;
}

/** Height a field block needs at the given width. */
export function fieldBlockHeight(d: ReportDoc, options: FieldBlockOptions): number {
  const { label, value, meta, metaLines = [], size = typeScale.sm } = options;
  const width = options.width ?? d.width;
  const labelH = d.measure(label.toUpperCase(), { font: "semibold", size: typeScale.label, width });
  const valueH = d.measure(value, { size, width });
  const metaH = meta ? d.measure(meta, { size: typeScale.micro, width }) : 0;
  const extraH = metaLines.reduce(
    (total, line) => total + d.measure(line, { size: typeScale.micro, width }),
    0
  );
  return labelH + 4 + valueH + (valueH ? 3 : 0) + metaH + extraH + 6;
}

/** Draw a label/value pair and return the height it consumed. */
export function fieldBlock(d: ReportDoc, options: FieldBlockOptions): number {
  const {
    label,
    value,
    meta,
    metaLines = [],
    labelColor = palette.textMuted,
    valueFont = "regular",
    size = typeScale.sm,
  } = options;
  const x = options.x ?? d.left;
  const width = options.width ?? d.width;
  const height = fieldBlockHeight(d, { ...options, x, width });
  const absolute = options.y !== undefined;
  if (!absolute) d.ensureSpace(height);

  const startY = options.y ?? d.y;
  d.textAt(x, startY, label.toUpperCase(), {
    font: "semibold",
    size: typeScale.label,
    color: labelColor,
    characterSpacing: 0.4,
    width,
  });
  let cursor = startY + d.measure(label.toUpperCase(), { font: "semibold", size: typeScale.label, width }) + 4;
  d.textAt(x, cursor, value, { font: valueFont, size, color: palette.text, width });
  cursor += d.measure(value, { size, width }) + 3;
  if (meta) {
    d.textAt(x, cursor, meta, { size: typeScale.micro, color: palette.textMuted, width });
    cursor += d.measure(meta, { size: typeScale.micro, width });
  }
  for (const line of metaLines) {
    d.textAt(x, cursor, line, { size: typeScale.micro, color: palette.textMuted, width });
    cursor += d.measure(line, { size: typeScale.micro, width });
  }
  if (!absolute) d.y = cursor + 4;
  return height;
}

export interface GridField {
  label: string;
  value: string;
  metaLines?: string[];
}

/**
 * A responsive label/value grid (the app's `.med-detail` grid). Defaults to
 * two columns; rows break cleanly and never leave a field split mid-value.
 */
export function fieldGrid(
  d: ReportDoc,
  fields: GridField[],
  options: { columns?: number; gap?: number } = {}
): void {
  if (fields.length === 0) return;
  const columns = Math.max(1, options.columns ?? 2);
  const gap = options.gap ?? space[4];
  const colWidth = (d.width - gap * (columns - 1)) / columns;

  for (let index = 0; index < fields.length; index += columns) {
    const slice = fields.slice(index, index + columns);
    const heights = slice.map((field) =>
      fieldBlockHeight(d, { label: field.label, value: field.value, metaLines: field.metaLines, width: colWidth })
    );
    const rowHeight = Math.max(...heights);
    d.ensureSpace(rowHeight);
    const rowY = d.y;
    slice.forEach((field, column) => {
      const x = d.left + column * (colWidth + gap);
      fieldBlock(d, {
        label: field.label,
        value: field.value,
        metaLines: field.metaLines,
        width: colWidth,
        x,
        y: rowY,
      });
    });
    d.y = rowY + rowHeight;
  }
  d.moveDown(space[1]);
}


/** A "no records" placeholder so a section is never silently empty. */
export function emptyNote(d: ReportDoc, text = "No records available."): void {
  const inner = d.width - space[3] * 2;
  const h = d.measure(text, { size: typeScale.sm, width: inner });
  const boxH = h + 14;
  d.ensureSpace(boxH + 6);
  const y = d.y;
  d.rect(d.left, y, d.width, boxH, {
    fill: palette.surfaceAlt,
    stroke: palette.border,
    radius: radius.sm,
    lineWidth: borderWidth.hairline,
  });
  d.textAt(d.left + space[3], y + 7, text, { size: typeScale.sm, color: palette.textMuted, width: inner });
  d.y = y + boxH + 6;
}

/** A thin divider in the app's border colour. */
export function divider(d: ReportDoc, gap = space[3]): void {
  d.ensureSpace(gap + 8);
  d.moveDown(gap / 2);
  d.rule(d.y, { color: palette.border, lineWidth: borderWidth.hairline });
  d.moveDown(gap / 2 + 2);
}

/* =========================== Summary metrics ============================= */

export interface SummaryCard {
  label: string;
  value: string;
  detail?: string;
  tone?: Tone;
}

function summaryCardHeight(d: ReportDoc, card: SummaryCard, inner: number): number {
  const labelH = d.measure(card.label, { size: typeScale.micro, width: inner });
  const valueH = d.measure(card.value, { font: "bold", size: 19.8, width: inner });
  const detailH = card.detail ? d.measure(card.detail, { size: typeScale.micro, width: inner }) : 0;
  return geometry.cardPadding * 2 + labelH + valueH + detailH + 6;
}

/**
 * Metric cards — the app's `.admin-metric` block (tone tile + label + value +
 * detail), laid out as a responsive grid that breaks between rows.
 */
export function summaryCards(
  d: ReportDoc,
  cards: SummaryCard[],
  options: { columns?: number; gap?: number } = {}
): void {
  if (cards.length === 0) return;
  const columns = Math.max(1, options.columns ?? geometry.summaryColumns);
  const gap = options.gap ?? geometry.cardGap;
  const cardWidth = (d.width - gap * (columns - 1)) / columns;
  const inner = cardWidth - geometry.cardPadding - 30;

  for (let index = 0; index < cards.length; index += columns) {
    const slice = cards.slice(index, index + columns);
    const heights = slice.map((card) => summaryCardHeight(d, card, inner));
    const rowHeight = Math.max(geometry.cardMinHeight, ...heights);
    d.ensureSpace(rowHeight + gap);
    const rowY = d.y;

    slice.forEach((card, column) => {
      const x = d.left + column * (cardWidth + gap);
      const style = toneStyles[card.tone ?? "primary"];
      d.rect(x, rowY, cardWidth, rowHeight, {
        fill: palette.surface,
        stroke: palette.metricBorder,
        radius: radius.md,
        lineWidth: borderWidth.hairline,
      });
      // Tone tile (the app's `.admin-metric__icon`).
      const tileY = rowY + (rowHeight - 22) / 2;
      d.rect(x + geometry.cardPadding, tileY, 22, 22, { fill: style.bg, radius: radius.sm });
      d.rect(x + geometry.cardPadding + 7, tileY + 7, 8, 8, { fill: style.fg, radius: 4 });

      const textX = x + geometry.cardPadding + 30;
      let cursor = rowY + geometry.cardPadding;
      d.textAt(textX, cursor, card.label, {
        size: typeScale.micro,
        color: palette.textMuted,
        width: inner,
      });
      cursor += d.measure(card.label, { size: typeScale.micro, width: inner }) + 2;
      d.textAt(textX, cursor, card.value, { font: "bold", size: 19.8, color: palette.text, width: inner });
      cursor += d.measure(card.value, { font: "bold", size: 19.8, width: inner }) + 2;
      if (card.detail) {
        d.textAt(textX, cursor, card.detail, { size: typeScale.micro, color: palette.textMuted, width: inner });
      }
    });

    d.y = rowY + rowHeight + gap;
  }
  d.y -= gap - space[1];
}

/* =========================== Metadata table ============================== */

export interface InfoRow {
  label: string;
  value: string;
  strong?: boolean;
}

/**
 * Two-column label/value table used for the report information block
 * (organisation, report title, period, generated by/at, subject).
 */
export function infoTable(
  d: ReportDoc,
  rows: InfoRow[],
  options: { labelRatio?: number; rule?: boolean } = {}
): void {
  const labelWidth = d.width * (options.labelRatio ?? 0.3);
  const valueWidth = d.width - labelWidth - space[3];
  const rule = options.rule ?? true;

  for (const row of rows) {
    const labelH = d.measure(row.label, { size: typeScale.sm, width: labelWidth });
    const valueH = d.measure(row.value, { size: typeScale.sm, width: valueWidth });
    const rowHeight = Math.max(labelH, valueH) + 10;
    d.ensureSpace(rowHeight);
    const y = d.y;
    d.textAt(d.left, y + 5, row.label, { size: typeScale.sm, color: palette.textMuted, width: labelWidth });
    d.textAt(d.left + labelWidth + space[3], y + 5, row.value, {
      font: row.strong ? "semibold" : "regular",
      size: typeScale.sm,
      color: palette.text,
      width: valueWidth,
    });
    if (rule) d.rule(y + rowHeight, { color: palette.tableRowRule, lineWidth: borderWidth.hairline });
    d.y = y + rowHeight;
  }
  d.moveDown(space[1]);
}


const badgeHeight = typeScale.label + 8;

/** Measured width of a status pill. */
export function badgeWidth(d: ReportDoc, label: string): number {
  return d.widthOf(label.toUpperCase(), { font: "semibold", size: typeScale.label }) + 16;
}

/**
 * Largest size (stepping down from `base` to `floor`) at which no single word
 * of `value` needs a hard break inside `width`. Keeps headers such as
 * "TEMPERATURE" and values such as "26.4" whole instead of split mid-word.
 */
function fitWordSize(
  d: ReportDoc,
  value: string,
  width: number,
  font: FontWeight,
  base: number,
  floor: number
): number {
  const words = value.split(/\s+/);
  let size = base;
  while (size > floor && Math.max(...words.map((word) => d.widthOf(word, { font, size }))) > width) {
    size -= 0.25;
  }
  return size;
}

/** Greedy word wrapping for pill labels that cannot fit on one line. */
function wrapWords(words: string[], width: number, size: number, widthOf: (text: string, size: number) => number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && widthOf(next, size) > width) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Width PDFKit measures an explicit line break at — it counts towards the
 * line the break terminates, so a line only really fits when
 * `text + break` fits. Without this margin PDFKit chops the line and emits a
 * phantom empty line, which doubles the gap under multi-line pill labels.
 */
function breakWidth(d: ReportDoc, font: FontWeight, size: number): number {
  return d.widthOf("\n", { font, size });
}

interface BadgeBox {
  width: number;
  height: number;
  size: number;
  lines: string[];
}

/**
 * Lay a pill out inside `maxWidth`: the natural width when it fits, otherwise
 * a smaller label size, a two-line wrap for multi-word labels, and finally an
 * ellipsis — a pill never overflows the column it lives in.
 */
function badgeBox(d: ReportDoc, label: string, maxWidth: number = Number.POSITIVE_INFINITY): BadgeBox {
  const text = label.toUpperCase();
  const font: FontWeight = "semibold";
  const width = Math.min(badgeWidth(d, label), maxWidth);
  const inner = Math.max(12, width - 16);
  const widthOf = (value: string, size: number) => d.widthOf(value, { font, size });

  if (widthOf(text, typeScale.label) <= inner) {
    return { width, height: badgeHeight, size: typeScale.label, lines: [text] };
  }

  const words = text.split(/\s+/);
  if (words.length > 1) {
    let size = typeScale.label;
    let usable = inner - breakWidth(d, font, size);
    while (size > 6.5 && Math.max(...words.map((word) => widthOf(word, size))) > usable) {
      size -= 0.25;
      usable = inner - breakWidth(d, font, size);
    }
    if (Math.max(...words.map((word) => widthOf(word, size))) <= usable) {
      const lines = wrapWords(words, usable, size, widthOf);
      if (lines.length <= 2) {
        const height = Math.max(badgeHeight, Math.round(lines.length * size * 1.3) + 8);
        return { width, height, size, lines };
      }
    }
  }

  let size = typeScale.label;
  while (size > 5.5 && widthOf(text, size) > inner) size -= 0.25;
  if (widthOf(text, size) <= inner) {
    return { width, height: badgeHeight, size, lines: [text] };
  }
  let truncated = text;
  while (truncated.length > 1 && widthOf(`${truncated}…`, size) > inner) {
    truncated = truncated.slice(0, -1);
  }
  return { width, height: badgeHeight, size, lines: [`${truncated}…`] };
}

/**
 * Status pill — the same visual language as `.badge--*` / `.lab-status--*`.
 * `maxWidth` clamps the pill to the table column it is drawn in.
 * Returns the drawn width so callers can align subsequent content.
 */
export function badge(
  d: ReportDoc,
  x: number,
  y: number,
  label: string,
  tone: Tone = "neutral",
  align: "left" | "right" = "left",
  maxWidth: number = Number.POSITIVE_INFINITY
): number {
  const box = badgeBox(d, label, maxWidth);
  const left = align === "right" ? x - box.width : x;
  const style = toneStyles[tone];
  d.rect(left, y, box.width, box.height, {
    fill: style.bg,
    stroke: style.border,
    radius: box.height / 2,
    lineWidth: borderWidth.hairline,
  });
  const textHeight = box.lines.length * box.size * 1.3;
  d.textAt(left + 8, y + Math.max(3, (box.height - textHeight) / 2), box.lines.join("\n"), {
    font: "semibold",
    size: box.size,
    color: style.fg,
    width: box.width - 16,
    align: "center",
    lineGap: 1.2,
  });
  return box.width;
}

export const BADGE_HEIGHT = badgeHeight;

/* ========================= Doctor attribution ============================ */

export interface AttributionOptions {
  /** Doctor who entered or updated the information. */
  name: string;
  /** Professional context (specialty / clinic), shown after the name. */
  context?: string;
  /** When the entry was made. */
  dateText?: string;
  /** Clock time of the entry. */
  timeText?: string;
  /** Extra lines (e.g. "Last updated: …"). */
  lines?: string[];
}

/**
 * The doctor-attribution block shown under every doctor-entered medical field
 * (§13 / §17). Only ever rendered when the database actually carries the
 * attribution — never invented.
 */
export function doctorAttribution(d: ReportDoc, options: AttributionOptions): void {
  const { name, context, dateText, timeText, lines = [] } = options;
  const width = d.width - space[3] - 3;
  const headText = context ? `${name} · ${context}` : name;
  const headH = d.measure(headText, { font: "semibold", size: typeScale.sm, width });
  const stamp = [dateText ? `Date: ${dateText}` : null, timeText ? `Time: ${timeText}` : null]
    .filter(Boolean)
    .join("     ");
  const stampH = stamp ? d.measure(stamp, { size: typeScale.micro, width }) : 0;
  const extraH = lines.reduce(
    (total, line) => total + d.measure(line, { size: typeScale.micro, width }),
    0
  );
  const boxH = headH + stampH + extraH + space[2] * 2 + 4;

  d.ensureSpace(boxH + 6);
  const y = d.y;
  d.rect(d.left, y, d.width, boxH, { fill: palette.primarySoft, radius: radius.sm });
  d.rect(d.left, y + 3, 3, boxH - 6, { fill: palette.primary, radius: 1.5 });
  d.textAt(d.left + space[3], y + space[2], headText, {
    font: "semibold",
    size: typeScale.sm,
    color: palette.primaryHover,
    width,
  });
  let cursor = y + space[2] + headH + 2;
  if (stamp) {
    d.textAt(d.left + space[3], cursor, stamp, { size: typeScale.micro, color: palette.textMuted, width });
    cursor += stampH;
  }
  for (const line of lines) {
    d.textAt(d.left + space[3], cursor, line, { size: typeScale.micro, color: palette.textMuted, width });
    cursor += d.measure(line, { size: typeScale.micro, width });
  }
  d.y = y + boxH + 6;
}


/* ================================= Table ================================= */

export type TableRow = Record<string, string>;

export interface TableColumn {
  key: string;
  /** Column heading (rendered uppercase, like `.admin-table th`). */
  label: string;
  /** Relative width weight — the column width is `weight / total`. */
  weight: number;
  align?: "left" | "center" | "right";
  font?: FontWeight;
  size?: number;
  /**
   * Render the cell as a status pill. Return `null` for a plain cell.
   * Receives the raw cell value and the whole row.
   */
  tone?: (value: string, row: TableRow) => Tone | null;
}

export interface DataTableOptions {
  columns: TableColumn[];
  rows: TableRow[];
  /** Shown instead of an empty table. */
  emptyText?: string;
  /** Alternate row shading with the app's `.admin-table` surface. */
  zebra?: boolean;
  /** Minimum row height (keeps short rows breathing). */
  rowMinHeight?: number;
}

const CELL_PAD_X = 8;
const CELL_PAD_Y = 6;

/** Width of every column, in points, left to right. */
function columnWidths(d: ReportDoc, columns: TableColumn[]): number[] {
  const total = columns.reduce((sum, column) => sum + Math.max(0.01, column.weight), 0);
  return columns.map((column) => (Math.max(0.01, column.weight) / total) * d.width);
}

/**
 * Tracking (pt/char) applied to uppercase header labels by `drawTableHeader`.
 * It counts towards the wrap width, so header sizing must reserve it.
 */
const HEADER_TRACKING = 0.4;

/** Font size a header label needs to stay whole inside its column. */
function headerCellSize(d: ReportDoc, column: TableColumn, width: number): number {
  const label = column.label.toUpperCase();
  return fitWordSize(d, label, width - HEADER_TRACKING * label.length, "semibold", typeScale.label, 6.5);
}

/** Width a header label actually wraps against (column width minus tracking). */
function headerInnerWidth(column: TableColumn, width: number): number {
  return width - HEADER_TRACKING * column.label.length;
}

function tableHeaderHeight(d: ReportDoc, columns: TableColumn[], widths: number[]): number {
  let height = 0;
  columns.forEach((column, index) => {
    const h = d.measure(column.label.toUpperCase(), {
      font: "semibold",
      size: headerCellSize(d, column, widths[index] - CELL_PAD_X * 2),
      width: headerInnerWidth(column, widths[index] - CELL_PAD_X * 2),
      lineGap: 1,
    });
    height = Math.max(height, h);
  });
  return height + CELL_PAD_Y * 2;
}

function drawTableHeader(
  d: ReportDoc,
  columns: TableColumn[],
  widths: number[],
  y: number
): number {
  const height = tableHeaderHeight(d, columns, widths);
  d.rect(d.left, y, d.width, height, { fill: palette.surfaceAlt });
  let x = d.left;
  columns.forEach((column, index) => {
    const align = column.align ?? "left";
    const inner = widths[index] - CELL_PAD_X * 2;
    const h = d.textAt(x + CELL_PAD_X, y + CELL_PAD_Y, column.label.toUpperCase(), {
      font: "semibold",
      size: headerCellSize(d, column, inner),
      color: palette.textMuted,
      // Full cell width: `characterSpacing` is applied by PDFKit on top, and
      // `headerCellSize` already reserved its share when choosing the size.
      width: inner,
      align,
      lineGap: 1,
      characterSpacing: HEADER_TRACKING,
    });
    void h;
    x += widths[index];
  });
  d.rule(y + height, { color: palette.tableHeadRule, lineWidth: borderWidth.base });
  return height;
}

/** Height a single row needs (never below the minimum). */
function rowHeight(
  d: ReportDoc,
  columns: TableColumn[],
  widths: number[],
  row: TableRow,
  minHeight: number
): number {
  let height = 0;
  columns.forEach((column, index) => {
    const value = row[column.key] ?? "";
    const width = widths[index] - CELL_PAD_X * 2;
    if (column.tone && column.tone(value, row)) {
      height = Math.max(height, badgeBox(d, value, widths[index] - CELL_PAD_X * 2).height);
      return;
    }
    const font = column.font ?? "regular";
    const size = fitWordSize(d, value, width, font, column.size ?? typeScale.sm, 8);
    const h = d.measure(value, { font, size, width, lineGap: 1.5 });
    height = Math.max(height, h);
  });
  return Math.max(minHeight, height + CELL_PAD_Y * 2);
}

/** Draw one body row at an absolute y; returns the height consumed. */
function drawRow(
  d: ReportDoc,
  columns: TableColumn[],
  widths: number[],
  row: TableRow,
  y: number,
  height: number,
  options: { shade?: boolean }
): void {
  if (options.shade) d.rect(d.left, y, d.width, height, { fill: palette.surfaceAlt });

  let x = d.left;
  columns.forEach((column, index) => {
    const value = row[column.key] ?? "";
    const align = column.align ?? "left";
    const width = widths[index];
    const inner = width - CELL_PAD_X * 2;
    const tone = column.tone ? column.tone(value, row) : null;

    if (tone) {
      const box = badgeBox(d, value, inner);
      const badgeY = y + (height - box.height) / 2;
      if (align === "right") {
        badge(d, x + width - CELL_PAD_X, badgeY, value, tone, "right", inner);
      } else if (align === "center") {
        badge(d, x + CELL_PAD_X + (inner - box.width) / 2, badgeY, value, tone, "left", inner);
      } else {
        badge(d, x + CELL_PAD_X, badgeY, value, tone, "left", inner);
      }
      x += width;
      return;
    }

    const font = column.font ?? "regular";
    const size = fitWordSize(d, value, inner, font, column.size ?? typeScale.sm, 8);
    const textHeight = d.measure(value, {
      font,
      size,
      width: inner,
      lineGap: 1.5,
    });
    d.textAt(x + CELL_PAD_X, y + (height - textHeight) / 2, value, {
      font,
      size,
      color: palette.text,
      width: inner,
      align,
      lineGap: 1.5,
    });
    x += width;
  });

  d.rule(y + height, { color: palette.tableRowRule, lineWidth: borderWidth.hairline });
}

/**
 * Page-aware data table: the header repeats after every break, rows are never
 * split, and pills keep the app's badge vocabulary.
 */
export function dataTable(d: ReportDoc, options: DataTableOptions): void {
  const { columns, rows, emptyText = "No records available.", zebra = true, rowMinHeight = 24 } = options;
  if (columns.length === 0) return;
  if (rows.length === 0) {
    emptyNote(d, emptyText);
    return;
  }

  const widths = columnWidths(d, columns);
  const headerH = tableHeaderHeight(d, columns, widths);
  d.ensureSpace(headerH + rowMinHeight + 4);
  let y = d.y + drawTableHeader(d, columns, widths, d.y);

  rows.forEach((row, index) => {
    const height = rowHeight(d, columns, widths, row, rowMinHeight);
    // Repeat the heading after a break, then re-measure on the new page.
    if (y + height > d.bottom) {
      d.addPage();
      y = d.y;
      y += drawTableHeader(d, columns, widths, y);
    }
    drawRow(d, columns, widths, row, y, height, { shade: zebra && index % 2 === 1 });
    y += height;
  });

  d.y = Math.min(y, d.bottom);
}

export { fontFamily, geometry };


