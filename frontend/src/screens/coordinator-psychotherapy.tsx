import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { getCoordinatorDoctors } from "../api/coordinator";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";

export function CoordinatorPsychotherapyScreen() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/psychotherapy");
      setItems(res.data ?? []);
      const d = await getCoordinatorDoctors(new Date().toISOString().slice(0, 10));
      setDoctors(d.data ?? []);
    } catch (e: any) { setError(e?.message || "Failed."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => void load()} /></div>;

  const pending = items.filter((r) => r.status === "pending");
  const availableDoctors = doctors.filter((d: any) => d.is_available);

  return (
    <div className="page">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Coordinator</p>
          <h1>Manage psychotherapy</h1>
          <p>Receive pending requests, assign a psychologist and proceed.</p>
        </div>
      </div>

      {items.length === 0 && <EmptyState title="No psychotherapy requests" description="Patient requests will appear here." />}

      {pending.map((r) => (
        <PsychotherapyCard key={r.id} r={r} doctors={availableDoctors} onChanged={() => void load()} />
      ))}

      {items.filter((r) => r.status !== "pending").length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Assigned / active cases</h3>
          {items.filter((r) => r.status !== "pending").map((r) => (
            <Card key={r.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>Psychotherapy #{r.id}</strong>
                <span>{r.status}</span>
              </div>
              <p>Patient: {r.patient?.first_name} {r.patient?.last_name}</p>
              {r.doctor && <p>Psychologist: {r.doctor.user.first_name} {r.doctor.user.last_name}</p>}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function PsychotherapyCard({ r, doctors, onChanged }: { r: any; doctors: any[]; onChanged: () => void }) {
  const { notify } = useToast();
  const [doctorId, setDoctorId] = useState("");
  const [saving, setSaving] = useState(false);

  async function proceed() {
    if (!doctorId) { notify("error", "Select a psychologist first."); return; }
    setSaving(true);
    try {
      await apiPost("/psychotherapy/?action=assign", { id: r.id, doctor_id: Number(doctorId) });
      notify("success", "Psychotherapy request sent to the psychologist.");
      setDoctorId("");
      onChanged();
    } catch (e: any) { notify("error", e?.message || "Unable to proceed."); }
    finally { setSaving(false); }
  }

  return (
    <Card style={{ marginBottom: 16, borderLeft: "4px solid #f3a629" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong>Psychotherapy #{r.id}</strong>
        <span style={{ background: "#fef3c7", color: "#d97706", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>Pending</span>
      </div>
      <p><strong>Patient:</strong> {r.patient?.first_name} {r.patient?.last_name}</p>
      <p><strong>Mode:</strong> {r.session_mode === "in_person" ? "In person" : "Online"}</p>
      <p><strong>Urgency:</strong> {r.urgency}</p>
      <p><strong>Preferred start:</strong> {String(r.preferred_start_date).slice(0, 10)}</p>
      <p><strong>Gender preference:</strong> {r.gender_preference}</p>
      <p><strong>Language:</strong> {r.language_preference}</p>
      {r.notes && <p><strong>Notes:</strong> {r.notes}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} style={{ flex: 1 }}>
          <option value="">Select psychologist</option>
          {doctors.map((d: any) => (
            <option key={d.id} value={d.id}>{d.user?.first_name} {d.user?.last_name}</option>
          ))}
        </select>
        <Button loading={saving} onClick={() => void proceed()} disabled={!doctorId}>
          Proceed psychotherapy
        </Button>
      </div>
    </Card>
  );
}