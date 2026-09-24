import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { getPatientProfileById } from "../api/patients";
import { getVisitHistory, type VisitHistoryEntry } from "../api/treatments";
import {
  getHealthRecords,
  uploadHealthRecord,
  deleteHealthRecord,
  type HealthRecord,
} from "../api/health-records";
import type { PatientProfile } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  User,
  Stethoscope,
  Pill,
  CalendarClock,
  ChevronRight,
  Upload,
  Trash2,
  Download,
} from "lucide-react";

function msg(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? "AM" : "PM"}`;
}

function fmtGender(g: string): string {
  if (!g) return "—";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/* ======================================
   PATIENT INFO CARD
   ====================================== */

function PatientInfo({ profile }: { profile: PatientProfile }) {
  const age = profile.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(profile.date_of_birth + "T00:00:00").getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : null;

  return (
    <Card className="treat-patient-card">
      <div className="treat-patient-hdr">
        <div className="treat-patient-av">
          <User size={22} />
        </div>
        <div className="treat-patient-info">
          <h3>{profile.first_name || profile.last_name ? `${profile.first_name} ${profile.last_name}`.trim() : profile.email}</h3>
          <span className="treat-patient-meta">
            {fmtGender(profile.gender)} {age !== null ? ` · ${age} years` : ""} {profile.blood_group ? ` · ${profile.blood_group}` : ""}
          </span>
        </div>
      </div>
      {profile.address && (
        <div className="treat-patient-row">
          <span className="treat-patient-label">Address</span>
          <span>{profile.address}</span>
        </div>
      )}
      {profile.medical_history && (
        <div className="treat-patient-row">
          <span className="treat-patient-label">Medical History</span>
          <span>{profile.medical_history}</span>
        </div>
      )}
      {profile.allergies && (
        <div className="treat-patient-row">
          <span className="treat-patient-label">Allergies</span>
          <span>{profile.allergies}</span>
        </div>
      )}
    </Card>
  );
}

/* ======================================
   VISIT TIMELINE ENTRY
   ====================================== */

function VisitEntry({ entry }: { entry: VisitHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = entry.diagnosis || entry.prescription || entry.treatment_notes;

  const statusColors: Record<string, string> = {
    completed: "var(--color-status-completed)",
    confirmed: "var(--color-status-confirmed)",
    pending: "var(--color-status-pending)",
    cancelled: "var(--color-status-cancelled)",
    rejected: "var(--color-status-rejected)",
  };

  return (
    <div className="visit-timeline-entry">
      <div className="visit-timeline-dot" style={{ background: statusColors[entry.status] || "var(--color-primary)" }} />
      <div className="visit-timeline-line" />
      <div className="visit-timeline-card">
        <div className="visit-card-header">
          <div className="visit-card-date">
            <CalendarClock size={14} />
            <span>{fmtDate(entry.appointment_date)}</span>
            <span className="visit-card-sep">·</span>
            <Clock size={14} />
            <span>{fmtTime(entry.start_time)} – {fmtTime(entry.end_time)}</span>
          </div>
          <span className={`visit-status visit-status--${entry.status}`}>{entry.status}</span>
        </div>

        {entry.reason && (
          <div className="visit-card-field">
            <span className="visit-field-label"><FileText size={12} /> Reason</span>
            <span className="visit-field-value">{entry.reason}</span>
          </div>
        )}

        {hasDetails && (
          <button type="button" className="visit-expand-toggle" onClick={() => setExpanded(!expanded)}>
            <Stethoscope size={13} />
            {expanded ? "Hide treatment details" : "View treatment details"}
            <ChevronRight size={14} className={`visit-chevron ${expanded ? "visit-chevron--open" : ""}`} />
          </button>
        )}

        {expanded && (
          <div className="visit-details">
            {entry.diagnosis && (
              <div className="visit-detail-field">
                <span className="visit-detail-label"><Stethoscope size={12} /> Diagnosis</span>
                <span>{entry.diagnosis}</span>
              </div>
            )}
            {entry.treatment_notes && (
              <div className="visit-detail-field">
                <span className="visit-detail-label"><FileText size={12} /> Treatment Notes</span>
                <span>{entry.treatment_notes}</span>
              </div>
            )}
            {entry.prescription && (
              <div className="visit-detail-field">
                <span className="visit-detail-label"><Pill size={12} /> Prescription</span>
                <span>{entry.prescription}</span>
              </div>
            )}
            {entry.follow_up_date && (
              <div className="visit-detail-field">
                <span className="visit-detail-label"><Calendar size={12} /> Follow-up</span>
                <span>{fmtDate(entry.follow_up_date)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ======================================
   HEALTH RECORDS (doctor upload / delete)
   ====================================== */

const RECORD_TYPE_OPTIONS = [
  { value: "lab_report", label: "Lab report" },
  { value: "prescription", label: "Prescription" },
  { value: "xray", label: "X-ray" },
  { value: "imaging", label: "Imaging" },
  { value: "other", label: "Other" },
] as const;

function HealthRecordsSection({ patientId }: { patientId: number }) {
  const { notify } = useToast();
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", record_type: "other" });
  const [file, setFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getHealthRecords(patientId)
      .then((r) => setRecords(r.data?.results ?? []))
      .catch((e) => setError(msg(e)))
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("patient", String(patientId));
      fd.append("title", form.title.trim());
      fd.append("description", form.description.trim());
      fd.append("record_type", form.record_type);
      if (file) fd.append("file", file);
      await uploadHealthRecord(fd);
      notify("success", "Health record uploaded.");
      setForm({ title: "", description: "", record_type: "other" });
      setFile(null);
      setShowForm(false);
      load();
    } catch (reason) {
      setError(msg(reason));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteHealthRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      notify("success", "Health record deleted.");
    } catch (reason) {
      setError(msg(reason));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="visit-records-card">
      <div className="visit-card-header">
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Health records</h3>
          <p className="page__subtitle" style={{ margin: "4px 0 0" }}>
            Lab reports, prescriptions, and imaging for this patient
          </p>
        </div>
        <Button variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : <><Upload size={14} /> Upload record</>}
        </Button>
      </div>

      {error && <p className="form-note form-note--error">{error}</p>}

      {showForm && (
        <form className="visit-record-form" onSubmit={handleUpload}>
          <div className="treat-pf">
            <label htmlFor="hr-title">Title *</label>
            <input
              id="hr-title"
              className="field__input"
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. CBC panel — March 2026"
              required
            />
          </div>
          <div className="treat-pf">
            <label htmlFor="hr-type">Type</label>
            <select
              id="hr-type"
              className="field__input"
              value={form.record_type}
              onChange={(e) => setForm({ ...form, record_type: e.target.value })}
            >
              {RECORD_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="treat-pf">
            <label htmlFor="hr-desc">Description</label>
            <textarea
              id="hr-desc"
              className="field__input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional notes…"
            />
          </div>
          <div className="treat-pf">
            <label htmlFor="hr-file">File (optional)</label>
            <input
              id="hr-file"
              className="field__input"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="treat-actions-row">
            <Button type="submit" variant="primary" loading={saving}>
              Upload
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <Skeleton lines={3} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="No health records"
          description="Upload lab reports, prescriptions, or imaging for this patient."
        />
      ) : (
        <div className="health-records-list">
          {records.map((record) => (
            <div key={record.id} className="health-record-item">
              <div className="health-record-item__info">
                <span className="health-record-item__type">{record.record_type}</span>
                <span className="health-record-item__title">{record.title}</span>
                {record.description && (
                  <span className="health-record-item__desc">{record.description}</span>
                )}
                <span className="health-record-item__date">
                  {new Date(record.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="health-record-item__actions">
                {record.file && (
                  <a
                    href={record.file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ghost btn--sm"
                    title="Download"
                  >
                    <Download size={14} />
                  </a>
                )}
                <Button
                  variant="ghost"
                  loading={deletingId === record.id}
                  onClick={() => handleDelete(record.id)}
                  title="Delete record"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ======================================
   VISIT HISTORY PAGE
   ====================================== */

export default function VisitHistoryPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [history, setHistory] = useState<VisitHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const id = Number(patientId);
      const [histRes, patRes] = await Promise.all([
        getVisitHistory(id),
        getPatientProfileById(id),
      ]);
      setHistory(histRes.data ?? []);
      setPatient(patRes.data ?? null);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="page doctor-workspace">
        <div className="doctor-page-header">
          <Link to="/doctor/medical-treatment" className="treat-back-btn"><ArrowLeft size={16} /> Back to patients</Link>
          <p className="doctor-eyebrow">Visit History</p>
          <h1>Loading…</h1>
        </div>
        <Skeleton lines={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page doctor-workspace">
        <div className="doctor-page-header">
          <Link to="/doctor/medical-treatment" className="treat-back-btn"><ArrowLeft size={16} /> Back to patients</Link>
          <p className="doctor-eyebrow">Visit History</p>
          <h1>Error</h1>
        </div>
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <Link to="/doctor/medical-treatment" className="treat-back-btn">
            <ArrowLeft size={16} /> Back to patients
          </Link>
          <p className="doctor-eyebrow">Visit History</p>
          <h1>{patient ? `${patient.first_name || ""} ${patient.last_name || ""}`.trim() || patient.email : `Patient #${patientId}`}</h1>
          <p>Complete timeline of past appointments and treatments.</p>
        </div>
      </div>

      {patient && <PatientInfo profile={patient} />}

      {patientId && <HealthRecordsSection patientId={Number(patientId)} />}

      {history.length === 0 ? (
        <EmptyState
          icon={<Calendar size={28} />}
          title="No visits yet"
          description="This patient has no appointment history with you."
        />
      ) : (
        <div className="visit-timeline">
          {history.map((entry) => (
            <VisitEntry key={entry.appointment_id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
