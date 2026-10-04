/** Admin repository — audit events + platform aggregates (reports/views.py). */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const recordAudit = (actorId: number | null, action: string, target = "", detail = "") =>
  prisma.auditEvent.create({ data: { actor_id: actorId, action, target, detail } });

export interface AuditFilters {
  search?: string | null;
  /** Comma-separated action prefixes (`auth.`, `appointment.` …). */
  action?: string | null;
  actor?: number | null;
  from?: string | null;
  to?: string | null;
}

/** Builds the WHERE for the audit list — filters OR across search fields. */
export function auditWhere(filters: AuditFilters, forcedActorId?: number | null): Prisma.AuditEventWhereInput {
  const clauses: Prisma.AuditEventWhereInput[] = [];

  const actorId = forcedActorId ?? filters.actor ?? null;
  if (actorId) clauses.push({ actor_id: actorId });

  const prefixes = (filters.action ?? "")
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);
  if (prefixes.length === 1) clauses.push({ action: { startsWith: prefixes[0] } });
  else if (prefixes.length > 1) clauses.push({ OR: prefixes.map((prefix) => ({ action: { startsWith: prefix } })) });

  const search = (filters.search ?? "").trim();
  if (search) {
    clauses.push({
      OR: [
        { action: { contains: search, mode: "insensitive" } },
        { target: { contains: search, mode: "insensitive" } },
        { detail: { contains: search, mode: "insensitive" } },
        {
          actor: {
            OR: [
              { first_name: { contains: search, mode: "insensitive" } },
              { last_name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { username: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  if (filters.from) {
    const from = new Date(filters.from);
    if (!Number.isNaN(from.valueOf())) clauses.push({ created_at: { gte: from } });
  }
  if (filters.to) {
    const to = new Date(filters.to);
    if (!Number.isNaN(to.valueOf())) {
      to.setHours(23, 59, 59, 999);
      clauses.push({ created_at: { lte: to } });
    }
  }

  return clauses.length === 0 ? {} : { AND: clauses };
}

export const countAuditEvents = (where: Prisma.AuditEventWhereInput) =>
  prisma.auditEvent.count({ where });

export const findAuditEvents = (where: Prisma.AuditEventWhereInput, skip: number, take: number) =>
  prisma.auditEvent.findMany({
    where,
    include: { actor: true },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    skip,
    ...(take > 0 ? { take } : {}),
  });

/** AdminStatsView: single-pass user + appointment aggregates. */
export async function platformStats() {
  const [totalUsers, patients, totalAppointments, doctors, byStatus] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "patient" } }),
    prisma.appointment.count(),
    prisma.doctor.count(),
    prisma.appointment.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const appointmentsByStatus: Record<string, number> = {};
  for (const row of byStatus) appointmentsByStatus[row.status] = row._count._all;
  return {
    users: totalUsers,
    patients,
    doctors,
    appointments: totalAppointments,
    appointments_by_status: appointmentsByStatus,
  };
}
