import { useEffect, useState } from "react";
import { Ban, CalendarClock, CheckCircle2, Download, FileText, Play } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { downloadTrainingReport, viewTrainingReport } from "../api/reports";
import { Card, Button, TextField, EmptyState, Skeleton, ErrorState } from "../components/ui";

/**
 * Training status → the same visual language as doctor appointment cards:
 * a coloured status dot/label, a `.badge`, a card accent and a mapped badge
 * class (`completed` shares the green "done" treatment).
 */
const STATUS: Record<
  string,
  { label: string; card: string; tone: string; badge: string; text: string }
> = {
  pending: {
    label: "Pending",
    card: "pending",
    tone: "var(--color-status-pending)",
    badge: "badge--pending",
    text: "#16191e",
  },
  accepted: {
    label: "Accepted",
    card: "accepted",
    tone: "var(--color-status-accepted)",
    badge: "badge--accepted",
    text: "#ffffff",
  },
  scheduled: {
    label: "Scheduled",
    card: "accepted",
    tone: "var(--color-status-accepted)",
    badge: "badge--accepted",
    text: "#ffffff",
  },
  in_progress: {
    label: "In progress",
    card: "in_progress",
    tone: "var(--color-status-in-progress)",
    badge: "badge--in_progress",
    text: "#16191e",
  },
  completed: {
    label: "Completed",
    card: "done",
    tone: "var(--color-status-done)",
    badge: "badge--done",
    text: "#ffffff",
  },
  cancelled: {
    label: "Cancelled",
    card: "cancelled",
    tone: "var(--color-status-cancelled)",
    badge: "badge--cancelled",
    text: "#ffffff",
  },
};

const statusOf = (status: string) => STATUS[status] ?? STATUS.pending;

/** Stored date/ISO timestamp → "Mon, 9 Nov 2026" (calendar date, never shifted). */
function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const day = String(value).slice(0, 10);
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DoctorTrainingScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [challenge, setChallenge] = useState("");
  const [saving, setSaving] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newDays, setNewDays] = useState(1);
  const [reporting, setReporting] = useState<number | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/training/");
      setItems(res.data ?? []);
    } catch (e: any) { setError(e?.message || "Failed."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  // Keep a running session reachable after a refresh: adopt the training's
  // in-progress session when the page did not start it in this tab.
  useEffect(() => {
    if (sessionId !== null) return;
    const running = items
      .flatMap((training) => training.sessions ?? [])
      .find((session: any) => session.status === "in_progress");
    if (running) setSessionId(running.id);
  }, [items, sessionId]);

  async function start(training: any, session: any) {
    setSaving(true);
    try {
      await apiPost(`/training/?action=start-session&id=${training.id}`, { session_id: session.id });
      setSessionId(session.id);
      setQuestion(""); setChallenge("");
      await load();
    } catch (e: any) { alert(e?.message); }
    finally { setSaving(false); }
  }

  async function saveQuestion() {
    if (!sessionId) return;
    setSaving(true);
    try {
      await apiPost("/training/?action=add-question", { session_id: sessionId, question, challenge });
      setQuestion(""); setChallenge("");
      await load();
    } catch (e: any) { alert(e?.message); }
    finally { setSaving(false); }
  }

  async function next(trainingId: number) {
    if (!sessionId) return;
    setSaving(true);
    try {
      await apiPost(`/training/?action=next-session&id=${trainingId}`, { session_id: sessionId });
      setSessionId(null);
      await load();
    } catch (e: any) { alert(e?.message); }
    finally { setSaving(false); }
  }

  async function done(trainingId: number) {
    if (!sessionId) return;
    setSaving(true);
    try {
      await apiPost(`/training/?action=complete&id=${trainingId}`, { session_id: sessionId });
      setSessionId(null);
      await load();
    } catch (e: any) { alert(e?.message); }
    finally { setSaving(false); }
  }

  async function cancel(t: any) {
    if (!confirm("Cancel this training?")) return;
    setSaving(true);
    try {
      await apiPost(`/training/?action=cancel&id=${t.id}`, {});
      await load();
    } catch (e: any) { alert(e?.message); }
    finally { setSaving(false); }
  }

  async function reschedule(t: any) {
    if (!newDate) { alert("Select a new date"); return; }
    setSaving(true);
    try {
      await apiPost(`/training/?action=reschedule&id=${t.id}`, { preferred_start_date: newDate, preferred_days: newDays });
      setRescheduleId(null); setNewDate(""); setNewDays(1);
      await load();
    } catch (e: any) { alert(e?.message); }
    finally { setSaving(false); }
  }

  function toggleReschedule(t: any) {
    if (rescheduleId === t.id) {
      setRescheduleId(null);
      return;
    }
    setRescheduleId(t.id);
    setNewDate(String(t.preferred_start_date ?? "").slice(0, 10));
    setNewDays(Number(t.preferred_days) || 1);
  }

  async function downloadReport(t: any) {
    setReporting(t.id);
    try { await downloadTrainingReport(t.id); }
    catch (e: any) { alert(e?.message || "Unable to generate the training report."); }
    finally { setReporting(null); }
  }

  async function viewReport(t: any) {
    setReporting(t.id);
    try { await viewTrainingReport(t.id); }
    catch (e: any) { alert(e?.message || "Unable to generate the training report."); }
    finally { setReporting(null); }
  }

  if (loading) return <Skeleton lines={6} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Training service</p>
          <h1>My training sessions</h1>
          <p>Review your assigned training sessions and record questions for each session.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No training assignments"
          description="Assigned training sessions will appear here."
        />
      ) : (
        <div className="appt-card-list">
          {items.map((t: any) => {
            const sessions: any[] = t.sessions ?? [];
            const currentSession =
              sessions.find((s) => s.status !== "completed") ?? sessions[sessions.length - 1] ?? null;
            const completedSessions = sessions.filter((s) => s.status === "completed").length;
            const isLast = (currentSession?.session_number ?? 0) >= sessions.length;
            const status = statusOf(t.status);
            const currentStatus = currentSession ? statusOf(currentSession.status) : status;
            const progress =
              sessions.length > 0 ? Math.round((completedSessions / sessions.length) * 100) : 0;
            const patient =
              `${t.patient?.first_name ?? ""} ${t.patient?.last_name ?? ""}`.trim() || "Patient";
            const specialist = t.doctor?.user
              ? `Dr. ${t.doctor.user.first_name ?? ""} ${t.doctor.user.last_name ?? ""}`.trim()
              : "Not yet assigned";
            const canManage = t.status !== "completed" && t.status !== "cancelled";
            const canStart = canManage && currentSession?.status === "pending";
            const sessionRunning =
              currentSession?.status === "in_progress" &&
              (sessionId === null || sessionId === currentSession.id);

            return (
              <Card key={t.id} className={`appt-card appt-card--${status.card}`}>
                <div className="appt-card__top">
                  <div className="appt-card__status-line">
                    <span
                      className="appt-card__status-dot"
                      style={{ background: status.tone }}
                    />
                    <span className="appt-card__status-label">{status.label}</span>
                    <span
                      className={`badge ${status.badge}`}
                      style={{ background: status.tone, color: status.text }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div className="appt-card__time">
                    <CalendarClock size={14} />
                    <span>
                      {t.preferred_days} day{t.preferred_days === 1 ? "" : "s"}
                    </span>
                    <span className="appt-card__time-sep">·</span>
                    <span style={{ textTransform: "capitalize" }}>{t.delivery_mode}</span>
                  </div>
                </div>

                <div className="appt-card__body">
                  <div className="appt-card__patient">
                    <span className="appt-card__patient-label">Training topic</span>
                    <span className="appt-card__patient-name">{t.training_topic}</span>
                  </div>

                  <div className="training-card__facts">
                    <div className="appt-card__reason">
                      <span className="appt-card__reason-label">Patient</span>
                      <span className="appt-card__reason-text">{patient}</span>
                    </div>
                    <div className="appt-card__reason">
                      <span className="appt-card__reason-label">Specialist</span>
                      <span className="appt-card__reason-text">{specialist}</span>
                    </div>
                    <div className="appt-card__reason">
                      <span className="appt-card__reason-label">Starts</span>
                      <span className="appt-card__reason-text">{formatDay(t.preferred_start_date)}</span>
                    </div>
                  </div>

                  <div className="training-card__session">
                    <div className="training-card__session-head">
                      <span className="appt-card__reason-label">Session progress</span>
                      <span className="training-card__session-count">
                        {completedSessions} of {sessions.length} complete
                      </span>
                    </div>
                    <div className="training-card__session-line">
                      <span className="training-card__session-title">
                        {currentSession
                          ? `Session ${currentSession.session_number} of ${sessions.length} — ${currentStatus.label}`
                          : "No sessions scheduled yet"}
                      </span>
                      <span className="training-card__session-percent">{progress}%</span>
                    </div>
                    <div className="training-card__progress" aria-hidden="true">
                      <span style={{ width: `${progress}%`, background: status.tone }} />
                    </div>
                  </div>

                  {t.notes && (
                    <div className="appt-card__notes">
                      <span className="appt-card__notes-label">Request notes</span>
                      <span className="appt-card__notes-text">{t.notes}</span>
                    </div>
                  )}

                  {sessionRunning && (
                    <div className="training-card__panel">
                      <p className="training-card__panel-title">
                        Record a question from session {currentSession.session_number}
                      </p>
                      <div className="training-card__form-grid">
                        <TextField
                          id={`question-${t.id}`}
                          label="Question asked"
                          value={question}
                          onChange={(e: any) => setQuestion(e.target.value)}
                        />
                        <TextField
                          id={`challenge-${t.id}`}
                          label="Challenge / notes"
                          value={challenge}
                          onChange={(e: any) => setChallenge(e.target.value)}
                        />
                      </div>
                      <div className="training-card__panel-actions">
                        <Button loading={saving} onClick={saveQuestion} disabled={!question.trim()}>
                          Save question
                        </Button>
                        {!isLast && (
                          <Button variant="secondary" loading={saving} onClick={() => next(t.id)}>
                            Next session
                          </Button>
                        )}
                        {isLast && (
                          <Button variant="secondary" loading={saving} onClick={() => done(t.id)}>
                            <CheckCircle2 size={14} /> Done
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {rescheduleId === t.id && (
                    <div className="training-card__panel">
                      <p className="training-card__panel-title">Reschedule this training</p>
                      <div className="training-card__form-grid">
                        <TextField
                          id={`reschedule-date-${t.id}`}
                          type="date"
                          label="New start date"
                          value={newDate}
                          onChange={(e: any) => setNewDate(e.target.value)}
                        />
                        <TextField
                          id={`reschedule-days-${t.id}`}
                          type="number"
                          label="Days"
                          min={1}
                          max={30}
                          value={newDays}
                          onChange={(e: any) => setNewDays(Number(e.target.value))}
                        />
                      </div>
                      <div className="training-card__panel-actions">
                        <Button loading={saving} onClick={() => reschedule(t)}>
                          Save reschedule
                        </Button>
                        <Button variant="secondary" onClick={() => setRescheduleId(null)}>
                          Close
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="appt-card__actions">
                  {canStart && (
                    <Button loading={saving} onClick={() => start(t, currentSession)}>
                      <Play size={14} /> Start session
                    </Button>
                  )}
                  {canManage && (
                    <Button variant="secondary" onClick={() => toggleReschedule(t)}>
                      <CalendarClock size={14} /> {rescheduleId === t.id ? "Close" : "Reschedule"}
                    </Button>
                  )}
                  {canManage && (
                    <Button variant="danger" loading={saving} onClick={() => cancel(t)}>
                      <Ban size={14} /> Cancel
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    loading={reporting === t.id}
                    onClick={() => viewReport(t)}
                  >
                    <FileText size={14} /> View report
                  </Button>
                  <Button
                    variant="ghost"
                    loading={reporting === t.id}
                    onClick={() => downloadReport(t)}
                  >
                    <Download size={14} /> Download PDF
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
