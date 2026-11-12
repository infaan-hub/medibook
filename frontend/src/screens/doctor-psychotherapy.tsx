import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "../api/client";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";
import { useRealtimeSync } from "../realtime/socket";
import { downloadPsychotherapyReport, viewPsychotherapyReport } from "../api/reports";
import { Brain, CalendarClock, Check, ClipboardList, Clock3, Download, FileText, History, UserRound, AlarmClock } from "lucide-react";

const APPROACHES = ["CBT", "DBT", "ACT", "supportive", "psychodynamic"];
const FREQUENCIES = ["weekly", "biweekly", "twice_weekly"];

export function DoctorPsychotherapyScreen() {
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
    } catch (e: any) { setError(e?.message || t("common.tryAgainError")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useRealtimeSync({ refresh: () => { void load(); }, events: ["platform.data.updated"], resources: ["psychotherapy"] });

  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => void load()} /></div>;

  return (
    <div className="page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">{t("psychotherapy.service")}</p>
          <h1>{t("psychotherapy.myCases")}</h1>
          <p>{t("psychotherapy.planDeliverFinalize")}</p>
        </div>
      </div>
      {items.length === 0 && <EmptyState title={t("psychotherapy.noAssignedCases")} description={t("psychotherapy.assignedAppear")} />}
      {items.map((r) => (
        <CaseCard key={r.id} r={r} onChanged={() => void load()} />
      ))}
    </div>
  );
}

function CaseCard({ r, onChanged }: { r: any; onChanged: () => void }) {
  const { notify } = useToast();
  const [plan, setPlan] = useState({
    goals: r.plan_goals ?? "",
    session_duration: r.plan_session_duration ?? 50,
    planned_sessions: r.plan_total_sessions ?? 6,
    start_date: r.plan_start_date ? String(r.plan_start_date).slice(0, 10) : "",
    start_time: r.plan_start_time ? r.plan_start_time.slice(0, 5) : "09:00",
    followup_date: r.plan_followup_date ? String(r.plan_followup_date).slice(0, 10) : "",
    followup_time: r.plan_followup_time ? r.plan_followup_time.slice(0, 5) : "09:00",
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const [history, setHistory] = useState<any[] | null>(null);
  const [showMedsFor, setShowMedsFor] = useState<number | null>(null);
  const [medForm, setMedForm] = useState({ diagnosis: "", treatment_notes: "", medication: "", dosage: "", frequency: "", duration: "", quantity: "", instructions: "" });
  const [savingMed, setSavingMed] = useState(false);

  async function submitPlan(e: any) {
    e.preventDefault();
    setSavingPlan(true);
    try {
      await apiPost("/psychotherapy/?action=plan", {
        id: r.id,
        goals: plan.goals,
        session_duration: Number(plan.session_duration),
        planned_sessions: Number(plan.planned_sessions),
        start_date: plan.start_date,
        start_time: plan.start_time,
        followup_date: plan.followup_date || null,
        followup_time: plan.followup_time,
      });
      notify("success", "Plan accepted and sessions generated.");
      onChanged();
    } catch (e: any) { notify("error", e?.message || "Unable to save plan."); }
    finally { setSavingPlan(false); }
  }

  async function startSession(sessionId: number) {
    try {
      await apiPost("/psychotherapy/?action=start_session", { request_id: r.id, session_id: sessionId });
      notify("success", "Session started.");
      onChanged();
    } catch (e: any) { notify("error", e?.message || "Unable to start session."); }
  }

  async function loadHistory() {
    try {
      const res = await apiPost<any[]>("/psychotherapy/?action=medication_history", { id: r.id });
      setHistory(res.data ?? []);
    } catch (e: any) { notify("error", e?.message || "Unable to load history."); }
  }

  async function completeSession(session: any, confidentialNotes: string, followUpDate: string, followUpTime: string) {
    try {
      await apiPost("/psychotherapy/?action=complete_session", {
        request_id: r.id,
        session_id: session.id,
        confidential_notes: confidentialNotes,
        follow_up_date: followUpDate || null,
        follow_up_time: followUpTime || null,
      });
      notify("success", "Session completed.");
      onChanged();
    } catch (e: any) { notify("error", e?.message || "Unable to complete session."); }
  }

  async function finalize() {
    try {
      await apiPost("/psychotherapy/?action=finalize", { id: r.id });
      notify("success", "Psychology service finalized.");
      onChanged();
    } catch (e: any) { notify("error", e?.message || "Unable to finalize."); }
  }

  async function submitMedication(sessionId: number) {
    setSavingMed(true);
    try {
      const items = medForm.medication.trim() ? [{
        medication: medForm.medication.trim(),
        dosage: medForm.dosage.trim(),
        frequency: medForm.frequency.trim(),
        duration: medForm.duration.trim(),
        quantity: medForm.quantity.trim(),
        instructions: medForm.instructions.trim(),
      }] : [];
      await apiPost("/psychotherapy/?action=save_medication", {
        request_id: r.id,
        session_id: sessionId,
        diagnosis: medForm.diagnosis,
        treatment_notes: medForm.treatment_notes,
        items,
      });
      notify("success", "Medication saved to session.");
      setShowMedsFor(null);
      setMedForm({ diagnosis: "", treatment_notes: "", medication: "", dosage: "", frequency: "", duration: "", quantity: "", instructions: "" });
      onChanged();
    } catch (e: any) { notify("error", e?.message || "Unable to save medication."); }
    finally { setSavingMed(false); }
  }

  async function viewReport() {
    try { await viewPsychotherapyReport(r.id); } catch (e: any) { notify("error", e?.message || "Failed."); }
  }
  async function downloadReport() {
    try { await downloadPsychotherapyReport(r.id); } catch (e: any) { notify("error", e?.message || "Failed."); }
  }

  const sessions = r.sessions ?? [];

  return (
    <Card className="psych-case-card">
      <div className="psych-case-card__head">
        <div className="psych-case-card__title">
          <span className="psych-case-card__icon"><Brain size={20} /></span>
          <div><span className="psych-case-card__eyebrow">Psychology service case</span><h2>Case #{r.id}</h2></div>
        </div>
        <span className={`psych-case-status psych-case-status--${r.status}`}>{String(r.status).replaceAll("_", " ")}</span>
      </div>
      <div className="psych-case-people">
        <div className="psych-case-person"><span className="psych-case-person__icon"><UserRound size={16} /></span><div><small>Patient</small><strong>{r.patient?.first_name} {r.patient?.last_name}</strong></div></div>
        {r.doctor && <div className="psych-case-person"><span className="psych-case-person__icon"><Brain size={16} /></span><div><small>Psychologist</small><strong>{r.doctor.user.first_name} {r.doctor.user.last_name}</strong></div></div>}
      </div>

      {r.status === "expired" && (
        <div className="psych-plan-summary">
          <div className="psych-plan-summary__goals">
            <small>Session expired</small>
            <p>
              This psychology service case expired because a scheduled session was
              not started in time. The patient must request a new session.
            </p>
          </div>
        </div>
      )}

      {r.status === "assigned" && (
        <form onSubmit={submitPlan} className="psych-plan-form">
          <div className="psych-section-heading"><span><CalendarClock size={18} /></span><div><h3>Create treatment plan</h3><p>Set the approach, goals and session schedule for this patient.</p></div></div>
          <div className="psych-plan-grid">
            <div className="admin-field psych-plan-field psych-plan-field--wide">
              <label htmlFor={`goals-${r.id}`}>Goals</label>
              <textarea id={`goals-${r.id}`} value={plan.goals} onChange={(e) => setPlan({ ...plan, goals: e.target.value })} required />
            </div>
            <div className="admin-field psych-plan-field">
              <label htmlFor={`start-time-${r.id}`}>Current session time</label>
              <input id={`start-time-${r.id}`} type="time" value={plan.start_time} onChange={(e) => setPlan({ ...plan, start_time: e.target.value })} />
            </div>
            <div className="admin-field psych-plan-field">
              <label htmlFor={`followup-date-${r.id}`}>Follow-up session date</label>
              <input id={`followup-date-${r.id}`} type="date" value={plan.followup_date ?? ""} onChange={(e) => setPlan({ ...plan, followup_date: e.target.value })} />
            </div>
            <div className="admin-field psych-plan-field">
              <label htmlFor={`followup-time-${r.id}`}>Follow-up session time</label>
              <input id={`followup-time-${r.id}`} type="time" value={plan.followup_time} onChange={(e) => setPlan({ ...plan, followup_time: e.target.value })} />
            </div>
            <div className="admin-field psych-plan-field">
              <label htmlFor={`duration-${r.id}`}>Session duration (min)</label>
              <input id={`duration-${r.id}`} type="number" value={plan.session_duration} onChange={(e) => setPlan({ ...plan, session_duration: Number(e.target.value) })} />
            </div>
            <div className="admin-field psych-plan-field">
              <label htmlFor={`sessions-${r.id}`}>Planned number of sessions</label>
              <input id={`sessions-${r.id}`} type="number" value={plan.planned_sessions} onChange={(e) => setPlan({ ...plan, planned_sessions: Number(e.target.value) })} />
            </div>
            <div className="admin-field psych-plan-field">
              <label htmlFor={`start-date-${r.id}`}>Current session date</label>
              <input id={`start-date-${r.id}`} type="date" value={plan.start_date} onChange={(e) => setPlan({ ...plan, start_date: e.target.value })} required />
            </div>

            <div className="psych-plan-actions">
              <Button type="submit" loading={savingPlan}><Check size={16} /> Accept plan & schedule sessions</Button>
            </div>
          </div>
        </form>
      )}

      {r.plan_goals && (
        <div className="psych-plan-summary">
          <div className="psych-section-heading"><span><ClipboardList size={18} /></span><div><h3>Treatment plan</h3><p>Plan details and scheduled care</p></div></div>
          <div className="psych-plan-summary__grid">
            <div><small>Current session time</small><strong>{r.plan_start_time?.slice(0, 5)}</strong></div>
            <div><small>Follow-up session time</small><strong>{r.plan_followup_time?.slice(0, 5)}</strong></div>
            <div><small>Session length</small><strong>{r.plan_session_duration} min</strong></div>
            <div><small>Planned sessions</small><strong>{r.plan_total_sessions}</strong></div>
            <div><small>Current session</small><strong>{String(r.plan_start_date).slice(0, 10)} · {r.plan_start_time?.slice(0, 5)}</strong></div>
            {r.plan_followup_date && <div><small>Follow-up session</small><strong>{String(r.plan_followup_date).slice(0, 10)} · {r.plan_followup_time?.slice(0, 5)}</strong></div>}
          </div>
          <div className="psych-plan-summary__goals"><small>Goals</small><p>{r.plan_goals}</p></div>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="psych-case-section">
          <div className="psych-section-heading"><span><Clock3 size={18} /></span><div><h3>Sessions</h3><p>{sessions.filter((s: any) => s.status === "completed").length} of {sessions.length} completed</p></div></div>
          {sessions.map((s: any) => (
            <SessionBlock
              key={s.id}
              s={s}
              r={r}
              showMedsFor={showMedsFor}
              setShowMedsFor={setShowMedsFor}
              medForm={medForm}
              setMedForm={setMedForm}
              savingMed={savingMed}
              submitMedication={submitMedication}
              startSession={startSession}
              completeSession={completeSession}
            />
          ))}
        </div>
      )}

      <div className="psych-case-actions">
        <Button variant="secondary" onClick={() => void loadHistory()}><History size={16} /> Medication history</Button>
        {r.status !== "completed" && r.status !== "expired" && sessions.every((s: any) => s.status === "completed") && sessions.length > 0 && (
          <Button onClick={() => void finalize()}>Done</Button>
        )}
        {r.status === "completed" && (
          <>
            <Button variant="secondary" onClick={() => void viewReport()}><FileText size={16} /> View report</Button>
            <Button variant="secondary" onClick={() => void downloadReport()}><Download size={16} /> Download report</Button>
          </>
        )}
      </div>

      {history && (
        <div className="psych-history">
          <div className="psych-section-heading"><span><History size={18} /></span><div><h3>Medication history</h3><p>Private records from this psychology service case</p></div></div>
          {history.length === 0 && <p className="psych-history__empty">No medication records have been saved for this case.</p>}
          {history.map((h: any) => (
            <Card key={h.session_id} className="psych-history-item">
              <div className="psych-history-item__head"><strong>Session {h.session_number}</strong><span>{String(h.scheduled_date).slice(0, 10)}</span></div>
              {h.medication_record ? (
                <div className="psych-history-item__body">
                  {h.medication_record.diagnosis && <p><b>Diagnosis</b><span>{h.medication_record.diagnosis}</span></p>}
                  {h.medication_record.treatment_notes && <p><b>Treatment notes</b><span>{h.medication_record.treatment_notes}</span></p>}
                  {Array.isArray(h.medication_record.items) && h.medication_record.items.map((item: any, index: number) => (
                    <p key={index}><b>{item.medication}</b><span>{[item.dosage, item.frequency, item.duration].filter(Boolean).join(" · ")}{item.instructions ? ` — ${item.instructions}` : ""}</span></p>
                  ))}
                </div>
              ) : <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(h.treatment, null, 2)}</pre>}
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}

function SessionBlock({ s, r, showMedsFor, setShowMedsFor, medForm, setMedForm, savingMed, submitMedication, startSession, completeSession }: any) {
  const { notify } = useToast();
  const [notes, setNotes] = useState(s.confidential_notes ?? "");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const sessionDate = String(s.scheduled_date).slice(0, 10);
  const sessionTime = String(s.start_time ?? "").slice(0, 8);
  const sessionDue = new Date(`${sessionDate}T${sessionTime}Z`).getTime() <= Date.now();

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await apiPost("/psychotherapy/?action=update_session", { request_id: r.id, session_id: s.id, confidential_notes: notes });
      notify("success", "Confidential session notes saved.");
    } catch (e: any) { notify("error", e?.message || "Unable to save confidential notes."); }
    finally { setSavingNotes(false); }
  }

  return (
    <Card className={`psych-session-card psych-session-card--${s.status}`}>
      <div className="psych-session-card__head">
        <strong>Session {s.session_number}</strong>
        <span className={`psych-case-status psych-case-status--${s.status}`}>{String(s.status).replaceAll("_", " ")}</span>
      </div>
      <p className="psych-session-card__time"><CalendarClock size={15} /> {String(s.scheduled_date).slice(0, 10)} <span>{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span></p>

      {s.status === "scheduled" && (sessionDue
        ? <Button onClick={() => void startSession(s.id)}><Check size={16} /> Start session</Button>
        : <p style={{ color: "#64748b", fontSize: 13 }}>Start session is available on {sessionDate} at {sessionTime.slice(0, 5)}.</p>)}

      {s.status === "expired" && (
        <p style={{ color: "#525252", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlarmClock size={15} /> This session expired because it was not started
          before its scheduled time. The patient must request a new session.
        </p>
      )}

      {s.status === "in_progress" && (
        <div className="psych-session-workspace">
          <label>Confidential notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <Button variant="secondary" loading={savingNotes} onClick={() => void saveNotes()}>Save confidential notes</Button>
          <div className="psych-session-tool-row">
            <Button variant="secondary" onClick={() => setShowMedsFor(showMedsFor === s.id ? null : s.id)}>
              {showMedsFor === s.id ? "Hide medication form" : "Add medication"}
            </Button>
          </div>
          {showMedsFor === s.id && (
            <div className="admin-form-grid psych-medication-form">
              <div className="admin-field"><label>Diagnosis</label><input value={medForm.diagnosis} onChange={(e) => setMedForm({ ...medForm, diagnosis: e.target.value })} /></div>
              <div className="admin-field admin-field--wide"><label>Treatment notes</label><textarea value={medForm.treatment_notes} onChange={(e) => setMedForm({ ...medForm, treatment_notes: e.target.value })} /></div>
              <div className="admin-field"><label>Medication</label><input value={medForm.medication} onChange={(e) => setMedForm({ ...medForm, medication: e.target.value })} /></div>
              <div className="admin-field"><label>Dosage</label><input value={medForm.dosage} onChange={(e) => setMedForm({ ...medForm, dosage: e.target.value })} /></div>
              <div className="admin-field"><label>Frequency</label><input value={medForm.frequency} onChange={(e) => setMedForm({ ...medForm, frequency: e.target.value })} /></div>
              <div className="admin-field"><label>Duration</label><input value={medForm.duration} onChange={(e) => setMedForm({ ...medForm, duration: e.target.value })} /></div>
              <div className="admin-field"><label>Quantity</label><input value={medForm.quantity} onChange={(e) => setMedForm({ ...medForm, quantity: e.target.value })} /></div>
              <div className="admin-field"><label>Instructions</label><input value={medForm.instructions} onChange={(e) => setMedForm({ ...medForm, instructions: e.target.value })} /></div>
              <div className="psych-plan-actions">
                <Button loading={savingMed} onClick={() => void submitMedication(s.id)}><Check size={16} /> Save session treatment</Button>
              </div>
            </div>
          )}
          {s.medication_record && (
            <div className="psych-session-saved">
              <Check size={15} /><span>Session treatment saved: {s.medication_record.diagnosis || "Medication / treatment details"}</span>
            </div>
          )}
          <div className="psych-followup-form">
            <label className="admin-field">Follow-up date <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} /></label>
            <label className="admin-field">Follow-up time <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} /></label>
            <Button onClick={() => void completeSession(s, notes, followUpDate, followUpTime)}><Check size={16} /> Complete session</Button>
          </div>
        </div>
      )}

      {s.status === "completed" && s.confidential_notes && (
        <div className="psych-session-notes">
          <strong>Notes:</strong> {s.confidential_notes}
        </div>
      )}
    </Card>
  );
}
