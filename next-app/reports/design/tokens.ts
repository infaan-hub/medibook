/**
 * MediBook Zanzibar — report design tokens.
 *
 * A typed, PDF-friendly mirror of the LIVE application design system
 * (`ui/design/tokens.css` + the component rules in `ui/styles/global.css`).
 * CSS remains the source of truth for the web UI; this module is the single
 * source of truth for every PDF report, so all three report types share one
 * visual identity.
 *
 * Values are transcribed from the current stylesheet — never invented:
 *   - brand/neutral/feedback/status colours  → ui/design/tokens.css :root
 *   - font stack                              → --font-sans
 *   - type scale / weights / spacing / radii   → tokens.css
 *   - card border (`1.5px solid #b2e6da`)      → global.css `.card`
 *   - table header/row rules                   → global.css `.admin-table`
 *   - metric card                              → global.css `.admin-metric`
 *   - eyebrow label                            → global.css `.admin-eyebrow`
 *   - status / lab pills                       → global.css `.badge`, `.lab-*`
 *
 * PDF points: 1px = 0.75pt (96dpi → 72dpi). `pxToPt` keeps the mapping
 * explicit instead of scattering magic numbers.
 */

export const pxToPt = (px: number): number => Math.round(px * 0.75 * 100) / 100;

/** Colour palette — verbatim hex values from ui/design/tokens.css. */
export const palette = {
  /* Brand */
  primary: "#09a99e",
  primaryHover: "#087f79",
  primaryActive: "#076f6a",
  primarySoft: "#e2f8f6",
  secondary: "#087f79",
  secondarySoft: "#d9f4f2",
  accent: "#8a3ffc",

  /* Neutrals */
  bg: "#f0fbfb",
  surface: "#ffffff",
  surfaceAlt: "#fafafb",
  text: "#163c3c",
  textMuted: "#668787",
  textInverse: "#ffffff",
  border: "#d5d9de",
  borderStrong: "#a8aeb8",
  /** `.card { border: 1.5px solid #b2e6da }` — the app's card outline. */
  cardBorder: "#b2e6da",
  /** `.admin-table th { border-bottom: 1px solid #e7eef2 }`. */
  tableHeadRule: "#e7eef2",
  /** `.admin-table td { border-bottom: 1px solid #eef2f4 }`. */
  tableRowRule: "#eef2f4",
  /** `.admin-metric { border: 1px solid #e3eaf0 }`. */
  metricBorder: "#e3eaf0",
  /** `.admin-eyebrow { color: #0a9f94 }`. */
  eyebrow: "#0a9f94",

  /* Feedback states */
  success: "#24a148",
  successSoft: "#e3f7e8",
  warning: "#b21800",
  warningSoft: "#fde8e4",
  error: "#da1e28",
  errorSoft: "#ffe9ea",
  info: "#0f62fe",
  infoSoft: "#e8f1ff",

  /* Appointment / record status */
  statusPending: "#f1c21b",
  statusAccepted: "#0f62fe",
  statusInProgress: "#eb6424",
  statusDone: "#24a148",
  statusCancelled: "#8d8d8d",
  statusRejected: "#da1e28",
  statusExpired: "#525252",
  statusNoShow: "#a56eff",
} as const;

export type PaletteKey = keyof typeof palette;

/** Font family names registered on a report document (see pdf/fonts.ts). */
export const fontFamily = {
  regular: "MediBook",
  medium: "MediBook-Medium",
  semibold: "MediBook-SemiBold",
  bold: "MediBook-Bold",
} as const;

export type FontWeight = keyof typeof fontFamily;

/** Type scale — `--text-*` variables converted from px to pt. */
export const type = {
  xs: pxToPt(12), // --text-xs
  sm: pxToPt(14), // --text-sm
  md: pxToPt(16), // --text-md
  lg: pxToPt(18), // --text-lg
  xl: pxToPt(20), // --text-xl
  "2xl": pxToPt(24), // --text-2xl
  "3xl": pxToPt(32), // --text-3xl
  /* Report-only increments that stay on the app's visual rhythm. */
  micro: pxToPt(10),
  label: pxToPt(11),
  /** `.admin-metric strong { font-size: 1.65rem }` → 26.4px. */
  metric: pxToPt(26.4),
} as const;

/** Line height ratio — body copy uses 1.5 (global.css `body`). */
export const lineHeight = 1.5;

/**
 * Page geometry. A4 portrait at 72dpi. The header/footer reserves are applied
 * as the document margins so PDFKit's automatic page breaks always land
 * between content and chrome (headings/tables are never clipped by the
 * header band).
 */
export const page = {
  size: "A4" as const,
  width: 595.28,
  height: 841.89,
  marginX: 46,
  headerHeight: 74,
  footerHeight: 62,
} as const;

/** Content box width inside the report margins. */
export const contentWidth = page.width - page.marginX * 2;
/** Lowest y a body element may occupy before a page break is required. */
export const bodyBottom = page.height - page.footerHeight;

/** Semantic tone names shared by badges, pills and status labels. */
export type Tone =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "pending"
  | "accepted"
  | "in_progress"
  | "done"
  | "cancelled"
  | "rejected"
  | "expired"
  | "violet";

/** Tone → { background, foreground, border } using only app palette values. */
export const toneStyles: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: palette.surfaceAlt, fg: palette.textMuted, border: palette.border },
  primary: { bg: palette.primarySoft, fg: palette.primaryHover, border: palette.cardBorder },
  info: { bg: palette.infoSoft, fg: palette.info, border: "#bfdbfe" },
  success: { bg: palette.successSoft, fg: "#16805d", border: "#a7f3d0" },
  warning: { bg: palette.warningSoft, fg: "#a86200", border: "#fed7aa" },
  error: { bg: palette.errorSoft, fg: palette.error, border: "#fecaca" },
  pending: { bg: "#fff3db", fg: "#a86200", border: "#fed7aa" },
  accepted: { bg: palette.infoSoft, fg: palette.info, border: "#bfdbfe" },
  in_progress: { bg: "#ffefe6", fg: "#b45311", border: "#fdba8c" },
  done: { bg: palette.successSoft, fg: "#04813d", border: "#a7f3d0" },
  cancelled: { bg: "#f1f5f9", fg: "#475569", border: palette.border },
  rejected: { bg: palette.errorSoft, fg: palette.error, border: "#fecaca" },
  expired: { bg: "#eef1f4", fg: "#3f4750", border: "#ccd3da" },
  violet: { bg: "#f0eaff", fg: "#7c3aed", border: "#ddd6fe" },
};

/** Appointment status → tone, matching `.badge--*` in global.css. */
export function statusTone(status: string): Tone {
  switch (status) {
    case "pending":
      return "pending";
    case "accepted":
      return "accepted";
    case "in_progress":
      return "in_progress";
    case "done":
      return "done";
    case "cancelled":
      return "cancelled";
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    default:
      return "neutral";
  }
}

/** Lab order status → tone, matching `.lab-status--*` in global.css. */
export function labStatusTone(status: string): Tone {
  switch (status) {
    case "in_progress":
      return "accepted";
    case "resulted":
      return "success";
    case "cancelled":
      return "error";
    default:
      return "neutral";
  }
}

/** Lab result flag → tone, matching `.lab-flag--*` in global.css. */
export function labFlagTone(flag: string | null): Tone {
  switch (flag) {
    case "normal":
      return "success";
    case "high":
      return "warning";
    case "low":
      return "accepted";
    default:
      return "neutral";
  }
}

/** Report chrome copy — one place to keep the branding identical everywhere. */
export const branding = {
  organisation: "MediBook Zanzibar",
  product: "MediBook",
  confidentialMedical: "Confidential Medical Information",
  confidentialAdministrative: "Confidential — Administrative Report",
  notProvided: "Not provided",
} as const;

/** Headings use 1.25 (global.css `h1,h2,h3`). */
export const headingLineHeight = 1.25;

/** Spacing scale — 4px base, converted to points. */
export const space = {
  1: pxToPt(4),
  2: pxToPt(8),
  3: pxToPt(12),
  4: pxToPt(16),
  5: pxToPt(20),
  6: pxToPt(24),
  8: pxToPt(32),
  10: pxToPt(40),
  12: pxToPt(48),
} as const;

/** Radii — --radius-sm/md/lg. */
export const radius = {
  sm: pxToPt(8),
  md: pxToPt(12),
  lg: pxToPt(16),
} as const;

/** Border weights — the app pairs a 1px hairline with a 1.5px emphasis. */
export const borderWidth = {
  hairline: 0.75,
  base: 1,
  emphasis: 1.13, // 1.5px
} as const;

/**
 * Summary card / table geometry shared by every renderer.
 * Declared last because it composes `radius`, `space` and `pxToPt`.
 */
export const geometry = {
  cardRadius: radius.md,
  cardPadding: space[4],
  cardMinHeight: 62,
  cardGap: space[3],
  summaryColumns: 3,
  /** Table cell insets, in points — the values `pdf/components.ts` draws with. */
  tableCellPaddingX: 8,
  tableCellPaddingY: 6,
  tableHeaderPaddingY: 6,
} as const;
