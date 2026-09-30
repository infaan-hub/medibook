/**
 * Shared lab-order display helpers (phase 3) — status/flag labels and the
 * reference-range caption rendered on the doctor's chart and the patient's
 * own results list.
 */
import type { LabOrder, LabOrderStatus } from "../api/lab-orders";

export function statusLabel(status: LabOrderStatus): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "resulted":
      return "Resulted";
    case "cancelled":
      return "Cancelled";
    default:
      return "Ordered";
  }
}

/** Flag badge text ("High", "Normal", …) — null when nothing is reported. */
export function flagLabel(order: LabOrder): string | null {
  if (order.flag === "low") return "Low";
  if (order.flag === "high") return "High";
  if (order.flag === "normal") return "Normal";
  if (order.flag === "unknown") return "Reported";
  return null;
}

/** "4.0 – 5.5 mmol/L" (or whichever bound is known), "—" when unset. */
export function referenceLabel(order: LabOrder): string {
  const { reference_min: min, reference_max: max } = order;
  if (min === null && max === null) return "—";
  const bounds =
    min !== null && max !== null
      ? `${min} – ${max}`
      : min !== null
        ? `≥ ${min}`
        : `≤ ${max}`;
  return order.unit ? `${bounds} ${order.unit}` : bounds;
}

/** The reported value with its unit ("13.8 g/dL"). */
export function resultLabel(order: LabOrder): string {
  if (!order.result_value) return "—";
  return order.unit && !order.result_value.includes(order.unit)
    ? `${order.result_value} ${order.unit}`
    : order.result_value;
}
