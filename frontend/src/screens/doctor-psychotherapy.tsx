import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";
import { useRealtimeSync } from "../realtime/socket";
import { downloadPsychotherapyReport, viewPsychotherapyReport } from "../api/reports";

const APPROACHES = ["CBT", "DBT", "ACT", "supportive", "psychodynamic"];
const FREQUENCIES = ["weekly", "biweekly", "twice_weekly"];

export function DoctorPsychotherapyScreen() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiGet<any[]>("/psychotherapy");
      setItems(res.data ?? []);
    } catch (e: any) { setError(e?.message || "Unable to load."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useRealtimeSync({ refresh: () => { void load(); }, events: ["platform.data.updated"] });

  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => void load()} /></div>;

  return (
    <div className="page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Psychology service</p>
          <h1>My psychology service cases</h1>
          <p>Plan sessions, deliver confidential care and finalize reports.</p>
        </div>
      </div>
      {items.length === 0 && <EmptyState title="No assigned cases" description="Assigned psychology service cases will appear here." />}
      {items.map((r) => (
        <CaseCard key={r.id} r={r} onChanged={() => void load()} />
      ))}
    </div>
  );
}

function CaseCard({ r, onChanged }: { r: any; onChanged: () => void }) {
  const { notify } = useToast();
  const [plan, setPlan] = useState({
    approach: r.plan_approach ?? "CBT",
    goals: r.plan_goals ?? "",
    frequency: r.plan_frequency ?? "weekly",
    session_duration: r.plan_session_duration ?? 50,
    planned_sessions: r.plan_total_sessions ?? 6,
    start_date: r.plan_start_date ? String(r.plan_start_date).slice(0, 10) : "",
    start_time: r.plan_start_time ? r.plan_start_time.slice(0, 5) : "09:00",
    review_after: r.plan_review_after ?? "",
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
        approach: plan.approach,
        goals: plan.goals,
        frequency: plan.frequency,
        session_duration: Number(plan.session_duration),
        planned_sessions: Number(plan.planned_sessions),
        start_date: plan.start_date,
        start_time: plan.start_time,
        review_after: plan.review_after ? Number(plan.review_after) : null,
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
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong>Psychology service #{r.id}</strong>
        <span>{r.status}</span>
      </div>
      <p>Patient: {r.patient?.first_name} {r.patient?.last_name}</p>
      {r.doctor && <p>Psychologist: {r.doctor.user.first_name} {r.doctor.user.last_name}</p>}

      {r.status === "assigned" && (
        <form onSubmit={submitPlan} className="admin-form-card" style={{ marginTop: 12 }}>
          <h4>Start plan</h4>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label htmlFor={`approach-${r.id}`}>Approach</label>
              <select id={`approach-${r.id}`} value={plan.approach} onChange={(e) => setPlan({ ...plan, approach: e.target.value })}>
                {APPROACHES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="admin-field admin-field--wide">
              <label htmlFor={`goals-${r.id}`}>Goals</label>
              <textarea id={`goals-${r.id}`} value={plan.goals} onChange={(e) => setPlan({ ...plan, goals: e.target.value })} required />
            </div>
            <div className="admin-field">
              <label htmlFor={`frequency-${r.id}`}>Frequency</label>
              <select id={`frequency-${r.id}`} value={plan.frequency} onChange={(e) => setPlan({ ...plan, frequency: e.target.value })}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor={`duration-${r.id}`}>Session duration (min)</label>
              <input id={`duration-${r.id}`} type="number" value={plan.session_duration} onChange={(e) => setPlan({ ...plan, session_duration: Number(e.target.value) })} />
            </div>
            <div className="admin-field">
              <label htmlFor={`sessions-${r.id}`}>Planned number of sessions</label>
              <input id={`sessions-${r.id}`} type="number" value={plan.planned_sessions} onChange={(e) => setPlan({ ...plan, planned_sessions: Number(e.target.value) })} />
            </div>
            <div className="admin-field">
              <label htmlFor={`start-date-${r.id}`}>Start date</label>
              <input id={`start-date-${r.id}`} type="date" value={plan.start_date} onChange={(e) => setPlan({ ...plan, start_date: e.target.value })} required />
            </div>
            <div className="admin-field">
              <label htmlFor={`start-time-${r.id}`}>Start time</label>
              <input id={`start-time-${r.id}`} type="time" value={plan.start_time} onChange={(e) => setPlan({ ...plan, start_time: e.target.value })} />
            </div>
            <div className="admin-field">
              <label htmlFor={`review-${r.id}`}>Review point (after N sessions)</label>
              <input id={`review-${r.id}`} type="number" value={plan.review_after} onChange={(e) => setPlan({ ...plan, review_after: e.target.value })} />
            </div>
            <div className="admin-form-actions admin-field--wide">
              <Button type="submit" loading={savingPlan}>Accept appointment</Button>
            </div>
          </div>
        </form>
      )}

      {r.plan_approach && (
        <div style={{ marginTop: 12 }}>
          <p><strong>Approach:</strong> {r.plan_approach}</p>
          <p><strong>Goals:</strong> {r.plan_goals}</p>
          <p><strong>Frequency:</strong> {r.plan_frequency}</p>
          <p><strong>Session duration:</strong> {r.plan_session_duration} min</p>
          <p><strong>Planned sessions:</strong> {r.plan_total_sessions}</p>
          <p><strong>Plan start:</strong> {String(r.plan_start_date).slice(0, 10)} {r.plan_start_time?.slice(0, 5)}</p>
        </div>
      )}

      {sessions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Sessions</h4>
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

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Button variant="secondary" onClick={() => void loadHistory()}>Medication history</Button>
        {r.status !== "completed" && sessions.every((s: any) => s.status === "completed") && sessions.length > 0 && (
          <Button onClick={() => void finalize()}>Done</Button>
        )}
        {r.status === "completed" && (
          <>
            <Button variant="secondary" onClick={() => void viewReport()}>View report</Button>
            <Button variant="secondary" onClick={() => void downloadReport()}>Download report</Button>
          </>
        )}
      </div>

      {history && (
        <div style={{ marginTop: 12 }}>
          <h4>Medication history</h4>
          {history.length === 0 && <p>No medication records yet.</p>}
          {history.map((h: any) => (
            <Card key={h.session_id} style={{ marginBottom: 8 }}>
              <strong>Session #{h.session_number}</strong> — {String(h.scheduled_date).slice(0, 10)}
              {h.medication_record ? (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  {h.medication_record.diagnosis && <p><b>Diagnosis:</b> {h.medication_record.diagnosis}</p>}
                  {h.medication_record.treatment_notes && <p><b>Treatment notes:</b> {h.medication_record.treatment_notes}</p>}
                  {Array.isArray(h.medication_record.items) && h.medication_record.items.map((item: any, index: number) => (
                    <p key={index}><b>{item.medication}</b> · {item.dosage} · {item.frequency} · {item.duration}<br />{item.instructions}</p>
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
    <Card style={{ marginBottom: 8, borderLeft: s.status === "in_progress" ? "4px solid #2563eb" : "4px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>Session #{s.session_number}</strong>
        <span>{s.status}</span>
      </div>
      <p>{String(s.scheduled_date).slice(0, 10)} {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</p>

      {s.status === "scheduled" && (sessionDue
        ? <Button onClick={() => void startSession(s.id)}>Start session</Button>
        : <p style={{ color: "#64748b", fontSize: 13 }}>Start session is available on {sessionDate} at {sessionTime.slice(0, 5)}.</p>)}

      {s.status === "in_progress" && (
        <div style={{ marginTop: 8 }}>
          <label>Confidential notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <Button variant="secondary" loading={savingNotes} onClick={() => void saveNotes()}>Save confidential notes</Button>
          <div style={{ marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setShowMedsFor(showMedsFor === s.id ? null : s.id)}>
              {showMedsFor === s.id ? "Hide medication form" : "Add medication"}
            </Button>
          </div>
          {showMedsFor === s.id && (
            <div className="admin-form-grid" style={{ marginTop: 8, padding: 8, border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <div className="admin-field"><label>Diagnosis</label><input value={medForm.diagnosis} onChange={(e) => setMedForm({ ...medForm, diagnosis: e.target.value })} /></div>
              <div className="admin-field admin-field--wide"><label>Treatment notes</label><textarea value={medForm.treatment_notes} onChange={(e) => setMedForm({ ...medForm, treatment_notes: e.target.value })} /></div>
              <div className="admin-field"><label>Medication</label><input value={medForm.medication} onChange={(e) => setMedForm({ ...medForm, medication: e.target.value })} /></div>
              <div className="admin-field"><label>Dosage</label><input value={medForm.dosage} onChange={(e) => setMedForm({ ...medForm, dosage: e.target.value })} /></div>
              <div className="admin-field"><label>Frequency</label><input value={medForm.frequency} onChange={(e) => setMedForm({ ...medForm, frequency: e.target.value })} /></div>
              <div className="admin-field"><label>Duration</label><input value={medForm.duration} onChange={(e) => setMedForm({ ...medForm, duration: e.target.value })} /></div>
              <div className="admin-field"><label>Quantity</label><input value={medForm.quantity} onChange={(e) => setMedForm({ ...medForm, quantity: e.target.value })} /></div>
              <div className="admin-field"><label>Instructions</label><input value={medForm.instructions} onChange={(e) => setMedForm({ ...medForm, instructions: e.target.value })} /></div>
              <div className="admin-form-actions admin-field--wide">
                <Button loading={savingMed} onClick={() => void submitMedication(s.id)}>Save medication</Button>
              </div>
            </div>
          )}
          {s.medication_record && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <strong>Psychology service treatment saved:</strong> {s.medication_record.diagnosis || "Medication / treatment details"}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <label>Follow-up date <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} /></label>
            <label>Follow-up time <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} /></label>
            <Button variant="secondary" onClick={() => void completeSession(s, notes, followUpDate, followUpTime)}>Complete session</Button>
          </div>
        </div>
      )}

      {s.status === "completed" && s.confidential_notes && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Notes:</strong> {s.confidential_notes}
        </div>
      )}
    </Card>
  );
}
