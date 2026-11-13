import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Activity, ArrowUpRight, Brain, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, FilePlus2, FileText, GraduationCap, House, Lock, MapPin, Plus, Search, ShieldCheck, Stethoscope, Trash2, UserPlus, Users, XCircle } from "lucide-react";
import { approveDoctor, clearAuditEvents, createAdminDoctor, createAdminUser, deleteAdminDoctor, deleteAdminUser, getAdminDoctor, getAdminStats, listAdminUsers, listAuditEvents, unlockAdminUser, updateAdminDoctorFees, type AdminStats, type DoctorFeePayload } from "../api/admin";
import { deleteAppointment, listAllAppointments } from "../api/appointments";
import { apiGet } from "../api/client";
import { listDoctors } from "../api/doctors";
import type { Appointment, AuditEvent, DoctorProfile, User } from "../api/types";
import { Card, EmptyState, ErrorState, Skeleton, TextField } from "../components/ui";
import { useToast } from "../state/app-context";
import { useRealtimeSync } from "../realtime/socket";
import { formatDate as formatIntlDate, formatNumber } from "../lib/intl";
import { formatFeePair } from "../lib/money";

function message(error: unknown): string { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }
/** Format a stored doctor rating (Decimal may arrive as a string) for display. */
function formatRating(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "New";
  const num = typeof value === "string" ? Number(value) : value;
  return (Number.isFinite(num) ? num : 0).toFixed(1);
}
/** Admin-managed appointment fee, with the legacy field as a fallback. */
function doctorAppointmentFee(doctor: DoctorProfile): string {
  return doctor.appointment_fee ?? doctor.consultation_fee ?? "0";
}
function doctorAppointmentFeeUsd(doctor: DoctorProfile): string {
  return doctor.appointment_fee_usd ?? "0";
}
function formatDate(value: string): string { return formatIntlDate(value, { month: "short", day: "numeric", year: "numeric" }); }
function formatTime(value: string): string { return formatIntlDate(value, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
/** Compact rows carry an `HTTP …` detail line — show the target path instead. */
function activityLine(event: AuditEvent): string {
  return event.detail && !event.detail.startsWith("HTTP ") ? event.detail : event.target;
}

function AdminHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  const { t } = useTranslation();
  return <div className="admin-page-header"><div><p className="admin-eyebrow">{t("adminDashboard.controlCenter")}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function MetricCard({ label, value, icon, tone, detail }: { label: string; value: number; icon: ReactNode; tone: string; detail: string }) {
  return <Card className="admin-metric"><span className={`admin-metric__icon ${tone}`}>{icon}</span><span className="admin-metric__label">{label}</span><strong>{formatNumber(value)}</strong><span className="admin-metric__detail">{detail}</span></Card>;
}

export function AdminDashboardScreen() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminStats | null>(null); const [events, setEvents] = useState<AuditEvent[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const [expiredTraining, setExpiredTraining] = useState(0); const [expiredPsychotherapy, setExpiredPsychotherapy] = useState(0);
  const load = useCallback(() => { setLoading(true); setError(null); Promise.all([getAdminStats(), listAuditEvents({ page_size: 5 }), apiGet<any[]>("/training"), apiGet<any[]>("/psychotherapy")]).then(([statsResponse, auditResponse, trainingResponse, psychotherapyResponse]) => { setStats(statsResponse.data); setEvents(auditResponse.data.results); setExpiredTraining((trainingResponse.data ?? []).filter((item) => item.status === "expired").length); setExpiredPsychotherapy((psychotherapyResponse.data ?? []).filter((item) => item.status === "expired").length); }).catch((reason) => setError(message(reason))).finally(() => setLoading(false)); }, []);
  const refresh = useCallback(() => { Promise.all([getAdminStats(), listAuditEvents({ page_size: 5 }), apiGet<any[]>("/training"), apiGet<any[]>("/psychotherapy")]).then(([statsResponse, auditResponse, trainingResponse, psychotherapyResponse]) => { setStats(statsResponse.data); setEvents(auditResponse.data.results); setExpiredTraining((trainingResponse.data ?? []).filter((item) => item.status === "expired").length); setExpiredPsychotherapy((psychotherapyResponse.data ?? []).filter((item) => item.status === "expired").length); }).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useRealtimeSync({ refresh, events: ["appointment.created", "appointment.updated", "user.created", "doctor.updated"] });
  if (loading) return <div className="admin-workspace"><Skeleton lines={8} /></div>;
  if (error || !stats) return <div className="admin-workspace"><ErrorState message={error ?? t("adminDashboard.couldNotLoad")} onRetry={load} /></div>;
  const statuses = Object.entries(stats.appointments_by_status); const maxStatus = Math.max(...statuses.map(([, count]) => count), 1);
  return <div className="admin-workspace">
    <AdminHeader title={t("adminDashboard.overview")} description={t("adminDashboard.overviewDesc")} action={<div className="admin-header-actions"><Link to="/admin/audit" className="admin-outline-button"><Activity size={16} /> {t("adminDashboard.auditLog")}</Link><Link to="/admin/users/new" className="admin-primary-button"><Plus size={16} /> {t("adminDashboard.addUser")}</Link></div>} />
    <div className="admin-metrics"><MetricCard label={t("adminDashboard.totalUsers")} value={stats.users} detail={t("adminDashboard.acrossRoles")} tone="admin-metric__icon--blue" icon={<Users size={19} />} /><MetricCard label={t("adminDashboard.patients")} value={stats.patients} detail={t("adminDashboard.registeredPatients")} tone="admin-metric__icon--teal" icon={<ShieldCheck size={19} />} /><MetricCard label={t("adminDashboard.doctors")} value={stats.doctors} detail={t("adminDashboard.activeProfiles")} tone="admin-metric__icon--violet" icon={<Stethoscope size={19} />} /><MetricCard label={t("adminDashboard.appointments")} value={stats.appointments} detail={t("adminDashboard.allTimeBookings")} tone="admin-metric__icon--amber" icon={<Clock3 size={19} />} /></div>
    <div className="admin-dashboard-grid"><Card className="admin-chart-card"><div className="admin-card-heading"><div><h2>{t("adminDashboard.appointmentActivity")}</h2><p>{t("adminDashboard.distributionByStatus")}</p></div><span className="admin-chart-caption"><Activity size={15} /> {t("adminDashboard.liveData")}</span></div><div className="admin-bar-chart">{statuses.length ? statuses.map(([status, count]) => <div className="admin-bar-row" key={status}><span>{status}</span><div><i style={{ width: `${Math.max((count / maxStatus) * 100, count ? 8 : 0)}%` }} /></div><strong>{count}</strong></div>) : <EmptyState title={t("adminDashboard.noAppointmentActivity")} />}</div></Card><Card className="admin-chart-card admin-breakdown"><div className="admin-card-heading"><div><h2>{t("adminDashboard.platformHealth")}</h2><p>{t("adminDashboard.atAGlance")}</p></div><CircleDollarSign size={19} /></div><div className="admin-donut" style={{ "--donut": `${stats.users ? (stats.patients / stats.users) * 100 : 0}%` } as React.CSSProperties}><span>{stats.users ? Math.round((stats.patients / stats.users) * 100) : 0}%<small>{t("adminDashboard.patientsPercent")}</small></span></div><div className="admin-legend"><span><i className="admin-dot admin-dot--teal" /> {t("adminDashboard.patients")} <b>{stats.patients}</b></span><span><i className="admin-dot admin-dot--violet" /> {t("adminDashboard.doctors")} <b>{stats.doctors}</b></span></div></Card></div>
    <div className="admin-dashboard-grid admin-dashboard-grid--lower"><Card className="admin-quick-card"><div className="admin-card-heading"><div><h2>{t("adminDashboard.quickActions")}</h2><p>{t("adminDashboard.commonAdminTasks")}</p></div></div><div className="admin-action-grid"><Link to="/admin/users/new"><UserPlus size={18} /><span><b>{t("adminDashboard.addAUser")}</b><small>{t("adminDashboard.createPatientOrStaff")}</small></span><ChevronRight size={15} /></Link><Link to="/admin/doctors/new"><FilePlus2 size={18} /><span><b>{t("adminDashboard.addADoctor")}</b><small>{t("adminDashboard.setupProfessionalProfile")}</small></span><ChevronRight size={15} /></Link><Link to="/admin/users"><Users size={18} /><span><b>{t("adminDashboard.reviewUsers")}</b><small>{t("adminDashboard.searchAndFilterAccounts")}</small></span><ChevronRight size={15} /></Link><Link to="/admin/doctors"><Stethoscope size={18} /><span><b>{t("adminDashboard.reviewDoctors")}</b><small>{t("adminDashboard.approveOrSuspend")}</small></span><ChevronRight size={15} /></Link><Link to="/admin/appointments"><Clock3 size={18} /><span><b>{t("adminDashboard.manageAppointments")}</b><small>{t("adminDashboard.viewFilterDelete")}</small></span><ChevronRight size={15} /></Link><Link to="/admin/home-visit"><House size={18} /><span><b>{t("adminDashboard.homeService")}</b><small>{t("adminDashboard.viewManageHomeVisits")}</small></span><ChevronRight size={15} /></Link><Link to="/admin/training"><GraduationCap size={18} /><span><b>{t("adminDashboard.training")}</b><small>{t("adminDashboard.viewManageTraining")}{expiredTraining ? ` · ${expiredTraining} ${t("adminDashboard.expired")}` : ""}</small></span><ChevronRight size={15} /></Link><Link to="/admin/psychotherapy"><Brain size={18} /><span><b>{t("adminDashboard.psychologyService")}</b><small>{t("adminDashboard.viewManagePsychology")}{expiredPsychotherapy ? ` · ${expiredPsychotherapy} ${t("adminDashboard.expired")}` : ""}</small></span><ChevronRight size={15} /></Link><Link to="/admin/reports"><FileText size={18} /><span><b>{t("adminDashboard.reports")}</b><small>{t("adminDashboard.generateReports")}</small></span><ChevronRight size={15} /></Link></div></Card><Card className="admin-activity-card"><div className="admin-card-heading"><div><h2>{t("adminDashboard.recentActivity")}</h2><p>{t("adminDashboard.latestActivity")}</p></div><Link to="/admin/audit">View all <ArrowUpRight size={15} /></Link></div>{events.length ? <div className="admin-activity-list">{events.slice(0, 5).map((event) => <div key={event.id}><span className="admin-activity-icon"><CheckCircle2 size={15} /></span><span><b>{event.action.replace(/[._]/g, " ")}</b><small>{activityLine(event)} Â· {formatTime(event.created_at)}</small></span></div>)}</div> : <EmptyState title="No activity yet" description="Logins, bookings and admin actions will appear here." />}</Card></div>
  </div>;
}

export function AdminUsersScreen() {
  const { notify } = useToast();
  const [users, setUsers] = useState<User[]>([]); const [role, setRole] = useState(""); const [query, setQuery] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [deletingId, setDeletingId] = useState<number | null>(null); const [unlockingId, setUnlockingId] = useState<number | null>(null);
  const load = useCallback(() => { setLoading(true); listAdminUsers(role ? { role } : {}).then((response) => setUsers(response.data.results)).catch((reason) => setError(message(reason))).finally(() => setLoading(false)); }, [role]); useEffect(() => { load(); }, [load]);
  const refresh = useCallback(() => { listAdminUsers(role ? { role } : {}).then((response) => setUsers(response.data.results)).catch(() => {}); }, [role]);
  useRealtimeSync({ refresh, events: ["user.created", "user.deleted", "user.updated"] });
  async function handleDelete(user: User) {
    if (!window.confirm(`Delete ${user.first_name || user.username}'s account? Their appointments and reviews will also be removed.`)) return;
    setDeletingId(user.id);
    try { await deleteAdminUser(user.id); notify("success", "User deleted."); setUsers((current) => current.filter((item) => item.id !== user.id)); } catch (reason) { notify("error", message(reason)); } finally { setDeletingId(null); }
  }
  async function handleUnlock(user: User) {
    setUnlockingId(user.id);
    try { const response = await unlockAdminUser(user.id); notify("success", "Account unlocked."); setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, ...response.data } : item))); } catch (reason) { notify("error", message(reason)); } finally { setUnlockingId(null); }
  }
  const filtered = users.filter((user) => `${user.first_name} ${user.last_name} ${user.email} ${user.username}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="admin-workspace"><AdminHeader title="Users" description="Manage every account across the platform." action={<Link to="/admin/users/new" className="admin-primary-button"><UserPlus size={16} /> Add user</Link>} /><Card className="admin-table-card"><div className="admin-table-toolbar"><div className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users..." /></div><div className="admin-filter-tabs">{[["", "All"], ["patient", "Patients"], ["doctor", "Doctors"], ["admin", "Admins"], ["coordinator", "System coordinators"]].map(([key, label]) => <button key={key} className={role === key ? "active" : ""} onClick={() => setRole(key)}>{label}</button>)}</div></div>{error && <ErrorState message={error} onRetry={load} />}{loading ? <Skeleton lines={5} /> : filtered.length === 0 ? <EmptyState title="No users found" description="Try a different search or filter." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Role</th><th>Joined</th><th /></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><span className="admin-table-user"><span>{(user.first_name[0] || user.username[0] || "U").toUpperCase()}</span><b>{user.first_name || user.username} {user.last_name}</b><small>{user.email}</small>{user.account_locked && <span className="admin-status admin-status--pending"><Lock size={12} /> Locked{user.lock_reason === "ADMIN_REQUIRED" ? " (admin unlock)" : ""}</span>}{!user.account_locked && (user.failed_login_attempts ?? 0) > 0 && <small>{user.failed_login_attempts} failed attempt{(user.failed_login_attempts ?? 0) === 1 ? "" : "s"}</small>}</span></td><td><span className={`admin-role admin-role--${user.role}`}>{user.role === "coordinator" ? "System coordinator" : user.role}</span></td><td>{user.date_joined ? formatDate(user.date_joined) : "â€”"}</td><td>{user.account_locked && <button className="admin-table-action" disabled={unlockingId === user.id} onClick={() => handleUnlock(user)}><Lock size={14} /> {unlockingId === user.id ? "Unlocking..." : "Unlock"}</button>}{user.role !== "admin" && <button className="admin-table-action" style={{ color: "var(--color-danger, #dc2626)", marginLeft: 8 }} disabled={deletingId === user.id} onClick={() => handleDelete(user)}><Trash2 size={14} /> {deletingId === user.id ? "Deleting..." : "Delete"}</button>}<ChevronRight size={17} /></td></tr>)}</tbody></table></div>}</Card></div>;
}

export function AdminDoctorsScreen() {
  const { notify } = useToast(); const [doctors, setDoctors] = useState<DoctorProfile[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [deletingId, setDeletingId] = useState<number | null>(null);
  const load = useCallback(() => { setLoading(true); listDoctors({ page_size: 100 }).then((response) => setDoctors(response.data.results)).catch((reason) => setError(message(reason))).finally(() => setLoading(false)); }, []); useEffect(() => { load(); }, [load]);
  const refresh = useCallback(() => { listDoctors({ page_size: 100 }).then((response) => setDoctors(response.data.results)).catch(() => {}); }, []);
  useRealtimeSync({ refresh, events: ["doctor.created", "doctor.updated", "doctor.deleted"] });
  async function toggle(doctor: DoctorProfile) { try { await approveDoctor(doctor.id, !doctor.is_available); notify("success", doctor.is_available ? "Doctor suspended." : "Doctor approved."); load(); } catch (reason) { notify("error", message(reason)); } }
  async function handleDelete(doctor: DoctorProfile) {
    if (!window.confirm(`Delete Dr. ${doctor.first_name} ${doctor.last_name}? Their profile, account and appointments will be removed.`)) return;
    setDeletingId(doctor.id);
    try { await deleteAdminDoctor(doctor.id); notify("success", "Doctor deleted."); setDoctors((current) => current.filter((item) => item.id !== doctor.id)); } catch (reason) { notify("error", message(reason)); } finally { setDeletingId(null); }
  }
  return <div className="admin-workspace"><AdminHeader title="Doctors" description="Review professional profiles and availability." action={<Link to="/admin/doctors/new" className="admin-primary-button"><Plus size={16} /> Add doctor</Link>} /><Card className="admin-table-card">{error && <ErrorState message={error} onRetry={load} />}{loading ? <Skeleton lines={6} /> : doctors.length === 0 ? <EmptyState title="No doctors yet" description="Create the first doctor profile to get started." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Doctor</th><th>Experience</th><th>Rating</th><th>Appointment fee</th><th>Status</th><th>Actions</th></tr></thead><tbody>{doctors.map((doctor) => <tr key={doctor.id}><td><span className="admin-table-user"><span className="admin-doctor-avatar"><Stethoscope size={16} /></span><b><Link to={`/admin/doctors/${doctor.id}`} className="admin-table-doctor-link">Dr. {doctor.first_name} {doctor.last_name}</Link></b><small>{doctor.specialties && doctor.specialties.length > 0 ? doctor.specialties.map((s) => s.patient_friendly_name || s.name).join(", ") : "Profile details pending"}</small></span></td><td>{doctor.experience_years ?? 0} years</td><td>{formatRating(doctor.average_rating)}</td><td>{formatFeePair(doctorAppointmentFee(doctor), doctorAppointmentFeeUsd(doctor))}</td><td>{doctor.is_available ? <span className="admin-status admin-status--good"><CheckCircle2 size={14} /> Active</span> : <span className="admin-status admin-status--pending"><XCircle size={14} /> Suspended</span>}</td><td><button className="admin-table-action" onClick={() => toggle(doctor)}>{doctor.is_available ? "Suspend" : "Approve"}</button><button className="admin-table-action" style={{ color: "var(--color-danger, #dc2626)", margin: "0 0 0 12px" }} disabled={deletingId === doctor.id} onClick={() => handleDelete(doctor)}><Trash2 size={14} /> {deletingId === doctor.id ? "Deleting..." : "Delete"}</button><Link className="admin-table-action admin-table-action--quiet" to={`/admin/doctors/${doctor.id}`}>View</Link></td></tr>)}</tbody></table></div>}</Card></div>;
}

export function AdminDoctorDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const doctorId = Number(id);
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [fees, setFees] = useState<Required<DoctorFeePayload>>({
    appointment_fee: "0",
    home_service_fee: "0",
    psychotherapy_fee: "0",
    training_fee: "0",
    appointment_fee_usd: "0",
    home_service_fee_usd: "0",
    psychotherapy_fee_usd: "0",
    training_fee_usd: "0",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!Number.isInteger(doctorId) || doctorId <= 0) {
      setError("Invalid doctor id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getAdminDoctor(doctorId)
      .then((response) => {
        setDoctor(response.data);
        setFees({
          appointment_fee: response.data.appointment_fee ?? response.data.consultation_fee ?? "0",
          home_service_fee: response.data.home_service_fee ?? "0",
          psychotherapy_fee: response.data.psychotherapy_fee ?? "0",
          training_fee: response.data.training_fee ?? "0",
          appointment_fee_usd: response.data.appointment_fee_usd ?? "0",
          home_service_fee_usd: response.data.home_service_fee_usd ?? "0",
          psychotherapy_fee_usd: response.data.psychotherapy_fee_usd ?? "0",
          training_fee_usd: response.data.training_fee_usd ?? "0",
        });
      })
      .catch((reason) => setError(message(reason)))
      .finally(() => setLoading(false));
  }, [doctorId]);
  useEffect(() => { load(); }, [load]);

  function updateFee(name: keyof DoctorFeePayload, value: string) {
    setFees((current) => ({ ...current, [name]: value }));
  }

  async function saveFees(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await updateAdminDoctorFees(doctorId, fees);
      setDoctor(response.data);
      setFees({
        appointment_fee: response.data.appointment_fee ?? response.data.consultation_fee ?? "0",
        home_service_fee: response.data.home_service_fee ?? "0",
        psychotherapy_fee: response.data.psychotherapy_fee ?? "0",
        training_fee: response.data.training_fee ?? "0",
        appointment_fee_usd: response.data.appointment_fee_usd ?? "0",
        home_service_fee_usd: response.data.home_service_fee_usd ?? "0",
        psychotherapy_fee_usd: response.data.psychotherapy_fee_usd ?? "0",
        training_fee_usd: response.data.training_fee_usd ?? "0",
      });
      notify("success", "Service fees updated.");
    } catch (reason) {
      notify("error", message(reason));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!doctor) return;
    setBusy(true);
    try {
      const response = await approveDoctor(doctor.id, !doctor.is_available);
      setDoctor(response.data);
      notify("success", doctor.is_available ? "Doctor suspended." : "Doctor approved.");
    } catch (reason) {
      notify("error", message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeDoctor() {
    if (!doctor) return;
    if (!window.confirm(`Delete Dr. ${doctor.first_name} ${doctor.last_name}? Their profile, account and appointments will be removed.`)) return;
    setBusy(true);
    try {
      await deleteAdminDoctor(doctor.id);
      notify("success", "Doctor deleted.");
      navigate("/admin/doctors");
    } catch (reason) {
      notify("error", message(reason));
      setBusy(false);
    }
  }

  if (loading) return <div className="admin-workspace"><Skeleton lines={8} /></div>;
  if (error || !doctor) return <div className="admin-workspace"><ErrorState message={error ?? "Doctor not found."} onRetry={load} /></div>;

  const specialties = doctor.specialties?.map((s) => s.patient_friendly_name || s.name).join(", ");

  return <div className="admin-workspace admin-form-page">
    <AdminHeader
      title={`Dr. ${doctor.first_name} ${doctor.last_name}`}
      description="Preview the full doctor profile and manage the service fees."
      action={<div className="admin-header-actions"><Link to="/admin/doctors" className="admin-outline-button">Back to doctors</Link><button className="admin-primary-button" type="button" disabled={busy} onClick={() => void toggleStatus()}>{doctor.is_available ? "Suspend" : "Approve"}</button><button className="admin-outline-button admin-danger-button" type="button" disabled={busy} onClick={() => void removeDoctor()}><Trash2 size={15} /> Delete</button></div>}
    />
    <div className="admin-doctor-detail">
      <Card className="admin-form-card">
        <div className="admin-card-heading"><div><h2>{t("adminDashboard.doctorProfile", { defaultValue: "Doctor information" })}</h2><p>{t("adminDashboard.doctorProfileDesc", { defaultValue: "Everything patients see on the doctor's card." })}</p></div><span className={`admin-status ${doctor.is_available ? "admin-status--good" : "admin-status--pending"}`}>{doctor.is_available ? <><CheckCircle2 size={14} /> Active</> : <><XCircle size={14} /> Suspended</>}</span></div>
        <div className="admin-doctor-detail__hero">
          <span className="admin-doctor-avatar admin-doctor-avatar--large"><Stethoscope size={28} /></span>
          <div><strong>Dr. {doctor.first_name} {doctor.last_name}</strong><small>{specialties || "Profile details pending"}</small></div>
        </div>
        <dl className="admin-detail-grid">
          <div><dt>Email</dt><dd>{doctor.email || "—"}</dd></div>
          <div><dt>Primary phone</dt><dd>{doctor.phone || "—"}</dd></div>
          <div><dt>Secondary phone</dt><dd>{doctor.phone_secondary || "—"}</dd></div>
          <div><dt>Experience</dt><dd>{doctor.experience_years ?? 0} years</dd></div>
          <div><dt>Rating</dt><dd>{formatRating(doctor.average_rating)}{doctor.total_reviews ? ` (${doctor.total_reviews} reviews)` : ""}</dd></div>
          <div><dt>Status</dt><dd>{doctor.is_available ? "Active" : "Suspended"}</dd></div>
          <div><dt>Qualifications</dt><dd>{doctor.qualifications || "—"}</dd></div>
          <div><dt>Location</dt><dd>{doctor.has_location ? "Location shared" : "Not shared"}</dd></div>
          <div className="admin-detail-grid__wide"><dt>Specialties</dt><dd>{specialties || "—"}</dd></div>
          <div className="admin-detail-grid__wide"><dt>Professional bio</dt><dd>{doctor.bio || "—"}</dd></div>
        </dl>
      </Card>
      <Card className="admin-form-card">
        <div className="admin-card-heading"><div><h2>{t("adminDashboard.serviceFees", { defaultValue: "Service fees" })}</h2><p>{t("adminDashboard.serviceFeesDesc", { defaultValue: "These fees are set by the admin and shown on the doctor card. Doctors cannot edit them." })}</p></div><CircleDollarSign size={19} /></div>
        <form onSubmit={saveFees}>
          <div className="admin-form-grid">
            <TextField id="admin-fee-appointment" label="Appointment fee (TSh)" name="appointment_fee" inputMode="decimal" value={fees.appointment_fee ?? ""} onChange={(e) => updateFee("appointment_fee", e.target.value)} />
            <TextField id="admin-fee-appointment-usd" label="Appointment fee (USD $)" name="appointment_fee_usd" inputMode="decimal" value={fees.appointment_fee_usd ?? ""} onChange={(e) => updateFee("appointment_fee_usd", e.target.value)} />
            <TextField id="admin-fee-home" label="Home service fee (TSh)" name="home_service_fee" inputMode="decimal" value={fees.home_service_fee ?? ""} onChange={(e) => updateFee("home_service_fee", e.target.value)} />
            <TextField id="admin-fee-home-usd" label="Home service fee (USD $)" name="home_service_fee_usd" inputMode="decimal" value={fees.home_service_fee_usd ?? ""} onChange={(e) => updateFee("home_service_fee_usd", e.target.value)} />
            <TextField id="admin-fee-psychotherapy" label="Psychological service fee (TSh)" name="psychotherapy_fee" inputMode="decimal" value={fees.psychotherapy_fee ?? ""} onChange={(e) => updateFee("psychotherapy_fee", e.target.value)} />
            <TextField id="admin-fee-psychotherapy-usd" label="Psychological service fee (USD $)" name="psychotherapy_fee_usd" inputMode="decimal" value={fees.psychotherapy_fee_usd ?? ""} onChange={(e) => updateFee("psychotherapy_fee_usd", e.target.value)} />
            <TextField id="admin-fee-training" label="Training fee (TSh)" name="training_fee" inputMode="decimal" value={fees.training_fee ?? ""} onChange={(e) => updateFee("training_fee", e.target.value)} />
            <TextField id="admin-fee-training-usd" label="Training fee (USD $)" name="training_fee_usd" inputMode="decimal" value={fees.training_fee_usd ?? ""} onChange={(e) => updateFee("training_fee_usd", e.target.value)} />
          </div>
          <div className="admin-form-actions"><button className="admin-primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save fees"}</button></div>
        </form>
      </Card>
    </div>
  </div>;
}

export function AdminCreateUserScreen() {
  const { notify } = useToast(); const [saving, setSaving] = useState(false); const [form, setForm] = useState({ username: "", email: "", password: "", first_name: "", last_name: "", phone: "", role: "patient" as "patient" | "doctor" | "coordinator" });
  function update(name: string, value: string) { setForm((current) => ({ ...current, [name]: value })); }
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await createAdminUser(form); notify("success", `${form.role === "coordinator" ? "System coordinator" : form.role === "doctor" ? "Doctor" : "Patient"} account created successfully.`); setForm({ username: "", email: "", password: "", first_name: "", last_name: "", phone: "", role: "patient" }); } catch (reason) { notify("error", message(reason)); } finally { setSaving(false); } }
  return <div className="admin-workspace admin-form-page"><AdminHeader title="Add user" description="Create a patient, doctor, or system coordinator account." action={<Link to="/admin/users" className="admin-outline-button">Back to users</Link>} /><Card className="admin-form-card"><form onSubmit={submit}><div className="admin-form-grid"><TextField id="admin-first-name" label="First name" name="first_name" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required /><TextField id="admin-last-name" label="Last name" name="last_name" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} required /><TextField id="admin-username" label="Username" name="username" value={form.username} onChange={(e) => update("username", e.target.value)} required /><TextField id="admin-email" label="Email" name="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required /><TextField id="admin-password" label="Temporary password" name="password" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required /><TextField id="admin-phone" label="Phone" name="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} /><label className="admin-field" htmlFor="admin-account-role"><span>Account role</span><select id="admin-account-role" value={form.role} aria-describedby="admin-role-hint" onChange={(event) => update("role", event.target.value)}><option value="patient">Patient</option><option value="doctor">Doctor</option><option value="coordinator">System coordinator</option></select><small id="admin-role-hint">{form.role === "coordinator" ? "Coordinates doctors, appointments, emergencies, and patient history." : form.role === "doctor" ? "Creates a doctor account; use Add doctor to create a full professional profile." : "Creates a patient account."}</small></label></div><div className="admin-form-actions"><Link to="/admin/users" className="admin-outline-button">Cancel</Link><button className="admin-primary-button" disabled={saving} type="submit"><UserPlus size={16} /> {saving ? "Creating..." : "Create user"}</button></div></form></Card></div>;
}

const EMPTY_DOCTOR_FORM = {
  username: "",
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  qualifications: "",
  experience_years: "0",
  appointment_fee: "0",
  home_service_fee: "0",
  psychotherapy_fee: "0",
  training_fee: "0",
  appointment_fee_usd: "0",
  home_service_fee_usd: "0",
  psychotherapy_fee_usd: "0",
  training_fee_usd: "0",
  bio: "",
};

export function AdminCreateDoctorScreen() {
  const { notify } = useToast(); const [saving, setSaving] = useState(false); const [form, setForm] = useState(EMPTY_DOCTOR_FORM);
  function update(name: string, value: string) { setForm((current) => ({ ...current, [name]: value })); }
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await createAdminDoctor({ ...form, experience_years: Number(form.experience_years) }); notify("success", "Doctor profile created successfully."); setForm(EMPTY_DOCTOR_FORM); } catch (reason) { notify("error", message(reason)); } finally { setSaving(false); } }
  return <div className="admin-workspace admin-form-page"><AdminHeader title="Add doctor" description="Create an account and professional profile together." action={<Link to="/admin/doctors" className="admin-outline-button">Back to doctors</Link>} /><Card className="admin-form-card"><form onSubmit={submit}><div className="admin-form-grid"><TextField id="admin-doctor-first-name" label="First name" name="first_name" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required /><TextField id="admin-doctor-last-name" label="Last name" name="last_name" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} required /><TextField id="admin-doctor-username" label="Username" name="username" value={form.username} onChange={(e) => update("username", e.target.value)} required /><TextField id="admin-doctor-email" label="Email" name="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required /><TextField id="admin-doctor-password" label="Temporary password" name="password" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required /><TextField id="admin-doctor-experience" label="Experience (years)" name="experience_years" type="number" value={form.experience_years} onChange={(e) => update("experience_years", e.target.value)} /><TextField id="admin-doctor-appointment-fee" label="Appointment fee (TSh)" name="appointment_fee" inputMode="decimal" value={form.appointment_fee} onChange={(e) => update("appointment_fee", e.target.value)} /><TextField id="admin-doctor-appointment-fee-usd" label="Appointment fee (USD $)" name="appointment_fee_usd" inputMode="decimal" value={form.appointment_fee_usd} onChange={(e) => update("appointment_fee_usd", e.target.value)} /><TextField id="admin-doctor-home-fee" label="Home service fee (TSh)" name="home_service_fee" inputMode="decimal" value={form.home_service_fee} onChange={(e) => update("home_service_fee", e.target.value)} /><TextField id="admin-doctor-home-fee-usd" label="Home service fee (USD $)" name="home_service_fee_usd" inputMode="decimal" value={form.home_service_fee_usd} onChange={(e) => update("home_service_fee_usd", e.target.value)} /><TextField id="admin-doctor-psychotherapy-fee" label="Psychological service fee (TSh)" name="psychotherapy_fee" inputMode="decimal" value={form.psychotherapy_fee} onChange={(e) => update("psychotherapy_fee", e.target.value)} /><TextField id="admin-doctor-psychotherapy-fee-usd" label="Psychological service fee (USD $)" name="psychotherapy_fee_usd" inputMode="decimal" value={form.psychotherapy_fee_usd} onChange={(e) => update("psychotherapy_fee_usd", e.target.value)} /><TextField id="admin-doctor-training-fee" label="Training fee (TSh)" name="training_fee" inputMode="decimal" value={form.training_fee} onChange={(e) => update("training_fee", e.target.value)} /><TextField id="admin-doctor-training-fee-usd" label="Training fee (USD $)" name="training_fee_usd" inputMode="decimal" value={form.training_fee_usd} onChange={(e) => update("training_fee_usd", e.target.value)} /><TextField id="admin-doctor-qualifications" label="Qualifications" name="qualifications" value={form.qualifications} onChange={(e) => update("qualifications", e.target.value)} /><label className="admin-field admin-field--wide"><span>Professional bio</span><textarea value={form.bio} onChange={(event) => update("bio", event.target.value)} rows={4} /></label></div><div className="admin-form-actions"><Link to="/admin/doctors" className="admin-outline-button">Cancel</Link><button className="admin-primary-button" disabled={saving} type="submit"><Stethoscope size={16} /> {saving ? "Creating..." : "Create doctor"}</button></div></form></Card></div>;
}

const AUDIT_PAGE_SIZE = 20;
const AUDIT_TABS: [string, string][] = [
  ["", "All"],
  ["auth.", "Auth"],
  ["user.,admin_user.,doctor.,admin_doctor.", "Accounts"],
  ["appointment.,emergency_appointment.", "Appointments"],
];

export function AdminAuditScreen() {
  const { notify } = useToast();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [actionPrefix, setActionPrefix] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(() => {
    setError(null);
    const params: Record<string, unknown> = { page, page_size: AUDIT_PAGE_SIZE };
    if (search) params.search = search;
    if (actionPrefix) params.action = actionPrefix;
    listAuditEvents(params)
      .then((response) => {
        setEvents(response.data.results);
        setCount(response.data.count);
      })
      .catch((reason) => {
        setError(message(reason));
        setEvents((current) => current ?? []);
      });
  }, [page, search, actionPrefix]);
  useEffect(() => { load(); }, [load]);

  // Debounced search — typing resets to the first page.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Destructive but reversible only by waiting — confirm first (same pattern
  // as the user/doctor delete actions on the other admin tables).
  async function handleClear() {
    if (!window.confirm("Clear the entire audit log? This cannot be undone.")) return;
    setClearing(true);
    try {
      const response = await clearAuditEvents();
      notify("success", `Audit log cleared (${response?.data.deleted ?? 0} events).`);
      if (page !== 1) setPage(1);
      else load();
    } catch (reason) {
      notify("error", message(reason));
    } finally {
      setClearing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / AUDIT_PAGE_SIZE));
  const from = count === 0 ? 0 : (page - 1) * AUDIT_PAGE_SIZE + 1;
  const to = Math.min(page * AUDIT_PAGE_SIZE, count);

  return (
    <div className="admin-workspace">
      <AdminHeader
        title="Audit log"
        description="Every login, booking and change — kept for the last 72 hours."
        action={
          <div className="admin-header-actions">
            <button type="button" className="admin-outline-button" onClick={handleClear} disabled={clearing || (events !== null && events.length === 0)}>
              <Trash2 size={14} />
              {clearing ? "Clearing..." : "Clear log"}
            </button>
            <Link to="/admin" className="admin-outline-button">Back to overview</Link>
          </div>
        }
      />
      <Card className="admin-table-card">
        <div className="admin-table-toolbar">
          <div className="admin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search action, path, person..."
            />
          </div>
          <div className="admin-filter-tabs">
            {AUDIT_TABS.map(([key, label]) => (
              <button
                key={key || "all"}
                className={actionPrefix === key ? "active" : ""}
                onClick={() => { setActionPrefix(key); setPage(1); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && <ErrorState message={error} onRetry={load} />}
        {events === null ? (
          <Skeleton lines={6} />
        ) : events.length === 0 ? (
          <EmptyState title="No audit events" description="Logins, bookings and admin actions will appear here." />
        ) : (
          <>
            <div className="admin-audit-list">
              {events.map((event) => (
                <div className="admin-audit-row" key={event.id}>
                  <span className="admin-activity-icon"><Activity size={16} /></span>
                  <span>
                    <b>{event.action.replace(/[._]/g, " ")}</b>
                    <small>{event.target} · {event.detail}</small>
                  </span>
                  <span className="admin-audit-meta">
                    <b>{event.actor}</b>
                    <small>{formatTime(event.created_at)}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="admin-audit-pager">
              <span>{from}–{to} of {formatNumber(count)} events</span>
              <span>
                <button className="admin-table-action" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>← Previous</button>
                <button className="admin-table-action" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next →</button>
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export function AdminAppointmentsScreen() {
  const route = useLocation();
  const isHomeVisitPage = route.pathname === "/admin/home-visit";
  const { notify } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Platform-wide booking history: admins get the unfiltered collection back
  // from /appointments/ (roles are scoped server-side). page_size is raised to
  // the API cap so the control table shows more than the first page of 20.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listAllAppointments({ page_size: 100 })
      .then((r) => setAppointments(r.data.results))
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(() => {
    listAllAppointments({ page_size: 100 })
      .then((r) => setAppointments(r.data.results))
      .catch(() => {});
  }, []);

  useRealtimeSync({ refresh, events: ["appointment.created", "appointment.updated", "appointment.deleted"] });

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteAppointment(id);
      notify("success", "Appointment deleted.");
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      notify("error", message(e));
    } finally {
      setDeletingId(null);
    }
  }

  const serviceAppointments = appointments.filter((a) => isHomeVisitPage ? a.appointment_type === "HOME_SERVICE" : a.appointment_type !== "HOME_SERVICE");
  const filtered = serviceAppointments.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !String(a.id).includes(q) &&
        !(a.patient_email || "").toLowerCase().includes(q) &&
        !String(a.doctor).includes(q) &&
        !a.reason.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const statusCounts = {
    all: serviceAppointments.length,
    pending: serviceAppointments.filter((a) => a.status === "pending").length,
    accepted: serviceAppointments.filter((a) => a.status === "accepted").length,
    done: serviceAppointments.filter((a) => a.status === "done").length,
    cancelled: serviceAppointments.filter((a) => a.status === "cancelled" || a.status === "rejected").length,
  };

  return (
    <div className="admin-workspace">
      <AdminHeader
        title={isHomeVisitPage ? "Home Service" : "Appointments"}
        description={isHomeVisitPage ? "View and manage all Home Service visits." : "View and manage all platform appointments."}
        action={<Link to="/admin" className="admin-outline-button">Back to overview</Link>}
      />
      <Card className="admin-table-card">
        <div className="admin-table-toolbar">
          <div className="admin-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, email, doctor, or reason..."
            />
          </div>
          <div className="admin-filter-tabs">
            {([
              ["", "All", statusCounts.all],
              ["pending", "Pending", statusCounts.pending],
              ["accepted", "Accepted", statusCounts.accepted],
              ["done", "Done", statusCounts.done],
              ["cancelled", "Cancelled", statusCounts.cancelled],
            ] as [string, string, number][]).map(([key, label, count]) => (
              <button
                key={key}
                className={statusFilter === key ? "active" : ""}
                onClick={() => setStatusFilter(key)}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>
        {error && <ErrorState message={error} onRetry={load} />}
        {loading ? (
          <Skeleton lines={6} />
        ) : filtered.length === 0 ? (
          <EmptyState title={isHomeVisitPage ? "No Home Service visits found" : "No appointments found"} description="Try a different search or filter." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date & Time</th>
                  {isHomeVisitPage && <th>Visit location</th>}
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td><b>#{a.id}</b></td>
                    <td>{a.patient_email || `Patient #${a.patient}`}</td>
                    <td>Doctor #{a.doctor}</td>
                    <td>
                      {formatDate(a.appointment_date)}
                      <br />
                      <small>{a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)}</small>
                    </td>
                    {isHomeVisitPage && <td>
                      {a.home_service_latitude != null && a.home_service_longitude != null ? (
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${a.home_service_latitude},${a.home_service_longitude}`} target="_blank" rel="noreferrer">
                          <MapPin size={14} /> Open map
                        </a>
                      ) : "Location unavailable"}
                    </td>}
                    <td><span className={`admin-role admin-role--${a.status === "pending" ? "patient" : a.status === "accepted" ? "doctor" : a.status === "done" ? "admin" : "patient"}`}>{a.status}</span></td>
                    <td><small>{a.reason || "—"}</small></td>
                    <td>
                      <button
                        className="admin-table-action"
                        style={{ color: "var(--color-danger, #dc2626)" }}
                        disabled={deletingId === a.id}
                        onClick={() => handleDelete(a.id)}
                      >
                        <Trash2 size={14} /> {deletingId === a.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

