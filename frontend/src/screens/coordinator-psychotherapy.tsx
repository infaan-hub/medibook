import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "../api/client";
import { getCoordinatorDoctors } from "../api/coordinator";
import { useRealtimeSync } from "../realtime/socket";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";
import { formatDate as intlDate } from "../lib/intl";

const STATUS: Record<string, { tone: string; badge: string; text: string }> = {
  pending: { tone: "#f3a629", badge: "badge--pending", text: "#16191e" },
  assigned: { tone: "#0a9f94", badge: "badge--accepted", text: "#ffffff" },
  accepted: { tone: "#0a9f94", badge: "badge--accepted", text: "#ffffff" },
  in_progress: { tone: "#7c3aed", badge: "badge--in_progress", text: "#ffffff" },
  follow_up: { tone: "#7c3aed", badge: "badge--in_progress", text: "#ffffff" },
  completed: { tone: "#2563eb", badge: "badge--done", text: "#ffffff" },
  expired: { tone: "#525252", badge: "badge--expired", text: "#ffffff" },
};

function statusLabel(status: string, t: (k: string) => string): string {
  const key = `coordinator.status${status.charAt(0).toUpperCase()}${status.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;
  // map follow_up -> statusFollowUp, in_progress -> statusInProgress
  const map: Record<string, string> = {
    pending: "coordinator.statusPending",
    assigned: "coordinator.statusAssigned",
    accepted: "coordinator.statusAccepted",
    in_progress: "coordinator.statusInProgress",
    follow_up: "coordinator.statusFollowUp",
    completed: "coordinator.statusCompleted",
    expired: "coordinator.statusExpired",
  };
  return t(map[status] ?? "coordinator.statusPending");
}

function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const day = String(value).slice(0, 10);
  return intlDate(new Date(`${day}T00:00:00`), {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export function CoordinatorPsychotherapyScreen() {
  const { t } = useTranslation();
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
    } catch (e: any) { setError(e?.message || t("common.tryAgainError")); }
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
          <p className="doctor-eyebrow">{t("coordinator.title")}</p>
          <h1>{t("coordinator.managePsychology")}</h1>
          <p>{t("coordinator.managePsychologyDesc")}</p>
        </div>
      </div>

      {items.length === 0 && <EmptyState title={t("coordinator.noPsychology")} description={t("coordinator.noPsychologyDesc")} />}

      {items.map((r) => (
        <PsychotherapyCard key={r.id} r={r} doctors={availableDoctors} onChanged={() => void load()} />
      ))}
    </div>
  );
}

function PsychotherapyCard({ r, doctors, onChanged }: { r: any; doctors: any[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [doctorId, setDoctorId] = useState("");
  const [saving, setSaving] = useState(false);

  const status = STATUS[r.status] ?? STATUS.pending;
  const patient = `${r.patient?.first_name ?? ""} ${r.patient?.last_name ?? ""}`.trim() || "Patient";
  const specialist = r.doctor?.user
    ? `Dr. ${r.doctor.user.first_name ?? ""} ${r.doctor.user.last_name ?? ""}`.trim()
    : null;

  async function proceed() {
    if (!doctorId) { notify("error", t("coordinator.selectPsychologistFirst")); return; }
    setSaving(true);
    try {
      await apiPost("/psychotherapy/?action=assign", { id: r.id, doctor_id: Number(doctorId) });
      notify("success", t("coordinator.sentToPsychologist"));
      setDoctorId("");
      onChanged();
    } catch (e: any) { notify("error", e?.message || t("coordinator.unableToProceed")); }
    finally { setSaving(false); }
  }

  return (
    <Card className="coordinator-appointment-card" style={{ borderLeftColor: status.tone, marginBottom: 16 }}>
      <div className="coordinator-appointment-card__head">
        <div className="coordinator-appointment-card__reference">
          <span className="coordinator-appointment-card__dot" style={{ background: status.tone }} />
          <span className="coordinator-appointment-card__type">{t("psychotherapy.service")}</span>
          <span className="coordinator-appointment-card__id">#{r.id}</span>
        </div>
        <span className={`badge ${status.badge}`} style={{ background: status.tone, color: status.text }}>
          {statusLabel(r.status, t)}
        </span>
      </div>

      <div className="coordinator-appointment-card__when">
        <span><strong>{t("coordinator.patient")}:</strong> {patient}</span>
        <span><strong>{t("coordinator.mode")}:</strong> {r.session_mode === "in_person" ? t("coordinator.inPerson") : t("coordinator.online")}</span>
        <span><strong>{t("coordinator.urgency")}:</strong> {r.urgency}</span>
        <span><strong>{t("coordinator.preferredStart")}:</strong> {formatDay(r.preferred_start_date)}</span>
      </div>

      <div className="coordinator-appointment-card__details">
        <div className="coordinator-training-card__person">
          <span>{t("coordinator.genderPreference")}</span>
          <b style={{ textTransform: "capitalize" }}>{r.gender_preference}</b>
        </div>
        <div className="coordinator-training-card__person">
          <span>{t("coordinator.language")}</span>
          <b style={{ textTransform: "capitalize" }}>{r.language_preference}</b>
        </div>
        <div className="coordinator-training-card__person">
          <span>{t("coordinator.psychologist")}</span>
          <b>{specialist ?? t("coordinator.notYetAssigned")}</b>
          <small>{r.doctor?.user?.email ?? t("coordinator.assignBelow")}</small>
        </div>
        {r.notes && (
          <div className="coordinator-appointment-card__reason">
            <span>{t("coordinator.requestNotes")}</span>
            <p>{r.notes}</p>
          </div>
        )}
        {r.sessions?.length > 0 && (
          <div className="coordinator-appointment-card__reason">
            <span>{t("coordinator.sessions")}</span>
            <p>
              {r.sessions.length} {t("coordinator.scheduled")}
              {r.sessions.some((session: any) => session.status === "expired")
                ? ` · ${r.sessions.filter((session: any) => session.status === "expired").length} ${t("coordinator.expired")}`
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
              aria-label={t("coordinator.selectPsychologistFor", { id: r.id })}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">{t("coordinator.selectPsychologist")}</option>
              {doctors.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name ? `Dr. ${d.name}` : `Doctor #${d.id}`}</option>
              ))}
            </select>
          </div>
          <Button loading={saving} disabled={!doctorId} onClick={() => void proceed()}>
            {t("coordinator.assignPsychologist")}
          </Button>
          {doctors.length === 0 && (
            <div className="coordinator-appointment-card__closed">{t("coordinator.noActiveDoctors")}</div>
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
          {t("coordinator.expiredDesc")}
        </div>
      )}
    </Card>
  );
}
