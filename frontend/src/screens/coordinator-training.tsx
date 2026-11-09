import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  GraduationCap,
  Layers,
  MapPin,
  Search,
  Stethoscope,
  UserCheck,
  UserRound,
} from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { getCoordinatorDoctors } from "../api/coordinator";
import { downloadTrainingReport, viewTrainingReport } from "../api/reports";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";

/**
 * Coordinator training cards — the same shell, typography and spacing as the
 * coordinator appointment cards, with training-specific details and the
 * accept-and-assign flow.
 */
const STATUS: Record<
  string,
  { label: string; tone: string; badge: string; text: string }
> = {
  pending: {
    label: "Pending",
    tone: "#f3a629",
    badge: "badge--pending",
    text: "#16191e",
  },
  accepted: {
    label: "Accepted",
    tone: "#0a9f94",
    badge: "badge--accepted",
    text: "#ffffff",
  },
  scheduled: {
    label: "Scheduled",
    tone: "#0a9f94",
    badge: "badge--accepted",
    text: "#ffffff",
  },
  in_progress: {
    label: "In progress",
    tone: "#7c3aed",
    badge: "badge--in_progress",
    text: "#ffffff",
  },
  completed: {
    label: "Completed",
    tone: "#2563eb",
    badge: "badge--done",
    text: "#ffffff",
  },
  cancelled: {
    label: "Cancelled",
    tone: "#a9b6bf",
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

function audienceLabel(training: any): string {
  if (training.audience === "company") {
    return training.company_name ? `Company · ${training.company_name}` : "Company";
  }
  return "Individual";
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const matchesFilter = (status: string, filter: FilterKey): boolean => {
  if (filter === "all") return true;
  if (filter === "active") {
    return status === "accepted" || status === "in_progress" || status === "scheduled";
  }
  return status === filter;
};

function TrainingCard({
  training: t,
  doctors,
  onChanged,
}: {
  training: any;
  doctors: any[];
  onChanged: () => void;
}) {
  const { notify } = useToast();
  const [doctorId, setDoctorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);

  const status = statusOf(t.status);
  const sessions: any[] = t.sessions ?? [];
  const completedSessions = sessions.filter((session) => session.status === "completed").length;
  const currentSession =
    sessions.find((session) => session.status !== "completed") ??
    sessions[sessions.length - 1] ??
    null;
  const currentStatus = currentSession ? statusOf(currentSession.status) : status;
  const progress = sessions.length
    ? Math.round((completedSessions / sessions.length) * 100)
    : 0;
  const patient =
    `${t.patient?.first_name ?? ""} ${t.patient?.last_name ?? ""}`.trim() || "Patient";
  const specialist = t.doctor?.user
    ? `Dr. ${t.doctor.user.first_name ?? ""} ${t.doctor.user.last_name ?? ""}`.trim()
    : null;
  const availableDoctors = doctors.filter((doctor) => doctor.is_available);

  async function accept() {
    if (!doctorId) {
      notify("error", "Select a specialist first.");
      return;
    }
    setSaving(true);
    try {
      await apiPost(`/training/?action=accept&id=${t.id}`, { doctor_id: Number(doctorId) });
      notify("success", "Specialist assigned. The training can now be scheduled.");
      setDoctorId("");
      onChanged();
    } catch (error: any) {
      notify("error", error?.message || "Unable to assign a specialist.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadReport() {
    setReporting(true);
    try { await downloadTrainingReport(t.id); }
    catch (e: any) { notify("error", e?.message || "Unable to generate the training report."); }
    finally { setReporting(false); }
  }

  async function viewReport() {
    setReporting(true);
    try { await viewTrainingReport(t.id); }
    catch (e: any) { notify("error", e?.message || "Unable to generate the training report."); }
    finally { setReporting(false); }
  }

  return (
    <Card
      className="coordinator-appointment-card coordinator-training-card"
      style={{ borderLeftColor: status.tone }}
    >
      <div className="coordinator-appointment-card__head">
        <div className="coordinator-appointment-card__reference">
          <span
            className="coordinator-appointment-card__dot"
            style={{ background: status.tone }}
          />
          <span className="coordinator-appointment-card__type">{t.training_topic}</span>
          <span className="coordinator-appointment-card__id">#{t.id}</span>
        </div>
        <span
          className={`badge ${status.badge}`}
          style={{ background: status.tone, color: status.text }}
        >
          {status.label}
        </span>
      </div>

      <div className="coordinator-appointment-card__when">
        <span>
          <CalendarDays size={15} /> {formatDay(t.preferred_start_date)}
        </span>
        <span>
          <Layers size={15} /> {t.preferred_days} day{t.preferred_days === 1 ? "" : "s"}
        </span>
        <span>
          <GraduationCap size={15} /> {audienceLabel(t)}
        </span>
        <span>
          <MapPin size={15} />
          <span style={{ textTransform: "capitalize" }}>{t.delivery_mode}</span>
        </span>
      </div>

      <div className="coordinator-appointment-card__details">
        <div className="coordinator-training-card__person">
          <span>Patient</span>
          <b>{patient}</b>
          {t.patient?.email && <small>{t.patient.email}</small>}
        </div>
        <div className="coordinator-training-card__person">
          <span>Specialist</span>
          <b>{specialist ?? "Not yet assigned"}</b>
          <small>{t.doctor?.user?.email ?? "Assign one below to start delivery"}</small>
        </div>
        <div>
          <span>Starts</span>
          <b>{formatDay(t.preferred_start_date)}</b>
          <small>{completedSessions} of {sessions.length} sessions complete</small>
        </div>
        <div>
          <span>Audience</span>
          <b>{t.audience === "company" ? "Company" : "Individual"}</b>
          <small>{t.audience === "company" ? t.company_name || "Company request" : "Individual request"}</small>
        </div>
        <div className="coordinator-appointment-card__reason">
          <span>Delivery</span>
          <p>
            {t.delivery_mode === "onsite"
              ? `Onsite · ${t.location || "Location not provided."}`
              : "Online — remote training."}
          </p>
        </div>
        {t.audience === "company" && t.contact_name && (
          <div className="coordinator-appointment-card__reason">
            <span>Booking contact</span>
            <p>
              {t.contact_name}
              {t.contact_email ? ` · ${t.contact_email}` : ""}
              {t.contact_phone ? ` · ${t.contact_phone}` : ""}
            </p>
          </div>
        )}
        {t.notes && (
          <div className="coordinator-appointment-card__reason">
            <span>Request notes</span>
            <p>{t.notes}</p>
          </div>
        )}
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

      {t.status === "pending" && (
        availableDoctors.length === 0 ? (
          <div className="coordinator-appointment-card__closed">
            <Stethoscope size={14} /> No specialists are available today. Update doctor
            availability before assigning this training.
          </div>
        ) : (
          <div className="coordinator-appointment-card__reassign">
            <div className="coordinator-appointment-select">
              <Stethoscope size={15} />
              <select
                value={doctorId}
                aria-label={`Choose a specialist for training ${t.id}`}
                onChange={(event) => setDoctorId(event.target.value)}
              >
                <option value="">Choose an available specialist</option>
                {availableDoctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>Dr. {doctor.name}</option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              loading={saving}
              disabled={!doctorId}
              onClick={() => void accept()}
            >
              <UserCheck size={14} /> Accept &amp; assign
            </Button>
          </div>
        )
      )}

      {t.status !== "pending" && specialist && (
        <div className="coordinator-appointment-card__checked">
          <CheckCircle2 size={14} /> Assigned to {specialist}
        </div>
      )}

      {t.status !== "pending" && !specialist && (
        <div className="coordinator-appointment-card__closed">
          <UserRound size={14} /> No specialist is assigned to this training.
        </div>
      )}

      <div className="coordinator-training-card__actions">
        <Button variant="secondary" loading={reporting} onClick={() => void viewReport()}>
          <FileText size={14} /> View report
        </Button>
        <Button
          variant={t.status === "completed" ? "primary" : "ghost"}
          loading={reporting}
          onClick={() => void downloadReport()}
        >
          <Download size={14} /> Download PDF
        </Button>
      </div>
    </Card>
  );
}

export function CoordinatorTrainingScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/training/");
      setItems(res.data ?? []);
      const d = await getCoordinatorDoctors(new Date().toISOString().slice(0, 10));
      setDoctors(d.data ?? []);
    } catch (e: any) { setError(e?.message || "Failed."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => {
    return Object.fromEntries(
      FILTERS.map((option) => [
        option.key,
        items.filter((training) => matchesFilter(training.status, option.key)).length,
      ])
    ) as Record<FilterKey, number>;
  }, [items]);

  const visible = useMemo(() => {
    const order: Record<string, number> = {
      pending: 0,
      accepted: 1,
      in_progress: 2,
      completed: 3,
      cancelled: 4,
    };
    const query = search.trim().toLowerCase();
    return items
      .filter((training) => matchesFilter(training.status, filter))
      .filter((training) => {
        if (!query) return true;
        const haystack = [
          training.id,
          training.training_topic,
          training.company_name,
          training.patient?.first_name,
          training.patient?.last_name,
          training.patient?.email,
          training.doctor?.user?.first_name,
          training.doctor?.user?.last_name,
          training.location,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort(
        (a, b) =>
          (order[a.status] ?? 9) - (order[b.status] ?? 9) || Number(b.id) - Number(a.id)
      );
  }, [items, filter, search]);

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Coordination center</p>
          <h1>Training requests</h1>
          <p>Review requests, assign a specialist and generate the PDF training report.</p>
        </div>
        <div className="doctor-header-actions">
          <Link to="/coordinator/doctors" className="doctor-outline-button">
            <Stethoscope size={16} /> Doctor availability
          </Link>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <Skeleton lines={6} />
      ) : (
        <>
          <Card className="coordinator-appointments-toolbar">
            <div className="coordinator-appointments-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by patient, topic, company or training ID"
                aria-label="Search training requests"
              />
            </div>
            <div className="coordinator-appointments-filters">
              {FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={filter === option.key ? "active" : ""}
                  onClick={() => setFilter(option.key)}
                >
                  {option.label} <span>{counts[option.key]}</span>
                </button>
              ))}
            </div>
          </Card>

          <p className="coordinator-appointments-count">
            Showing {visible.length} of {items.length} training requests
          </p>

          {visible.length === 0 ? (
            <EmptyState
              icon={<GraduationCap size={28} />}
              title="No matching training requests"
              description={
                items.length === 0
                  ? "Training requests will appear here once patients submit them."
                  : "Try a different status filter or search term."
              }
            />
          ) : (
            <div className="coordinator-appointment-grid">
              {visible.map((training) => (
                <TrainingCard
                  key={training.id}
                  training={training}
                  doctors={doctors}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
