import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { downloadTrainingReport, viewTrainingReport } from "../api/reports";
import { Card, Button, TextField, EmptyState, Skeleton, ErrorState } from "../components/ui";

export function DoctorTrainingScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<any>(null);
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

  async function start(s: any) {
    setSaving(true);
    try {
      await apiPost(`/training/?action=start-session&id=${s.training_request_id}`, { session_id: s.id });
      setSessionId(s.id); setActive(s);
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

  async function next() {
    if (!active) return;
    setSaving(true);
    try {
      await apiPost(`/training/?action=next-session&id=${active.training_request_id}`, { session_id: sessionId });
      setSessionId(null); setActive(null);
      await load();
    } catch (e: any) { alert(e?.message); }
    finally { setSaving(false); }
  }

  async function done() {
    if (!active || !sessionId) return;
    setSaving(true);
    try {
      await apiPost(`/training/?action=complete&id=${active.training_request_id}`, { session_id: sessionId });
      setSessionId(null); setActive(null);
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

  const statusTone = (status: string) => {
    if (status === "completed") return "#0a9f94";
    if (status === "pending") return "#f3a629";
    if (status === "accepted" || status === "scheduled") return "#7c3aed";
    if (status === "in_progress") return "#2563eb";
    if (status === "cancelled") return "#a9b6bf";
    return "#a9b6bf";
  };

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

      {items.length === 0 ? <EmptyState title="No training assignments" description="Assigned training sessions will appear here." /> :
       <div style={{ display: "grid", gap: 12 }}>
          {items.map((t: any) => {
            const sessions = t.sessions || [];
            const currentSession = sessions.find((s: any) => s.status !== "completed") || sessions[sessions.length - 1];
            const isLast = (currentSession?.session_number ?? 0) >= sessions.length;
            const tone = statusTone(t.status);
            return (
              <Card key={t.id} style={{ borderLeft: `4px solid ${tone}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 18, color: "#17384a" }}>{t.training_topic}</h2>
                  <span style={{ padding: "4px 10px", borderRadius: 99, background: tone + "1a", color: tone, fontSize: 11, fontWeight: 600, textTransform: "capitalize" }}>{t.status}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 13, color: "#405563", marginBottom: 10 }}>
                  <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Patient</b><div>{t.patient.first_name} {t.patient.last_name}</div></div>
                  <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Days · Delivery</b><div>{t.preferred_days} day{t.preferred_days === 1 ? "" : "s"} · {t.delivery_mode}</div></div>
                  <div><b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Specialist</b><div>Dr. {t.doctor.user.first_name} {t.doctor.user.last_name}</div></div>
                </div>
                {currentSession && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 6, fontSize: 13, color: "#405563" }}>
                      <b style={{ color: "#82909d", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>Session</b>
                      <div>Session {currentSession.session_number} of {sessions.length} — {currentSession.status}</div>
                    </div>
                    {currentSession.status === "pending" && (
                      <Button loading={saving} onClick={() => start(currentSession)}>Start session</Button>
                    )}
                    {currentSession.status === "in_progress" && sessionId === currentSession.id && (
                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        <TextField id="question" label="Question asked" value={question} onChange={(e:any)=>setQuestion(e.target.value)} />
                        <TextField id="challenge" label="Challenge/notes" value={challenge} onChange={(e:any)=>setChallenge(e.target.value)} />
                        <Button loading={saving} onClick={saveQuestion} disabled={!question.trim()}>Save question</Button>
                        <div style={{ display: "flex", gap: 8 }}>
                          {!isLast && <Button loading={saving} onClick={next}>Next session</Button>}
                          {isLast && <Button loading={saving} onClick={done}>Done</Button>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {t.status !== "completed" && t.status !== "cancelled" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <Button variant="secondary" onClick={() => { setRescheduleId(t.id); setNewDate(t.preferred_start_date?.slice(0,10) || ""); setNewDays(t.preferred_days); }}>Reschedule</Button>
                    <Button variant="secondary" onClick={() => cancel(t)} loading={saving}>Cancel</Button>
                  </div>
                )}
                {rescheduleId === t.id && (
                  <div style={{ display: "grid", gap: 8, marginTop: 8, padding: 10, border: "1px solid #eef2f5", borderRadius: 8 }}>
                    <input type="date" value={newDate} onChange={(e:any)=>setNewDate(e.target.value)} style={{ minHeight: 42, padding: "0 14px", border: "1px solid #c2e0df", borderRadius: 10 }} />
                    <input type="number" min={1} max={30} value={newDays} onChange={(e:any)=>setNewDays(Number(e.target.value))} style={{ minHeight: 42, padding: "0 14px", border: "1px solid #c2e0df", borderRadius: 10 }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button loading={saving} onClick={() => reschedule(t)}>Save reschedule</Button>
                      <Button variant="secondary" onClick={() => setRescheduleId(null)}>Close</Button>
                    </div>
                  </div>
                )}
                {t.status === "completed" && (
                  <p style={{ marginTop: 8, fontSize: 13, color: "#405563" }}>Training completed. The PDF report is ready below.</p>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #eef2f5", flexWrap: "wrap" }}>
                  <Button variant="secondary" loading={reporting === t.id} onClick={() => viewReport(t)}>View report</Button>
                  <Button loading={reporting === t.id} onClick={() => downloadReport(t)}>Download PDF</Button>
                </div>
              </Card>
            );
          })}
        </div>}
    </div>
  );
}
