/** Admin repository — audit events + platform aggregates (reports/views.py). */
import { prisma } from "@/lib/db";

export const recordAudit = (actorId: number | null, action: string, target = "", detail = "") =>
  prisma.auditEvent.create({ data: { actor_id: actorId, action, target, detail } });

export const listAuditEvents = (take = 50) =>
  prisma.auditEvent.findMany({
    include: { actor: true },
    orderBy: { created_at: "desc" },
    take,
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

/** Earnings dashboard helpers (EarningsDashboardView). */
export const earningsCounts = (doctorId: number, ranges: { from?: Date; to?: Date }) =>
  prisma.appointment.count({
    where: {
      doctor_id: doctorId,
      status: "completed",
      ...(ranges.from || ranges.to
        ? {
            appointment_date: {
              ...(ranges.from ? { gte: ranges.from } : {}),
              ...(ranges.to ? { lte: ranges.to } : {}),
            },
          }
        : {}),
    },
  });

export const earningsDaily = (doctorId: number, from: Date, to: Date) =>
  prisma.appointment.groupBy({
    by: ["appointment_date"],
    where: { doctor_id: doctorId, status: "completed", appointment_date: { gte: from, lte: to } },
    _count: { _all: true },
    orderBy: { appointment_date: "asc" },
  });
