/**
 * Patient medical report data (§34 family 3) — the signed-in patient's own
 * chart for a reporting period, built exclusively from rows owned by them.
 */
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { collectClinicalHistory, type ClinicalHistory } from "./clinical";
import { isoDayInTimezone } from "./format";
import { buildPatientSummary, type PatientUserRow } from "./people";
import {
  fullRecordPeriod,
  hasExplicitPeriod,
  resolvePeriod,
  type PeriodQuery,
  type ReportPeriod,
} from "./period";

export interface PatientReportData {
  period: ReportPeriod;
  patient: ReturnType<typeof buildPatientSummary>;
  history: ClinicalHistory;
  counts: {
    appointments: string;
    treatments: string;
    prescriptions: string;
    vitals: string;
    labs: string;
    records: string;
  };
}

const count = (value: number): string => value.toLocaleString("en-GB");

/**
 * Build the patient's own report.
 *
 * `userId` is ALWAYS the authenticated patient — the query string may scope the
 * period but can never name a different chart.
 */
export async function collectPatientReport(
  userId: number,
  query: PeriodQuery = {}
): Promise<PatientReportData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { patient: true },
  });
  if (!user || user.role !== "patient") throw notFound();

  const period = hasExplicitPeriod(query)
    ? resolvePeriod(query)
    : fullRecordPeriod(isoDayInTimezone(user.created_at));

  const history = await collectClinicalHistory({ period, patientId: user.id });

  return {
    period,
    patient: buildPatientSummary(user as PatientUserRow),
    history,
    counts: {
      appointments: count(history.appointments.length),
      treatments: count(history.treatments.length),
      prescriptions: count(history.prescriptions.length),
      vitals: count(history.vitals.length),
      labs: count(history.labs.length),
      records: count(history.records.length),
    },
  };
}
