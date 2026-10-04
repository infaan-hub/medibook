/**
 * Administrative report data (§34 family 1) — platform-wide aggregates for a
 * single reporting period, gathered in one pass so the PDF and any future
 * JSON preview read exactly the same numbers.
 */
import { prisma } from "@/lib/db";
import { formatCount, formatDateTime, isoDayInTimezone, statusLabel } from "./format";
import {
  dateColumnRange,
  resolvePeriod,
  timestampRange,
  type PeriodQuery,
  type ReportPeriod,
} from "./period";

const TOP_DOCTORS = 10;
const REGISTRATION_ROWS = 40;
/** Health-tip rows listed in the admin PDF before a disclosure note takes over. */
const HEALTH_TIP_ROWS = 40;
/** Beyond this span a per-day table stops being readable on paper. */
const MAX_DAILY_DAYS = 92;
/** Emergency lifecycle, in the order an administrator reads it. */
const EMERGENCY_STATUSES = [
  "pending",
  "accepted",
  "in_progress",
  "done",
  "rejected",
  "cancelled",
  "expired",
] as const;
/** Registration roles, in the order an administrator reads them. */
const ACCOUNT_ROLES = ["patient", "doctor", "admin"] as const;

export interface StatusBreakdownRow {
  /** Raw enum value, used for the status pill tone. */
  status: string;
  label: string;
  count: string;
  share: string;
}

export interface DoctorActivityRow {
  name: string;
  specialty: string;
  appointments: string;
  completed: string;
}

export interface DailyVolumeRow {
  date: string;
  day: string;
  appointments: string;
  completed: string;
}

export interface DailyEmergencyRow {
  date: string;
  day: string;
  /** Emergency requests dated on that day. */
  requests: string;
  /** Of those, the ones closed as Done. */
  completed: string;
}

export interface DailyAccountRow {
  date: string;
  day: string;
  /** Accounts created on that day. */
  accounts: string;
}

export interface RoleBreakdownRow {
  role: string;
  count: string;
  share: string;
}

/** One health tip (blog article) created inside the reporting period. */
export interface HealthTipRow {
  title: string;
  category: string;
  /** Display label, e.g. "Published". */
  status: string;
  /** Raw value, used for the pill tone. */
  statusKey: string;
  publishedAt: string;
  createdAt: string;
  author: string;
}

export interface RegistrationRow {
  /** Full local timestamp — the printout must never hide the time. */
  date: string;
  name: string;
  role: string;
  email: string;
}

export interface AdminReportData {
  period: ReportPeriod;
  totals: {
    users: string;
    patients: string;
    doctors: string;
    appointments: string;
    /** Appointments booked inside the reporting period. */
    periodAppointments: string;
    /** Emergency appointments (`appointment_type = EMERGENCY`) in the period. */
    periodEmergencies: string;
    /** Accounts created inside the reporting period. */
    newAccounts: string;
    /** Visits closed as `done` inside the period. */
    completedAppointments: string;
    /** Patients who checked into the waiting room inside the period. */
    checkedIn: string;
    /** Health tips (blog articles) on the platform, all time. */
    healthTips: string;
    /** Health tips published, all time. */
    publishedHealthTips: string;
    /** Health tips created inside the reporting period. */
    periodHealthTips: string;
  };
  statusBreakdown: StatusBreakdownRow[];
  /** Emergency requests by lifecycle status (all statuses listed). */
  emergencyBreakdown: StatusBreakdownRow[];
  doctorActivity: DoctorActivityRow[];
  dailyVolume: DailyVolumeRow[];
  /** Emergency requests per day — empty when the period is too long. */
  dailyEmergencies: DailyEmergencyRow[];
  dailyRegistrations: DailyAccountRow[];
  newAccountsByRole: RoleBreakdownRow[];
  registrations: RegistrationRow[];
  /** Health tips created in the period, newest first (capped at 40 rows). */
  healthTipsPeriod: HealthTipRow[];
  /** True when the health-tip list hit the row cap (the totals still count every tip). */
  healthTipsTruncated: boolean;
  /** True when the period was too long for a per-day table. */
  dailyVolumeTruncated: boolean;
  /** True when the registration list hit the row cap (the totals still count every account). */
  registrationsTruncated: boolean;
}

const pct = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "0.0%";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2026-10-03" → "03 Oct 2026" for a compact table column. */
function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

/** "2026-10-03" → "Saturday 03 Oct 2026". */
function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${shortDate(iso)}`;
}

export async function collectAdminReport(query: PeriodQuery = {}): Promise<AdminReportData> {
  const period = resolvePeriod(query);
  const appointmentRange = dateColumnRange(period);
  const accountRange = timestampRange(period);

  const [
    users,
    patients,
    doctors,
    appointments,
    inPeriod,
    emergencyRows,
    recentUsers,
    accountRows,
    healthTips,
    publishedHealthTips,
    periodHealthTips,
    periodTipRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "patient" } }),
    prisma.doctor.count(),
    prisma.appointment.count(),
    prisma.appointment.findMany({
      where: { appointment_date: appointmentRange },
      select: {
        appointment_date: true,
        status: true,
        checked_in_at: true,
        doctor_id: true,
      },
    }),
    prisma.appointment.findMany({
      where: { appointment_type: "EMERGENCY", appointment_date: appointmentRange },
      select: { appointment_date: true, status: true },
    }),
    prisma.user.findMany({
      where: { created_at: accountRange },
      orderBy: { created_at: "desc" },
      take: REGISTRATION_ROWS,
      select: {
        first_name: true,
        last_name: true,
        username: true,
        email: true,
        role: true,
        created_at: true,
      },
    }),
    // Uncapped (date + role only) — the per-day and per-role tables must count
    // every account even when the registration list below is capped.
    prisma.user.findMany({
      where: { created_at: accountRange },
      orderBy: { created_at: "desc" },
      select: { created_at: true, role: true },
    }),
    prisma.article.count(),
    prisma.article.count({ where: { published: true } }),
    prisma.article.count({ where: { created_at: accountRange } }),
    // Capped detail rows for the health-tip table (the count above stays exact).
    prisma.article.findMany({
      where: { created_at: accountRange },
      orderBy: { created_at: "desc" },
      take: HEALTH_TIP_ROWS,
      select: {
        title: true,
        category: true,
        published: true,
        published_at: true,
        created_at: true,
        author: { select: { first_name: true, last_name: true, username: true, email: true } },
      },
    }),
  ]);

  /* --------------------------- status breakdown -------------------------- */
  const byStatus = new Map<string, number>();
  const byDay = new Map<string, { total: number; completed: number }>();
  const byDoctor = new Map<number, { total: number; completed: number }>();
  let completed = 0;
  let checkedIn = 0;

  for (const appointment of inPeriod) {
    byStatus.set(appointment.status, (byStatus.get(appointment.status) ?? 0) + 1);
    const isDone = appointment.status === "done";
    if (isDone) completed += 1;
    if (appointment.checked_in_at) checkedIn += 1;

    const dayKey = appointment.appointment_date.toISOString().slice(0, 10);
    const day = byDay.get(dayKey) ?? { total: 0, completed: 0 };
    day.total += 1;
    if (isDone) day.completed += 1;
    byDay.set(dayKey, day);

    const doctor = byDoctor.get(appointment.doctor_id) ?? { total: 0, completed: 0 };
    doctor.total += 1;
    if (isDone) doctor.completed += 1;
    byDoctor.set(appointment.doctor_id, doctor);
  }

  const statusBreakdown: StatusBreakdownRow[] = [...byStatus.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status,
      label: statusLabel(status),
      count: formatCount(count),
      share: pct(count, inPeriod.length),
    }));

  /* ------------------------------ emergencies ---------------------------- */
  const emergencyByStatus = new Map<string, number>();
  const emergencyByDay = new Map<string, { requests: number; completed: number }>();
  for (const request of emergencyRows) {
    emergencyByStatus.set(
      request.status,
      (emergencyByStatus.get(request.status) ?? 0) + 1
    );
    const dayKey = request.appointment_date.toISOString().slice(0, 10);
    const day = emergencyByDay.get(dayKey) ?? { requests: 0, completed: 0 };
    day.requests += 1;
    if (request.status === "done") day.completed += 1;
    emergencyByDay.set(dayKey, day);
  }

  // Every lifecycle status is listed (with zeros) once an emergency has been
  // requested in the period, so an administrator always sees the full state.
  const emergencyBreakdown: StatusBreakdownRow[] =
    emergencyRows.length === 0
      ? []
      : EMERGENCY_STATUSES.map((status) => {
          const count = emergencyByStatus.get(status) ?? 0;
          return {
            status,
            label: statusLabel(status),
            count: formatCount(count),
            share: pct(count, emergencyRows.length),
          };
        });

  /* ------------------------------ top doctors ---------------------------- */
  const topIds = [...byDoctor.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, TOP_DOCTORS)
    .map(([doctorId]) => doctorId);

  const doctorProfiles = await prisma.doctor.findMany({
    where: { id: { in: topIds } },
    select: {
      id: true,
      user: { select: { first_name: true, last_name: true, username: true, email: true } },
      specialties: { select: { specialty: { select: { name: true } } } },
    },
  });
  const profileById = new Map(doctorProfiles.map((profile) => [profile.id, profile]));

  const doctorActivity: DoctorActivityRow[] = topIds.map((doctorId) => {
    const profile = profileById.get(doctorId);
    const counts = byDoctor.get(doctorId) ?? { total: 0, completed: 0 };
    const name = profile
      ? [profile.user.first_name, profile.user.last_name].filter(Boolean).join(" ") ||
        profile.user.username ||
        profile.user.email ||
        `Doctor #${doctorId}`
      : `Doctor #${doctorId}`;
    return {
      name,
      specialty:
        profile?.specialties.map((entry) => entry.specialty.name).join(", ") || "Not provided",
      appointments: formatCount(counts.total),
      completed: formatCount(counts.completed),
    };
  });

  /* ------------------------------ daily volume --------------------------- */
  const spanDays =
    Math.round(
      (Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 86_400_000
    ) + 1;
  const dailyVolumeTruncated = spanDays > MAX_DAILY_DAYS;
  const dailyVolume: DailyVolumeRow[] = dailyVolumeTruncated
    ? []
    : [...byDay.keys()]
        .sort()
        .map((key) => ({
          date: shortDate(key),
          day: dayLabel(key),
          appointments: formatCount(byDay.get(key)!.total),
          completed: formatCount(byDay.get(key)!.completed),
        }));

  const dailyEmergencies: DailyEmergencyRow[] = dailyVolumeTruncated
    ? []
    : [...emergencyByDay.keys()]
        .sort()
        .map((key) => ({
          date: shortDate(key),
          day: dayLabel(key),
          requests: formatCount(emergencyByDay.get(key)!.requests),
          completed: formatCount(emergencyByDay.get(key)!.completed),
        }));

  /* ----------------------------- registrations --------------------------- */
  const registrations: RegistrationRow[] = recentUsers.map((user) => ({
    date: formatDateTime(user.created_at),
    name:
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.username ||
      user.email,
    role: statusLabel(user.role),
    email: user.email,
  }));
  const registrationsTruncated = recentUsers.length < accountRows.length;

  /* ------------------------------ health tips ---------------------------- */
  const healthTipsPeriod: HealthTipRow[] = periodTipRows.map((tip) => ({
    title: tip.title,
    category: statusLabel(tip.category),
    status: tip.published ? "Published" : "Draft",
    statusKey: tip.published ? "published" : "draft",
    publishedAt: tip.published_at ? formatDateTime(tip.published_at) : "Not published",
    createdAt: formatDateTime(tip.created_at),
    author: tip.author
      ? [tip.author.first_name, tip.author.last_name].filter(Boolean).join(" ") ||
        tip.author.username ||
        tip.author.email
      : "Not provided",
  }));
  const healthTipsTruncated = periodTipRows.length < periodHealthTips;

  const byRole = new Map<string, number>();
  const byAccountDay = new Map<string, number>();
  for (const account of accountRows) {
    byRole.set(account.role, (byRole.get(account.role) ?? 0) + 1);
    const dayKey = isoDayInTimezone(account.created_at);
    if (dayKey) byAccountDay.set(dayKey, (byAccountDay.get(dayKey) ?? 0) + 1);
  }

  const newAccountsByRole: RoleBreakdownRow[] =
    accountRows.length === 0
      ? []
      : ACCOUNT_ROLES.map((role) => {
          const count = byRole.get(role) ?? 0;
          return {
            role: statusLabel(role),
            count: formatCount(count),
            share: pct(count, accountRows.length),
          };
        });

  const dailyRegistrations: DailyAccountRow[] = dailyVolumeTruncated
    ? []
    : [...byAccountDay.keys()]
        .sort()
        .map((key) => ({
          date: shortDate(key),
          day: dayLabel(key),
          accounts: formatCount(byAccountDay.get(key)!),
        }));

  return {
    period,
    totals: {
      users: formatCount(users),
      patients: formatCount(patients),
      doctors: formatCount(doctors),
      appointments: formatCount(appointments),
      periodAppointments: formatCount(inPeriod.length),
      periodEmergencies: formatCount(emergencyRows.length),
      newAccounts: formatCount(accountRows.length),
      completedAppointments: formatCount(completed),
      checkedIn: formatCount(checkedIn),
      healthTips: formatCount(healthTips),
      publishedHealthTips: formatCount(publishedHealthTips),
      periodHealthTips: formatCount(periodHealthTips),
    },
    statusBreakdown,
    emergencyBreakdown,
    doctorActivity,
    dailyVolume,
    dailyEmergencies,
    dailyRegistrations,
    newAccountsByRole,
    registrations,
    healthTipsPeriod,
    healthTipsTruncated,
    dailyVolumeTruncated,
    registrationsTruncated,
  };
}

