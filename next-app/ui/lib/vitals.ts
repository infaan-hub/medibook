/**
 * Shared vitals display helpers (phase 2) — the compact measurement chips
 * rendered on both the doctor's patient chart and the patient's own history.
 */
import type { Vital } from "../api/vitals";

export interface VitalChip {
  label: string;
  value: string;
}

/** "BP 120/80 mmHg", "Temp 37.2 °C", "BMI 22.4" — only what was measured. */
export function vitalChips(vital: Vital): VitalChip[] {
  const chips: VitalChip[] = [];
  if (vital.systolic_bp !== null && vital.diastolic_bp !== null) {
    chips.push({ label: "BP", value: `${vital.systolic_bp}/${vital.diastolic_bp} mmHg` });
  }
  if (vital.pulse_bpm !== null) chips.push({ label: "Pulse", value: `${vital.pulse_bpm} bpm` });
  if (vital.temperature_c !== null) {
    chips.push({ label: "Temp", value: `${Number(vital.temperature_c).toFixed(1)} °C` });
  }
  if (vital.spo2_percent !== null) chips.push({ label: "SpO₂", value: `${vital.spo2_percent} %` });
  if (vital.glucose_mg_dl !== null) {
    chips.push({ label: "Glucose", value: `${vital.glucose_mg_dl} mg/dL` });
  }
  if (vital.weight_kg !== null) {
    chips.push({ label: "Weight", value: `${Number(vital.weight_kg).toFixed(1)} kg` });
  }
  if (vital.height_cm !== null) {
    chips.push({ label: "Height", value: `${Number(vital.height_cm).toFixed(1)} cm` });
  }
  if (vital.bmi !== null) chips.push({ label: "BMI", value: Number(vital.bmi).toFixed(1) });
  return chips;
}

/** "30 Sep 2026" — safe for malformed timestamps (shows "—"). */
export function vitalDate(value: string): string {
  // Date-only values ("YYYY-MM-DD") parse as UTC midnight and would render a
  // day early in negative-offset timezones — give them a local time part.
  const dt = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString();
}
