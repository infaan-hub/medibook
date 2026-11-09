import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  GraduationCap,
  Play,
  XCircle,
} from "lucide-react";
import { apiGet } from "../api/client";
import { downloadTrainingReport, viewTrainingReport } from "../api/reports";
import { Card, Button, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";

/**
 * Patient training cards — same shell, spacing and status language as the
 * patient appointment cards, with training-specific delivery and progress.
 */
const STATUS: Record<
  string,
  { label: string; color: string; bg: string; icon: ReactNode }
> = {
  pending: {
    label: "Pending review",
    color: "#d97706",
    bg: "#fef3c7",
    icon: <Clock3 size={14} />,
  },
  accepted: {
    label: "Accepted",
    color: "#0a9f94",
    bg: "#e4f8f5",
    icon: <CalendarCheck size={14} />,
  },
  scheduled: {
    label: "Scheduled",
    color: "#0a9f94",
    bg: "#e4f8f5",
    icon: <CalendarCheck size={14} />,
  },
  in_progress: {
    label: "In progress",
    color: "#2563eb",
    bg: "#dbeafe",
    icon: <Play size={14} />,
  },
  completed: {
    label: "Completed",
    color: "#059669",
    bg: "#d1fae5",
    icon: <CheckCircle2 size={14} />,
  },
  cancelled: {
    label: "Cancelled",
    color: "#dc2626",
    bg: "#fee2e2",
    icon: <XCircle size={14} />,
  },
};

const statusOf = (status: string) => STATUS[status] ?? STATUS.pending;

const isActive = (status: string): boolean =>
  ["pending", "accepted", "scheduled", "in_progress"].includes(status);

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

function dateBox(value: string | null | undefined): { day: string; month: string } {
  const day = String(value ?? "").slice(0, 10);
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: "—", month: "" };
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString(undefined, { month: "short" }),
  };
}

function audienceLabel(training: any): string {
  if (training.audience === "company") {
    return training.company_name ? `Company · ${training.company_name}` : "Company";
  }
  return "Individual";
}

type Tab = "active" | "past";

export function TrainingScreen() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("active");
  const [reporting, setReporting] = useState<number | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/training/");
      setItems(res.data ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load trainings.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const activeItems = useMemo(
    () => items.filter((training) => isActive(training.status)),
    [items]
  );
  const pastItems = useMemo(
    () => items.filter((training) => !isActive(training.status)),
    [items]
  );
  const visible = tab === "active" ? activeItems : pastItems;

  async function downloadReport(training: any) {
    setReporting(training.id);
    try { await downloadTrainingReport(training.id); }
    catch (e: any) { notify("error", e?.message || "Unable to generate the training report."); }
    finally { setReporting(null); }
  }

  async function viewReport(training: any) {
    setReporting(training.id);
    try { await viewTrainingReport(training.id); }
    catch (e: any) { notify("error", e?.message || "Unable to generate the training report."); }
    finally { setReporting(null); }
  }

  if (error) {
    return (
      <div className="page patient-appointments">
        <h1 className="page__title">My Trainings</h1>
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="page patient-appointments">
      <div className="patient-appt-header">
        <h1 className="page__title">My Trainings</h1>
        {activeItems.length === 0 && (
          <Link to="/training/request" className="patient-appt-book-btn">
            + Request Training
          </Link>
        )}
      </div>

      <div className="patient-appt-tabs">
        <button
          type="button"
          className={`patient-appt-tab${tab === "active" ? " patient-appt-tab--active" : ""}`}
          onClick={() => setTab("active")}
        >
          Active
          <span className="patient-appt-tab__count">{activeItems.length}</span>
        </button>
        <button
          type="button"
          className={`patient-appt-tab${tab === "past" ? " patient-appt-tab--active" : ""}`}
          onClick={() => setTab("past")}
        >
          Past
          <span className="patient-appt-tab__count">{pastItems.length}</span>
        </button>
      </div>

      {loading ? (
        <Skeleton lines={4} />
      ) : visible.length === 0 ? (
        <div className="patient-appt-empty">
          <div className="patient-appt-empty__icon">
            <GraduationCap size={40} />
          </div>
          <h3>{tab === "active" ? "No active trainings" : "No past trainings"}</h3>
          <p>
            {tab === "active"
              ? "Request a training session and follow its delivery here."
              : "Completed and cancelled trainings will appear here."}
          </p>
          {tab === "active" && (
            <Link to="/training/request">
              <Button>Request Training</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="patient-appt-grid">
          {visible.map((t) => {
            const status = statusOf(t.status);
            const box = dateBox(t.preferred_start_date);
            const sessions: any[] = t.sessions ?? [];
            const completedSessions = sessions.filter(
              (session) => session.status === "completed"
            ).length;
            const currentSession =
              sessions.find((session) => session.status !== "completed") ??
              sessions[sessions.length - 1] ??
              null;
            const currentStatus = currentSession ? statusOf(currentSession.status) : status;
            const progress = sessions.length
              ? Math.round((completedSessions / sessions.length) * 100)
              : 0;
            const specialist = t.doctor?.user
              ? `Dr. ${t.doctor.user.first_name ?? ""} ${t.doctor.user.last_name ?? ""}`.trim()
              : null;

            return (
              <Card key={t.id} className="patient-appt-card patient-training-card">
                <div
                  className="patient-appt-card__accent"
                  style={{ background: status.color }}
                />
                <div className="patient-appt-card__content">
                  <div className="patient-appt-card__top">
                    <div className="patient-appt-card__date-box">
                      <span className="patient-appt-card__day">{box.day}</span>
                      <span className="patient-appt-card__month">{box.month}</span>
                    </div>
                    <div className="patient-appt-card__info">
                      <div className="patient-appt-card__doctor">{t.training_topic}</div>
                      <div className="patient-appt-card__time">
                        {t.preferred_days} day{t.preferred_days === 1 ? "" : "s"} ·{" "}
                        <span style={{ textTransform: "capitalize" }}>{t.delivery_mode}</span> ·{" "}
                        {audienceLabel(t)}
                      </div>
                      <div>
                        <span
                          className="patient-appt-card__status patient-training-card__status"
                          style={{ color: status.color, background: status.bg }}
                        >
                          {status.icon} {status.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="patient-training-card__meta">
                    <div>
                      <span>Specialist</span>
                      <b>{specialist ?? "Not yet assigned"}</b>
                    </div>
                    <div>
                      <span>Starts</span>
                      <b>{formatDay(t.preferred_start_date)}</b>
                    </div>
                    <div>
                      <span>Delivery</span>
                      <b>
                        {t.delivery_mode === "onsite"
                          ? t.location || "Location not provided."
                          : "Online — remote training"}
                      </b>
                    </div>
                    <div>
                      <span>Audience</span>
                      <b>{audienceLabel(t)}</b>
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
                      <span style={{ width: `${progress}%`, background: status.color }} />
                    </div>
                  </div>

                  {t.notes && (
                    <div className="patient-appt-card__reason patient-training-card__notes">
                      {t.notes}
                    </div>
                  )}

                  <div className="patient-training-card__footer">
                    <div className="patient-training-card__actions">
                      <Button
                        variant="secondary"
                        loading={reporting === t.id}
                        onClick={() => void viewReport(t)}
                      >
                        <FileText size={14} /> View report
                      </Button>
                      <Button
                        variant={t.status === "completed" ? "primary" : "ghost"}
                        loading={reporting === t.id}
                        onClick={() => void downloadReport(t)}
                      >
                        <Download size={14} /> Download PDF
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
