import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { getCoordinatorDoctors } from "../api/coordinator";
import { useRealtimeSync } from "../realtime/socket";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";

const STATUS: Record<string, { label: string; tone: string; badge: string; text: string }> = {
  pending: { label: "Pending", tone: "#f3a629", badge: "badge--pending", text: "#16191e" },
  assigned: { label: "Assigned", tone: "#0a9f94", badge: "badge--accepted", text: "#ffffff" },
  accepted: { label: "Accepted", tone: "#0a9f94", badge: "badge--accepted", text: "#ffffff" },
  in_progress: { label: "In progress", tone: "#7c3aed", badge: "badge--in_progress", text: "#ffffff" },
  follow_up: { label: "Follow-up", tone: "#7c3aed", badge: "badge--in_progress", text: "#ffffff" },
  completed: { label: "Completed", tone: "#2563eb", badge: "badge--done", text: "#ffffff" },
  expired: { label: "Expired", tone: "#525252", badge: "badge--expired", text: "#ffffff" },
};

function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const day = String(value).slice(0, 10);
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

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
  useRealtimeSync({ refresh: () => { void load(); }, events: ["platform.data.updated"], resources: ["psychotherapy"] });

  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => void load()} /></div>;

  const availableDoctors = doctors.filter((doctor) => doctor.is_available);

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Coordinator</p>
          <h1>Manage psychology service</h1>
          <p>Review incoming requests and assign an available doctor to plan the therapy sessions.</p>
        </div>
      </div>

      {items.length === 0 && <EmptyState title="No psychology service requests" description="Patient requests will appear here." />}

      {items.map((r) => (
        <PsychotherapyCard key={r.id} r={r} doctors={availableDoctors} onChanged={() => void load()} />
      ))}
    </div>
  );
}

function PsychotherapyCard({ r, doctors, onChanged }: { r: any; doctors: any[]; onChanged: () => void }) {
  const { notify } = useToast();
  const [doctorId, setDoctorId] = useState("");
  const [saving, setSaving] = useState(false);

  const status = STATUS[r.status] ?? STATUS.pending;
  const patient = `${r.patient?.first_name ?? ""} ${r.patient?.last_name ?? ""}`.trim() || "Patient";
  const specialist = r.doctor?.user
    ? `Dr. ${r.doctor.user.first_name ?? ""} ${r.doctor.user.last_name ?? ""}`.trim()
    : null;

  async function proceed() {
    if (!doctorId) { notify("error", "Select a psychologist first."); return; }
    setSaving(true);
    try {
      await apiPost("/psychotherapy/?action=assign", { id: r.id, doctor_id: Number(doctorId) });
      notify("success", "Psychology service request sent to the psychologist.");
      setDoctorId("");
      onChanged();
    } catch (e: any) { notify("error", e?.message || "Unable to proceed."); }
    finally { setSaving(false); }
  }

  return (
    <Card className="coordinator-appointment-card" style={{ borderLeftColor: status.tone, marginBottom: 16 }}>
      <div className="coordinator-appointment-card__head">
        <div className="coordinator-appointment-card__reference">
          <span className="coordinator-appointment-card__dot" style={{ background: status.tone }} />
          <span className="coordinator-appointment-card__type">Psychology service</span>
          <span className="coordinator-appointment-card__id">#{r.id}</span>
        </div>
        <span className={`badge ${status.badge}`} style={{ background: status.tone, color: status.text }}>
          {status.label}
        </span>
      </div>

      <div className="coordinator-appointment-card__when">
        <span><strong>Patient:</strong> {patient}</span>
        <span><strong>Mode:</strong> {r.session_mode === "in_person" ? "In person" : "Online"}</span>
        <span><strong>Urgency:</strong> {r.urgency}</span>
        <span><strong>Preferred start:</strong> {formatDay(r.preferred_start_date)}</span>
      </div>

      <div className="coordinator-appointment-card__details">
        <div className="coordinator-training-card__person">
          <span>Gender preference</span>
          <b style={{ textTransform: "capitalize" }}>{r.gender_preference}</b>
        </div>
        <div className="coordinator-training-card__person">
          <span>Language</span>
          <b style={{ textTransform: "capitalize" }}>{r.language_preference}</b>
        </div>
        <div className="coordinator-training-card__person">
          <span>Psychologist</span>
          <b>{specialist ?? "Not yet assigned"}</b>
          <small>{r.doctor?.user?.email ?? "Assign one below to start delivery"}</small>
        </div>
        {r.notes && (
          <div className="coordinator-appointment-card__reason">
            <span>Request notes</span>
            <p>{r.notes}</p>
          </div>
        )}
        {r.sessions?.length > 0 && (
          <div className="coordinator-appointment-card__reason">
            <span>Sessions</span>
            <p>
              {r.sessions.length} scheduled
              {r.sessions.some((session: any) => session.status === "expired")
                ? ` · ${r.sessions.filter((session: any) => session.status === "expired").length} expired`
                : ""}
            </p>
          </div>
        )}
      </div>

      {r.status === "pending" && (
        <div className="coordinator-appointment-card__reassign">
          <div className="coordinator-appointment-select coordinator-psychotherapy-select">
            <select
              value={doctorId}
              aria-label={`Select psychologist for psychology service request ${r.id}`}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">Select psychologist</option>
              {doctors.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name ? `Dr. ${d.name}` : `Doctor #${d.id}`}</option>
              ))}
            </select>
          </div>
          <Button loading={saving} disabled={!doctorId} onClick={() => void proceed()}>
            Assign psychologist
          </Button>
          {doctors.length === 0 && (
            <div className="coordinator-appointment-card__closed">No active doctors are available for assignment right now.</div>
          )}
        </div>
      )}

      {r.status !== "pending" && specialist && (
        <div className="coordinator-appointment-card__checked">
          Assigned to {specialist}
        </div>
      )}

      {r.status === "expired" && (
        <div className="coordinator-appointment-card__closed">
          This psychology service request expired because a scheduled session was
          not started in time. The patient must request a new session.
        </div>
      )}
    </Card>
  );
}
