import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { downloadPsychotherapyReport, viewPsychotherapyReport } from "../api/reports";
import { Card, Button, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#d97706", bg: "#fef3c7" },
  assigned: { label: "Pending", color: "#d97706", bg: "#fef3c7" },
  accepted: { label: "Accepted", color: "#0a9f94", bg: "#e4f8f5" },
  in_progress: { label: "Session started", color: "#2563eb", bg: "#dbeafe" },
  follow_up: { label: "Follow-up session", color: "#7c3aed", bg: "#ede9fe" },
  completed: { label: "Done", color: "#059669", bg: "#d1fae5" },
};

const SESSION_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Scheduled", color: "#0a9f94", bg: "#e4f8f5" },
  in_progress: { label: "In progress", color: "#2563eb", bg: "#dbeafe" },
  completed: { label: "Completed", color: "#059669", bg: "#d1fae5" },
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
        const st = STATUS[r.status] ?? { label: r.status, color: "#6b7280", bg: "#f3f4f6" };
        return (
          <Card key={r.id} className="patient-appt-card" style={{ marginBottom: 16 }}>
            <div className="patient-appt-card__accent" style={{ background: st.color }} />
            <div className="patient-appt-card__content">
              <div className="patient-appt-card__top">
                <div className="patient-appt-card__info">
                  <div className="patient-appt-card__doctor">
                    Psychology service #{r.id}
                  </div>
                  <div className="patient-appt-card__time">
                    {r.doctor ? `Psychologist: ${r.doctor.user.first_name} ${r.doctor.user.last_name}` : "Awaiting assignment"}
                  </div>
                  <span
                    className="patient-appt-card__status"
                    style={{ color: st.color, background: st.bg }}
                  >
                    {st.label}
                  </span>
                </div>
              </div>

              <div className="appt-detail__field"><span className="appt-detail__label">Mode</span><span>{r.session_mode === "in_person" ? "In person" : "Online"}</span></div>
              <div className="appt-detail__field"><span className="appt-detail__label">Urgency</span><span>{r.urgency}</span></div>
              <div className="appt-detail__field"><span className="appt-detail__label">Preferred start</span><span>{String(r.preferred_start_date).slice(0, 10)}</span></div>
              {r.plan_approach && <div className="appt-detail__field"><span className="appt-detail__label">Approach</span><span>{r.plan_approach}</span></div>}
              {r.plan_goals && <div className="appt-detail__field"><span className="appt-detail__label">Goals</span><span>{r.plan_goals}</span></div>}
              {r.plan_frequency && <div className="appt-detail__field"><span className="appt-detail__label">Frequency</span><span>{r.plan_frequency}</span></div>}
              {r.plan_session_duration && <div className="appt-detail__field"><span className="appt-detail__label">Session duration</span><span>{r.plan_session_duration} min</span></div>}
              {r.plan_total_sessions && <div className="appt-detail__field"><span className="appt-detail__label">Planned sessions</span><span>{r.plan_total_sessions}</span></div>}
              {r.plan_start_date && <div className="appt-detail__field"><span className="appt-detail__label">Plan start</span><span>{String(r.plan_start_date).slice(0, 10)} {r.plan_start_time?.slice(0, 5)}</span></div>}
              {r.plan_review_after && <div className="appt-detail__field"><span className="appt-detail__label">Review after</span><span>{r.plan_review_after} session(s)</span></div>}

              {r.sessions?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <h4 style={{ marginBottom: 8 }}>Sessions</h4>
                  {r.sessions.map((s: any) => {
                    const ss = SESSION_STATUS[s.status] ?? { label: s.status, color: "#6b7280", bg: "#f3f4f6" };
                    return (
                      <div key={s.id} className="patient-appt-card" style={{ marginBottom: 8 }}>
                        <div className="patient-appt-card__accent" style={{ background: ss.color }} />
                        <div className="patient-appt-card__content">
                          <div className="patient-appt-card__top">
                            <div className="patient-appt-card__info">
                              <div className="patient-appt-card__doctor">Session #{s.session_number}</div>
                              <div className="patient-appt-card__time">{String(s.scheduled_date).slice(0, 10)} {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</div>
                              <span className="patient-appt-card__status" style={{ color: ss.color, background: ss.bg }}>{ss.label}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {r.status === "completed" && (
                <div className="patient-appt-card__footer" style={{ marginTop: 12 }}>
                  <Button variant="secondary" onClick={() => void viewReport(r.id)}>View report</Button>
                  <Button variant="secondary" onClick={() => void downloadReport(r.id)}>Download report</Button>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}