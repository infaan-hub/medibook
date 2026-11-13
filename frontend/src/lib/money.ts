/**
 * Service-fee formatting. Fees are stored once per currency: TSh is the
 * primary amount and USD is an explicit admin-managed price, so no live
 * exchange-rate lookup or rounding drift is involved.
 */
const toNumber = (value: unknown): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

/** TSh uses whole shillings — "TSh 20,000". */
export function formatTsh(value: unknown): string {
  return `TSh ${toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** USD keeps cents — "$10.00". */
export function formatUsd(value: unknown): string {
  return `$${toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Both prices of one service — "TSh 20,000 · $10.00". */
export function formatFeePair(tsh: unknown, usd: unknown): string {
  return `${formatTsh(tsh)} · ${formatUsd(usd)}`;
}
