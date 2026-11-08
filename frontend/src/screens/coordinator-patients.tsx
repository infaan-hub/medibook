import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileText,
  FlaskConical,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  Pill,
  Search,
  Siren,
  Stethoscope,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { CoordinatorHistory, CoordinatorPatient } from "../api/coordinator";
import { Badge, Card, EmptyState, ErrorState, Skeleton, type BadgeStatus } from "../components/ui";

const statusColors: Record<string, string> = {
  accepted: "#0a9f94",
  pending: "#f3a629",
  in_progress: "#7c3aed",
  done: "#2563eb",
  cancelled: "#a9b6bf",
  rejected: "#a9b6bf",
  expired: "#a9b6bf",
  "no-show": "#a9b6bf",
};

interface VisitPrescriptionItem {
  medication?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  route?: string | null;
  duration_days?: number | null;
  instructions?: string | null;
}

interface VisitPrescription {
  id: number;
  notes?: string | null;
  items?: VisitPrescriptionItem[];
}

interface VisitTreatment {
  id: number;
  diagnosis?: string | null;
  treatment_notes?: string | null;
  doctor_description?: string | null;
  prescription?: string | null;
  prescriptions?: VisitPrescription[];
  follow_up_date?: string | null;
  follow_up_time?: string | null;
}

interface VisitVital {
  id: number;
  recorded_at?: string | null;
  blood_pressure?: string | null;
  pulse_bpm?: number | null;
  temperature_c?: number | null;
  spo2_percent?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  bmi?: number | null;
  glucose_mg_dl?: number | null;
  notes?: string | null;
}

interface VisitLabOrder {
  id: number;
  status?: string | null;
  test_name?: string | null;
  result_value?: string | null;
  unit?: string | null;
  result_due_date?: string | null;
  result_notes?: string | null;
  notes?: string | null;
}

interface VisitReport {
  id: number;
  title?: string | null;
  record_type?: string | null;
  description?: string | null;
  file_name?: string | null;
}

interface VisitRecord {
  appointment_id: number;
  appointment_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status: string;
  appointment_type?: string | null;
  hospital_name?: string | null;
  reason?: string | null;
  notes?: string | null;
  cancel_reason?: string | null;
  booked_at?: string | null;
  checked_in_at?: string | null;
  consultation_started_at?: string | null;
  doctor_first_name?: string | null;
  doctor_last_name?: string | null;
  emergency_reason?: string | null;
  emergency_description?: string | null;
  emergency_requested_at?: string | null;
  emergency_accepted_at?: string | null;
  emergency_in_progress_at?: string | null;
  emergency_completed_at?: string | null;
  emergency_expired_at?: string | null;
  treatments?: VisitTreatment[];
  vitals?: VisitVital[];
  lab_orders?: VisitLabOrder[];
  patient_reports?: VisitReport[];
}

function labelType(type?: string | null) {
  return type === "EMERGENCY" ? "Emergency" : type === "HOME_SERVICE" ? "Home service" : "Hospital appointment";
}

function labelStatus(status?: string | null) {
  return (status || "unknown").replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatShortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : "—";
}

function patientName(patient: Pick<CoordinatorPatient, "first_name" | "last_name" | "username" | "email">) {
  return `${patient.first_name} ${patient.last_name}`.trim() || patient.username || patient.email;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "PT";
}

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function profileText(profile: Record<string, unknown> | null | undefined, key: string, fallback = "") {
  return stringValue(profile?.[key]) || fallback;
}

function formatBirthDate(value: unknown) {
  const text = stringValue(value);
  return text ? formatShortDate(text) : "Not recorded";
}

function joinParts(parts: Array<string | number | null | undefined>, separator = " · ") {
  return parts.filter((part) => part !== null && part !== undefined && part !== "").join(separator);
}

function doctorName(visit: VisitRecord) {
  return `${visit.doctor_first_name ?? ""} ${visit.doctor_last_name ?? ""}`.trim();
}

function visitTimestamp(value?: string | null) {
  return value ? formatDateTime(value) : "";
}

function PatientCard({ patient }: { patient: CoordinatorPatient }) {
  const name = patientName(patient);
  const bloodGroup = profileText(patient.profile, "blood_group");
  const gender = profileText(patient.profile, "gender");
  const birthDate = profileText(patient.profile, "date_of_birth");
  const facts = [
    bloodGroup ? { label: "Blood group", value: bloodGroup } : null,
    gender ? { label: "Gender", value: gender } : null,
    birthDate ? { label: "Date of birth", value: formatBirthDate(birthDate) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <Card className="coordinator-patient-card">
      <div className="coordinator-patient-card__head">
        <span className="coordinator-patient-avatar" aria-hidden="true">{initials(name)}</span>
        <div className="coordinator-patient-identity">
          <h2>{name}</h2>
          <p>{patient.email}</p>
        </div>
        <span className={`coordinator-patient-visits ${patient.appointment_count ? "coordinator-patient-visits--has" : ""}`}>
          {patient.appointment_count} visit{patient.appointment_count === 1 ? "" : "s"}
        </span>
      </div>

      {(patient.username || patient.phone) && (
        <div className="coordinator-patient-card__meta">
          {patient.username && <span><UserRound size={12} /> @{patient.username}</span>}
          {patient.phone && <span><Phone size={12} /> {patient.phone}</span>}
        </div>
      )}

      {facts.length > 0 && (
        <div className="coordinator-patient-card__facts">
          {facts.map((fact) => (
            <div className="coordinator-patient-fact" key={fact.label}>
              <span>{fact.label}</span>
              <b>{fact.value}</b>
            </div>
          ))}
        </div>
      )}

      <div className="coordinator-patient-card__footer">
        <small>{patient.appointment_count ? "Clinical history available" : "No appointments recorded yet"}</small>
        <Link to={`/coordinator/patient?patient=${patient.id}`} className="doctor-outline-button">
          View history <ArrowUpRight size={14} />
        </Link>
      </div>
    </Card>
  );
}

function ClinicalSection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="coordinator-clinical-section">
      <h4>{icon}{title}<span>{count}</span></h4>
      {children}
    </section>
  );
}

function VisitCard({ visit }: { visit: VisitRecord }) {
  const treatments = visit.treatments ?? [];
  const vitals = visit.vitals ?? [];
  const labOrders = visit.lab_orders ?? [];
  const reports = visit.patient_reports ?? [];
  const clinicalCount = treatments.length + vitals.length + labOrders.length + reports.length;
  const emergency = visit.appointment_type === "EMERGENCY" || Boolean(visit.emergency_reason);
  const primaryDiagnosis = treatments.find((treatment) => treatment.diagnosis)?.diagnosis;
  const doctor = doctorName(visit);
  const emergencyStamps = [
    { label: "Requested", value: visit.emergency_requested_at },
    { label: "Accepted", value: visit.emergency_accepted_at },
    { label: "Started", value: visit.emergency_in_progress_at },
    { label: "Completed", value: visit.emergency_completed_at },
    { label: "Expired", value: visit.emergency_expired_at },
  ].filter((stamp) => Boolean(stamp.value));
  const timeline = [
    visit.booked_at ? { icon: <CalendarDays size={11} />, label: `Booked ${visitTimestamp(visit.booked_at)}` } : null,
    visit.checked_in_at ? { icon: <CheckCircle2 size={11} />, label: `Checked in ${visitTimestamp(visit.checked_in_at)}` } : null,
    visit.consultation_started_at ? { icon: <Stethoscope size={11} />, label: `Consultation ${visitTimestamp(visit.consultation_started_at)}` } : null,
  ].filter(Boolean) as Array<{ icon: React.ReactNode; label: string }>;
  const clinicalSummary = [
    treatments.length ? `${treatments.length} treatment${treatments.length === 1 ? "" : "s"}` : "",
    vitals.length ? `${vitals.length} vital${vitals.length === 1 ? "" : "s"}` : "",
    labOrders.length ? `${labOrders.length} lab order${labOrders.length === 1 ? "" : "s"}` : "",
    reports.length ? `${reports.length} report${reports.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <Card className="coordinator-visit-card" style={{ borderLeftColor: statusColors[visit.status] ?? "#a9b6bf" }}>
      <div className="coordinator-visit-card__head">
        <div className="coordinator-visit-card__reference">
          <span className="coordinator-visit-card__type">{labelType(visit.appointment_type)}</span>
          <span className="coordinator-visit-card__id">#{visit.appointment_id}</span>
        </div>
        <Badge status={visit.status as BadgeStatus} />
      </div>

      <div className="coordinator-visit-card__when">
        <span><CalendarDays size={14} /> {formatDate(visit.appointment_date)}</span>
        <span><Clock3 size={14} /> {formatTime(visit.start_time)}–{formatTime(visit.end_time)}</span>
        {visit.hospital_name && <span><MapPin size={14} /> {visit.hospital_name}</span>}
      </div>

      <div className="coordinator-visit-card__doctor">
        <Stethoscope size={15} />
        {doctor ? `Dr. ${doctor}` : "Doctor not recorded"}
      </div>

      {visit.reason && (
        <div className="coordinator-visit-card__reason">
          <span>Reason for visit</span>
          <p>{visit.reason}</p>
        </div>
      )}

      {primaryDiagnosis && (
        <div className="coordinator-visit-card__diagnosis">
          <span>Diagnosis</span>
          <p>{primaryDiagnosis}</p>
        </div>
      )}

      {emergency && (
        <div className="coordinator-visit-card__emergency">
          <div className="coordinator-visit-card__emergency-head">
            <Siren size={14} /> Emergency visit
          </div>
          {visit.emergency_reason && <p><b>Emergency reason:</b> {visit.emergency_reason}</p>}
          {visit.emergency_description && <small>{visit.emergency_description}</small>}
          {emergencyStamps.length > 0 && (
            <div className="coordinator-visit-card__emergency-meta">
              {emergencyStamps.map((stamp) => (
                <span key={stamp.label}>{stamp.label} {visitTimestamp(stamp.value)}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {clinicalCount > 0 && (
        <details className="coordinator-visit-clinical">
          <summary>
            <ClipboardList size={14} />
            <span>Clinical details</span>
            <small>{clinicalSummary}</small>
            <ChevronDown size={14} className="coordinator-visit-clinical__chevron" />
          </summary>
          <div className="coordinator-visit-clinical__body">
            {treatments.length > 0 && (
              <ClinicalSection title="Treatments" icon={<Pill size={12} />} count={treatments.length}>
                {treatments.map((treatment) => (
                  <div className="coordinator-clinical-item" key={treatment.id}>
                    {treatment.diagnosis && <p><b>Diagnosis</b>{treatment.diagnosis}</p>}
                    {treatment.treatment_notes && <p><b>Treatment</b>{treatment.treatment_notes}</p>}
                    {treatment.doctor_description && <p><b>Doctor report</b>{treatment.doctor_description}</p>}
                    {treatment.prescription && <p><b>Prescription</b>{treatment.prescription}</p>}
                    {treatment.follow_up_date && (
                      <p><b>Follow-up</b>{formatDate(treatment.follow_up_date)}{treatment.follow_up_time ? ` · ${formatTime(treatment.follow_up_time)}` : ""}</p>
                    )}
                    {treatment.prescriptions?.map((prescription) => (
                      <div className="coordinator-clinical-prescription" key={prescription.id}>
                        {prescription.notes && <small>{prescription.notes}</small>}
                        {prescription.items?.map((item, index) => (
                          <p key={`${prescription.id}-${index}`}>
                            <Pill size={11} />
                            {joinParts([
                              item.medication,
                              item.dosage,
                              item.frequency,
                              item.route,
                              item.duration_days ? `${item.duration_days} days` : "",
                              item.instructions,
                            ])}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </ClinicalSection>
            )}

            {vitals.length > 0 && (
              <ClinicalSection title="Vitals" icon={<HeartPulse size={12} />} count={vitals.length}>
                {vitals.map((vital) => (
                  <div className="coordinator-clinical-item" key={vital.id}>
                    <b>{vital.recorded_at ? formatDateTime(vital.recorded_at) : "Vitals record"}</b>
                    <div className="coordinator-vital-grid">
                      {vital.blood_pressure && <span><small>BP</small><b>{vital.blood_pressure}</b></span>}
                      {vital.pulse_bpm != null && <span><small>Pulse</small><b>{vital.pulse_bpm} bpm</b></span>}
                      {vital.temperature_c != null && <span><small>Temp</small><b>{vital.temperature_c}°C</b></span>}
                      {vital.spo2_percent != null && <span><small>SpO2</small><b>{vital.spo2_percent}%</b></span>}
                      {vital.weight_kg != null && <span><small>Weight</small><b>{vital.weight_kg} kg</b></span>}
                      {vital.height_cm != null && <span><small>Height</small><b>{vital.height_cm} cm</b></span>}
                      {vital.bmi != null && <span><small>BMI</small><b>{vital.bmi}</b></span>}
                      {vital.glucose_mg_dl != null && <span><small>Glucose</small><b>{vital.glucose_mg_dl} mg/dL</b></span>}
                    </div>
                    {vital.notes && <small>{vital.notes}</small>}
                  </div>
                ))}
              </ClinicalSection>
            )}

            {labOrders.length > 0 && (
              <ClinicalSection title="Lab orders" icon={<FlaskConical size={12} />} count={labOrders.length}>
                {labOrders.map((lab) => (
                  <div className="coordinator-clinical-item" key={lab.id}>
                    <div className="coordinator-clinical-item__head">
                      <b>{lab.test_name || "Lab test"}</b>
                      {lab.status && (
                        <span className="coordinator-lab-status" style={{ color: statusColors[lab.status] ?? "#82909d" }}>
                          {labelStatus(lab.status)}
                        </span>
                      )}
                    </div>
                    <p>
                      {lab.result_value !== null && lab.result_value !== undefined && lab.result_value !== ""
                        ? `${lab.result_value}${lab.unit ? ` ${lab.unit}` : ""}`
                        : "No result recorded"}
                    </p>
                    {lab.result_due_date && <small>Due {formatDate(lab.result_due_date)}</small>}
                    {(lab.result_notes || lab.notes) && <small>{lab.result_notes || lab.notes}</small>}
                  </div>
                ))}
              </ClinicalSection>
            )}

            {reports.length > 0 && (
              <ClinicalSection title="Reports" icon={<FileText size={12} />} count={reports.length}>
                {reports.map((report) => (
                  <div className="coordinator-clinical-item" key={report.id}>
                    <b>{report.title || "Patient report"}</b>
                    <small>{joinParts([report.record_type, report.file_name || report.description || "Report"])}</small>
                    {report.file_name && report.description && <p>{report.description}</p>}
                  </div>
                ))}
              </ClinicalSection>
            )}
          </div>
        </details>
      )}

      {visit.notes && (
        <div className="coordinator-visit-card__note">
          <b>Notes</b>
          <p>{visit.notes}</p>
        </div>
      )}

      {visit.cancel_reason && (
        <div className="coordinator-visit-card__cancel">
          <AlertTriangle size={14} />
          <span><b>Cancellation reason</b>{visit.cancel_reason}</span>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="coordinator-visit-card__timeline">
          {timeline.map((item) => <span key={item.label}>{item.icon}{item.label}</span>)}
        </div>
      )}
    </Card>
  );
}

function PatientDirectory({
  patients,
  search,
  onSearchChange,
  loading,
  error,
  onRetry,
}: {
  patients: CoordinatorPatient[];
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "with" | "without">("all");

  const withVisits = patients.filter((patient) => patient.appointment_count > 0).length;
  const withoutVisits = patients.length - withVisits;
  const totalVisits = patients.reduce((sum, patient) => sum + patient.appointment_count, 0);
  const filters = [
    { key: "all" as const, label: "All", count: patients.length },
    { key: "with" as const, label: "With visits", count: withVisits },
    { key: "without" as const, label: "No visits", count: withoutVisits },
  ];
  const visible = patients.filter((patient) =>
    filter === "all" ? true : filter === "with" ? patient.appointment_count > 0 : patient.appointment_count === 0
  );
  const query = search.trim();

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Coordination center</p>
          <h1>Patients &amp; history</h1>
          <p>Search patient records and review the full clinical visit history across doctors.</p>
        </div>
        <div className="doctor-header-actions">
          <Link to="/coordinator/appointment" className="doctor-outline-button">
            <CalendarDays size={16} /> Appointment desk
          </Link>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : (
        <>
          {patients.length > 0 && (
            <div className="doctor-metrics">
              <Card className="doctor-metric">
                <span className="doctor-metric__icon doctor-metric__icon--teal"><Users size={19} /></span>
                <span>Patient records</span>
                <strong>{patients.length}</strong>
                <small>{withVisits} with visit history</small>
              </Card>
              <Card className="doctor-metric">
                <span className="doctor-metric__icon doctor-metric__icon--blue"><Activity size={19} /></span>
                <span>Visits on record</span>
                <strong>{totalVisits}</strong>
                <small>Across matching patient records</small>
              </Card>
              <Card className="doctor-metric">
                <span className="doctor-metric__icon doctor-metric__icon--violet"><UserRound size={19} /></span>
                <span>Returning patients</span>
                <strong>{withVisits}</strong>
                <small>At least one appointment recorded</small>
              </Card>
              <Card className="doctor-metric">
                <span className="doctor-metric__icon doctor-metric__icon--amber"><Clock3 size={19} /></span>
                <span>No visits yet</span>
                <strong>{withoutVisits}</strong>
                <small>Registered without an appointment</small>
              </Card>
            </div>
          )}

          <Card className="coordinator-patients-toolbar">
            <div className="coordinator-patients-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search by patient name, username, or email"
                aria-label="Search patients"
                autoComplete="off"
              />
              {search && (
                <button type="button" className="coordinator-patients-search__clear" onClick={() => onSearchChange("")} aria-label="Clear patient search">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="coordinator-patients-filters">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={filter === item.key ? "active" : ""}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label} <span>{item.count}</span>
                </button>
              ))}
            </div>
          </Card>

          <p className="coordinator-patients-count">
            {loading
              ? "Searching patient records..."
              : `Showing ${visible.length} of ${patients.length} patient records${query ? ` matching “${query}”` : ""}`}
          </p>

          {loading && patients.length === 0 ? (
            <Skeleton lines={6} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Users size={28} />}
              title={patients.length === 0 ? "No patients found" : "No matching patients"}
              description={
                patients.length === 0
                  ? query
                    ? "Try a different name, username, or email address."
                    : "Patient records will appear here after registration."
                  : "Try a different visit filter or search term."
              }
            />
          ) : (
            <div className="coordinator-patient-grid">
              {visible.map((patient) => <PatientCard key={patient.id} patient={patient} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PatientHistoryView({
  patientId,
  history,
  loading,
  error,
  onRetry,
}: {
  patientId: number;
  history: CoordinatorHistory | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const ready = Boolean(history && history.patient.id === patientId);
  const patient = ready && history ? history.patient : null;
  const visits = ready && history ? (history.visits as unknown as VisitRecord[]) : [];
  const sortedVisits = [...visits].sort((a, b) =>
    `${b.appointment_date}${b.start_time ?? ""}`.localeCompare(`${a.appointment_date}${a.start_time ?? ""}`)
  );
  const completed = visits.filter((visit) => visit.status === "done").length;
  const emergency = visits.filter((visit) => visit.appointment_type === "EMERGENCY").length;
  const open = visits.filter((visit) => ["pending", "accepted", "in_progress"].includes(visit.status)).length;
  const doctorCount = new Set(visits.map(doctorName).filter(Boolean)).size;
  const latest = sortedVisits[0] ?? null;
  const profile = patient?.profile ?? null;
  const name = patient ? patientName(patient) : "Patient history";
  const allergies = profileText(profile, "allergies", "None recorded");
  const medicalHistory = profileText(profile, "medical_history", "None recorded");

  return (
    <div className="page doctor-workspace">
      <div className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">Patient record</p>
          <h1>{ready ? name : "Patient history"}</h1>
          <p>
            {patient
              ? joinParts([patient.email, patient.phone, patient.username ? `@${patient.username}` : ""], " · ") ||
                "Patient contact details not recorded."
              : "Loading the patient record and visit history..."}
          </p>
        </div>
        <div className="doctor-header-actions">
          <Link to="/coordinator/patient" className="doctor-outline-button">
            <ArrowLeft size={16} /> All patients
          </Link>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !ready ? (
        loading ? <Skeleton lines={10} /> : (
          <EmptyState
            icon={<UserRound size={28} />}
            title="Patient record unavailable"
            description="This patient record could not be loaded."
            action={<Link to="/coordinator/patient" className="doctor-outline-button">Back to patients</Link>}
          />
        )
      ) : (
        <>
          <div className="doctor-metrics">
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--teal"><ClipboardList size={19} /></span>
              <span>Total visits</span>
              <strong>{visits.length}</strong>
              <small>{doctorCount} doctor{doctorCount === 1 ? "" : "s"} consulted · {open} open</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--blue"><CheckCircle2 size={19} /></span>
              <span>Completed visits</span>
              <strong>{completed}</strong>
              <small>{visits.length ? `${Math.round((completed / visits.length) * 100)}% of recorded visits` : "No visits recorded"}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--red"><Siren size={19} /></span>
              <span>Emergency visits</span>
              <strong>{emergency}</strong>
              <small>{emergency ? "Emergency timelines included below" : "No emergency visits recorded"}</small>
            </Card>
            <Card className="doctor-metric">
              <span className="doctor-metric__icon doctor-metric__icon--amber"><Clock3 size={19} /></span>
              <span>Last visit</span>
              <strong>{latest ? formatShortDate(latest.appointment_date) : "—"}</strong>
              <small>{latest ? formatDate(latest.appointment_date) : "No visits recorded"}</small>
            </Card>
          </div>

          <Card className="coordinator-patient-profile">
            <div className="doctor-card-heading">
              <div>
                <h2>Patient profile</h2>
                <p>Registration and medical details on file</p>
              </div>
              <span className="coordinator-patient-profile__tag"><UserRound size={14} /> Patient #{patient?.id}</span>
            </div>
            <div className="coordinator-profile-grid">
              <div className="coordinator-profile-field">
                <span>Email</span>
                <b><Mail size={13} /> {patient?.email || "Not recorded"}</b>
              </div>
              <div className="coordinator-profile-field">
                <span>Phone</span>
                <b><Phone size={13} /> {patient?.phone || "Not recorded"}</b>
              </div>
              <div className="coordinator-profile-field">
                <span>Username</span>
                <b>{patient?.username ? `@${patient.username}` : "Not recorded"}</b>
              </div>
              <div className="coordinator-profile-field">
                <span>Blood group</span>
                <b>{profileText(profile, "blood_group", "Not recorded")}</b>
              </div>
              <div className="coordinator-profile-field">
                <span>Gender</span>
                <b>{profileText(profile, "gender", "Not recorded")}</b>
              </div>
              <div className="coordinator-profile-field">
                <span>Date of birth</span>
                <b>{formatBirthDate(profile?.date_of_birth)}</b>
              </div>
              <div className="coordinator-profile-field coordinator-profile-field--wide">
                <span>Allergies</span>
                <p>{allergies}</p>
              </div>
              <div className="coordinator-profile-field coordinator-profile-field--wide">
                <span>Medical history</span>
                <p>{medicalHistory}</p>
              </div>
            </div>
          </Card>

          <div className="coordinator-visits-heading">
            <div>
              <h2>Visit history</h2>
              <p>Every appointment recorded for this patient, newest first.</p>
            </div>
            <span>{visits.length} visit{visits.length === 1 ? "" : "s"}</span>
          </div>

          {sortedVisits.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={28} />}
              title="No visit history"
              description="No appointment records have been recorded for this patient."
            />
          ) : (
            <div className="coordinator-visit-list">
              {sortedVisits.map((visit) => <VisitCard key={visit.appointment_id} visit={visit} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CoordinatorPatients({
  patients,
  history,
  selectedPatientId,
  search,
  onSearchChange,
  loading,
  error,
  onRetry,
}: {
  patients: CoordinatorPatient[];
  history: CoordinatorHistory | null;
  selectedPatientId: number | null;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (selectedPatientId) {
    return (
      <PatientHistoryView
        patientId={selectedPatientId}
        history={history}
        loading={loading}
        error={error}
        onRetry={onRetry}
      />
    );
  }

  return (
    <PatientDirectory
      patients={patients}
      search={search}
      onSearchChange={onSearchChange}
      loading={loading}
      error={error}
      onRetry={onRetry}
    />
  );
}
