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
