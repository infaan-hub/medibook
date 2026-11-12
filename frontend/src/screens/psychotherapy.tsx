import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Brain, CalendarClock, CheckCircle2, Clock3, Download, FileText, UserRound } from "lucide-react";
import { apiGet } from "../api/client";
import { downloadPsychotherapyReport, viewPsychotherapyReport } from "../api/reports";
import { Card, Button, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";

const STATUS: Record<string, { labelKey: string; tone: string }> = {
  pending: { labelKey: "psychotherapy.statusPending", tone: "pending" },
  assigned: { labelKey: "psychotherapy.statusAssigned", tone: "pending" },
  accepted: { labelKey: "psychotherapy.statusAccepted", tone: "accepted" },
  in_progress: { labelKey: "psychotherapy.statusInProgress", tone: "in_progress" },
  follow_up: { labelKey: "psychotherapy.statusFollowUp", tone: "in_progress" },
  completed: { labelKey: "psychotherapy.statusCompleted", tone: "completed" },
  expired: { labelKey: "psychotherapy.statusExpired", tone: "expired" },
};

const SESSION_STATUS: Record<string, string> = {
  scheduled: "psychotherapy.sessionScheduled",
  in_progress: "psychotherapy.sessionInProgress",
  completed: "psychotherapy.sessionCompleted",
  expired: "psychotherapy.sessionExpired",
};

export function PsychotherapyScreen() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiGet<any[]>("/psychotherapy");
      setItems(res.data ?? []);
    } catch (e: any) {
      setError(e?.message || t("psychotherapy.unableToLoad"));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function viewReport(id: number) {
    try { await viewPsychotherapyReport(id); }
    catch (e: any) { notify("error", e?.message || t("psychotherapy.failedToOpenReport")); }
  }
  async function downloadReport(id: number) {
    try { await downloadPsychotherapyReport(id); }
    catch (e: any) { notify("error", e?.message || t("psychotherapy.failedToDownloadReport")); }
  }

  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => void load()} /></div>;

  return (
    <div className="page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">{t("psychotherapy.service")}</p>
          <h1>{t("psychotherapy.myService")}</h1>
          <p>{t("psychotherapy.track")}</p>
        </div>
        <Link to="/psychotherapy/request"><Button>{t("psychotherapy.requestTherapy")}</Button></Link>
      </div>

      {items.length === 0 && (
        <EmptyState title={t("psychotherapy.noRequests")} description={t("psychotherapy.noRequestsDesc")} />
      )}

      {items.map((r) => {
        const st = STATUS[r.status] ?? { label: r.status, tone: "pending" };
        const completedSessions = r.sessions?.filter((s: any) => s.status === "completed").length ?? 0;
        const totalSessions = r.sessions?.length ?? r.plan_total_sessions ?? 0;
        return (
          <Card key={r.id} className="psych-case-card">
            <div className="psych-case-card__head">
              <div className="psych-case-card__title">
                <span className="psych-case-card__icon"><Brain size={20} /></span>
                <div>
                  <span className="psych-case-card__eyebrow">{t("psychotherapy.case")}</span>
                  <h2>Case #{r.id}</h2>
                </div>
              </div>
              <span className={`psych-case-status psych-case-status--${st.tone}`}>{t(st.labelKey)}</span>
            </div>

            {r.status === "expired" && (
              <div className="psych-plan-summary">
                <div className="psych-plan-summary__goals">
                  <small>{t("psychotherapy.sessionExpired")}</small>
                  <p>
                    This psychology service request expired because a scheduled
                    session was not started in time. Please request a new
                    psychology service session.{" "}
                    <Link to="/psychotherapy/request" style={{ fontWeight: 600 }}>
                      {t("psychotherapy.requestAgain")}
                    </Link>
                  </p>
                </div>
              </div>
            )}

            <div className="psych-case-people">
              <div className="psych-case-person">
                <span className="psych-case-person__icon"><UserRound size={16} /></span>
                <div><small>{t("psychotherapy.patient")}</small><strong>{r.patient?.first_name} {r.patient?.last_name}</strong></div>
              </div>
              {r.doctor && (
                <div className="psych-case-person">
                  <span className="psych-case-person__icon"><Brain size={16} /></span>
                  <div><small>{t("psychotherapy.psychologist")}</small><strong>{r.doctor.user.first_name} {r.doctor.user.last_name}</strong></div>
                </div>
              )}
            </div>

            <div className="psych-plan-summary">
              <div className="psych-section-heading"><span><CalendarClock size={18} /></span><div><h3>{t("psychotherapy.requestDetails")}</h3><p>{t("psychotherapy.yourSubmittedRequest")}</p></div></div>
              <div className="psych-plan-summary__grid">
                <div><small>{t("psychotherapy.mode")}</small><strong>{r.session_mode === "in_person" ? t("psychotherapy.inPerson") : t("psychotherapy.online")}</strong></div>
                <div><small>{t("psychotherapy.urgency")}</small><strong>{r.urgency}</strong></div>
                <div><small>{t("psychotherapy.preferredStart")}</small><strong>{String(r.preferred_start_date).slice(0, 10)}</strong></div>
                <div><small>{t("psychotherapy.language")}</small><strong>{r.language_preference}</strong></div>
                <div><small>{t("psychotherapy.genderPreference")}</small><strong>{r.gender_preference}</strong></div>
                {r.notes && <div><small>{t("psychotherapy.requestNotes")}</small><strong>{r.notes}</strong></div>}
                <div><small>{t("psychotherapy.sessionsCompleted")}</small><strong>{completedSessions} of {totalSessions}</strong></div>
                {r.plan_start_time && <div><small>{t("psychotherapy.currentSessionTime")}</small><strong>{r.plan_start_time.slice(0, 5)}</strong></div>}
                {r.plan_followup_time && <div><small>{t("psychotherapy.followUpSessionTime")}</small><strong>{r.plan_followup_time.slice(0, 5)}</strong></div>}
                {r.plan_session_duration && <div><small>{t("psychotherapy.sessionLength")}</small><strong>{r.plan_session_duration} {t("psychotherapy.min")}</strong></div>}
                {r.plan_total_sessions && <div><small>{t("psychotherapy.plannedSessions")}</small><strong>{r.plan_total_sessions}</strong></div>}
                {r.plan_start_date && <div><small>{t("psychotherapy.currentSession")}</small><strong>{String(r.plan_start_date).slice(0, 10)} · {r.plan_start_time?.slice(0, 5)}</strong></div>}
                {r.plan_followup_date && <div><small>{t("psychotherapy.followUpSession")}</small><strong>{String(r.plan_followup_date).slice(0, 10)} · {r.plan_followup_time?.slice(0, 5)}</strong></div>}
              </div>
              {r.plan_goals && <div className="psych-plan-summary__goals"><small>{t("psychotherapy.goals")}</small><p>{r.plan_goals}</p></div>}
            </div>

            {r.sessions?.length > 0 && (
              <div className="psych-case-section">
                <div className="psych-section-heading"><span><Clock3 size={18} /></span><div><h3>{t("psychotherapy.sessions")}</h3><p>{completedSessions} of {r.sessions.length} {t("psychotherapy.completed")}</p></div></div>
                {r.sessions.map((s: any) => {
                  const ss = SESSION_STATUS[s.status] ?? s.status;
                  return (
                    <Card key={s.id} className={`psych-session-card psych-session-card--${s.status}`}>
                      <div className="psych-session-card__head">
                        <strong>{t("psychotherapy.session")} {s.session_number}</strong>
                        <span className={`psych-case-status psych-case-status--${s.status}`}>{t(ss)}</span>
                      </div>
                      <p className="psych-session-card__time">{String(s.scheduled_date).slice(0, 10)} · {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)} · {s.duration_minutes} min</p>
                    </Card>
                  );
                })}
              </div>
            )}

            {r.status === "completed" && (
              <div className="psych-case-actions">
                <Button variant="secondary" onClick={() => void viewReport(r.id)}><FileText size={16} /> {t("psychotherapy.viewReport")}</Button>
                <Button variant="secondary" onClick={() => void downloadReport(r.id)}><Download size={16} /> {t("psychotherapy.downloadReport")}</Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}