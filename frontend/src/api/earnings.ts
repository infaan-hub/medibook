/**
 * Doctor Earnings API — dashboard data for earnings tracking.
 */
import { apiGet } from "./client";
import type { Envelope } from "./types";

export interface DailyBreakdown {
  date: string;
  appointments: number;
  earnings: number;
}

export interface WeekDailyBreakdown {
  date: string;
  day: string;
  appointments: number;
  earnings: number;
}

export interface EarningsData {
  consultation_fee: number;
  today: { appointments: number; earnings: number };
  this_week: { appointments: number; earnings: number };
  this_month: { appointments: number; earnings: number };
  daily_30_days: DailyBreakdown[];
  week_daily: WeekDailyBreakdown[];
}

/** GET /api/doctors/me/earnings/ — doctor earnings dashboard. */
export function getEarningsDashboard(): Promise<Envelope<EarningsData>> {
  return apiGet<EarningsData>("/doctors/me/earnings/");
}
