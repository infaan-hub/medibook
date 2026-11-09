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
      setError(e?.message || "Unable to load psychotherapy.");
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
          <p className="doctor-eyebrow">Psychotherapy service</p>
          <h1>My psychotherapy</h1>
          <p>Track your psychotherapy request and sessions.</p>
        </div>
        <Link to="/psychotherapy/request"><Button>Request Therapy session</Button></Link>
      </div>

      {items.length === 0 && <EmptyState title="No psychotherapy requests" description="Request a psychotherapy session to get started." />}

      {items.map((r) => {
        const st = STATUS[r.status] ?? { label: r.status, color: "#6b7280", bg: "#f3f4f6" };
        return (
          <Card key={r.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong>Psychotherapy #{r.id}</strong>
              <span style={{ background: st.bg, color: st.color, padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>{st.label}</span>
            </div>
            <p><strong>Mode:</strong> {r.session_mode === "in_person" ? "In person" : "Online"}</p>
            <p><strong>Urgency:</strong> {r.urgency}</p>
            <p><strong>Preferred start:</strong> {String(r.preferred_start_date).slice(0, 10)}</p>
            {r.doctor && <p><strong>Psychologist:</strong> {r.doctor.user.first_name} {r.doctor.user.last_name}</p>}
            {r.plan_approach && <p><strong>Approach:</strong> {r.plan_approach}</p>}
            {r.plan_goals && <p><strong>Goals:</strong> {r.plan_goals}</p>}
            {r.plan_frequency && <p><strong>Frequency:</strong> {r.plan_frequency}</p>}
            {r.plan_session_duration && <p><strong>Session duration:</strong> {r.plan_session_duration} min</p>}
            {r.plan_total_sessions && <p><strong>Planned sessions:</strong> {r.plan_total_sessions}</p>}
            {r.plan_start_date && <p><strong>Plan start:</strong> {String(r.plan_start_date).slice(0, 10)} {r.plan_start_time?.slice(0, 5)}</p>}
            {r.plan_review_after && <p><strong>Review after:</strong> {r.plan_review_after} session(s)</p>}

            {r.sessions?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h4>Sessions</h4>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {r.sessions.map((s: any) => {
                    const ss = STATUS[s.status] ?? { label: s.status, color: "#6b7280", bg: "#f3f4f6" };
                    return (
                      <li key={s.id} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Session #{s.session_number} — {String(s.scheduled_date).slice(0, 10)} {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                          <span style={{ background: ss.bg, color: ss.color, padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>{ss.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {r.status === "completed" && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button variant="secondary" onClick={() => void viewReport(r.id)}>View report</Button>
                <Button variant="secondary" onClick={() => void downloadReport(r.id)}>Download report</Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}