import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brain, CalendarClock, CheckCircle2, Clock3, Download, FileText, UserRound } from "lucide-react";
import { apiGet } from "../api/client";
import { downloadPsychotherapyReport, viewPsychotherapyReport } from "../api/reports";
import { Card, Button, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "pending" },
  assigned: { label: "Pending", tone: "pending" },
  accepted: { label: "Accepted", tone: "accepted" },
  in_progress: { label: "Session started", tone: "in_progress" },
  follow_up: { label: "Follow-up session", tone: "in_progress" },
  completed: { label: "Done", tone: "completed" },
};

const SESSION_STATUS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
};

export function PsychotherapyScreen() {
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
      setError(e?.message || "Unable to load psychology service.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function viewReport(id: number) {
    try { await viewPsychotherapyReport(id); }
    catch (e: any) { notify("error", e?.message || "Failed to open report."); }
  }
  async function downloadReport(id: number) {
    try { await downloadPsychotherapyReport(id); }
    catch (e: any) { notify("error", e?.message || "Failed to download report."); }
  }

  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => void load()} /></div>;

  return (
    <div className="page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Psychology service</p>
          <h1>My psychology service</h1>
          <p>Track your psychology service request and sessions.</p>
        </div>
        <Link to="/psychotherapy/request"><Button>Request Therapy session</Button></Link>
      </div>

      {items.length === 0 && (
        <EmptyState title="No psychology service requests" description="Request a psychology service session to get started." />
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
                  <span className="psych-case-card__eyebrow">Psychology service case</span>
                  <h2>Case #{r.id}</h2>
                </div>
              </div>
              <span className={`psych-case-status psych-case-status--${st.tone}`}>{st.label}</span>
            </div>

            <div className="psych-case-people">
              <div className="psych-case-person">
                <span className="psych-case-person__icon"><UserRound size={16} /></span>
                <div><small>Patient</small><strong>{r.patient?.first_name} {r.patient?.last_name}</strong></div>
              </div>
              {r.doctor && (
                <div className="psych-case-person">
                  <span className="psych-case-person__icon"><Brain size={16} /></span>
                  <div><small>Psychologist</small><strong>{r.doctor.user.first_name} {r.doctor.user.last_name}</strong></div>
                </div>
              )}
            </div>

            <div className="psych-plan-summary">
              <div className="psych-section-heading"><span><CalendarClock size={18} /></span><div><h3>Request details</h3><p>Your submitted request and plan</p></div></div>
              <div className="psych-plan-summary__grid">
                <div><small>Mode</small><strong>{r.session_mode === "in_person" ? "In person" : "Online"}</strong></div>
                <div><small>Urgency</small><strong>{r.urgency}</strong></div>
                <div><small>Preferred start</small><strong>{String(r.preferred_start_date).slice(0, 10)}</strong></div>
                <div><small>Language</small><strong>{r.language_preference}</strong></div>
                <div><small>Gender preference</small><strong>{r.gender_preference}</strong></div>
                {r.notes && <div><small>Your request notes</small><strong>{r.notes}</strong></div>}
                <div><small>Sessions completed</small><strong>{completedSessions} of {totalSessions}</strong></div>
                {r.plan_start_time && <div><small>Current session time</small><strong>{r.plan_start_time.slice(0, 5)}</strong></div>}
                {r.plan_followup_time && <div><small>Follow-up session time</small><strong>{r.plan_followup_time.slice(0, 5)}</strong></div>}
                {r.plan_session_duration && <div><small>Session length</small><strong>{r.plan_session_duration} min</strong></div>}
                {r.plan_total_sessions && <div><small>Planned sessions</small><strong>{r.plan_total_sessions}</strong></div>}
                {r.plan_start_date && <div><small>Current session</small><strong>{String(r.plan_start_date).slice(0, 10)} · {r.plan_start_time?.slice(0, 5)}</strong></div>}
                {r.plan_followup_date && <div><small>Follow-up session</small><strong>{String(r.plan_followup_date).slice(0, 10)} · {r.plan_followup_time?.slice(0, 5)}</strong></div>}
              </div>
              {r.plan_goals && <div className="psych-plan-summary__goals"><small>Goals</small><p>{r.plan_goals}</p></div>}
            </div>

            {r.sessions?.length > 0 && (
              <div className="psych-case-section">
                <div className="psych-section-heading"><span><Clock3 size={18} /></span><div><h3>Sessions</h3><p>{completedSessions} of {r.sessions.length} completed</p></div></div>
                {r.sessions.map((s: any) => {
                  const ss = SESSION_STATUS[s.status] ?? s.status;
                  return (
                    <Card key={s.id} className={`psych-session-card psych-session-card--${s.status === "completed" ? "completed" : s.status === "in_progress" ? "in_progress" : "pending"}`}>
                      <div className="psych-session-card__head">
                        <strong>Session {s.session_number}</strong>
                        <span className={`psych-case-status psych-case-status--${s.status === "completed" ? "completed" : s.status === "in_progress" ? "in_progress" : "pending"}`}>{ss}</span>
                      </div>
                      <p className="psych-session-card__time">{String(s.scheduled_date).slice(0, 10)} · {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)} · {s.duration_minutes} min</p>
                    </Card>
                  );
                })}
              </div>
            )}

            {r.status === "completed" && (
              <div className="psych-case-actions">
                <Button variant="secondary" onClick={() => void viewReport(r.id)}><FileText size={16} /> View report</Button>
                <Button variant="secondary" onClick={() => void downloadReport(r.id)}><Download size={16} /> Download report</Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}