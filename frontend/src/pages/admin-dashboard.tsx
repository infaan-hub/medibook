import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, FilePlus2, Plus, Search, ShieldCheck, Stethoscope, Trash2, UserPlus, Users, XCircle } from "lucide-react";
import { approveDoctor, createAdminDoctor, createAdminUser, deleteAdminDoctor, deleteAdminUser, getAdminStats, listAdminUsers, listAuditEvents, type AdminStats } from "../api/admin";
import { deleteAppointment, listAllAppointments } from "../api/appointments";
import { listDoctors } from "../api/doctors";
import type { Appointment, AuditEvent, DoctorProfile, User } from "../api/types";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { formatRating } from "../components/reviews";
import { useToast } from "../state/app-context";
import { useRealtimeSync } from "../realtime/socket";

function message(error: unknown): string { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }
function formatDate(value: string): string { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function formatTime(value: string): string { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

function AdminHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="admin-page-header"><div><p className="admin-eyebrow">MediBook control center</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function MetricCard({ label, value, icon, tone, detail }: { label: string; value: number; icon: ReactNode; tone: string; detail: string }) {
  return <Card className="admin-metric"><span className={`admin-metric__icon ${tone}`}>{icon}</span><span className="admin-metric__label">{label}</span><strong>{value.toLocaleString()}</strong><span className="admin-metric__detail">{detail}</span></Card>;
}

export function AdminDashboardScreen() {
  const [stats, setStats] = useState<AdminStats | null>(null); const [events, setEvents] = useState<AuditEvent[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const load = useCallback(() => { setLoading(true); setError(null); Promise.all([getAdminStats(), listAuditEvents()]).then(([statsResponse, auditResponse]) => { setStats(statsResponse.data); setEvents(auditResponse.data); }).catch((reason) => setError(message(reason))).finally(() => setLoading(false)); }, []);
  const refresh = useCallback(() => { Promise.all([getAdminStats(), listAuditEvents()]).then(([statsResponse, auditResponse]) => { setStats(statsResponse.data); setEvents(auditResponse.data); }).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useRealtimeSync({ refresh, events: ["appointment.created", "appointment.updated", "user.created", "doctor.updated"] });
  if (loading) return <div className="admin-workspace"><Skeleton lines={8} /></div>;
  if (error || !stats) return <div className="admin-workspace"><ErrorState message={error ?? "Could not load dashboard."} onRetry={load} /></div>;
  const statuses = Object.entries(stats.appointments_by_status); const maxStatus = Math.max(...statuses.map(([, count]) => count), 1);
  return <div className="admin-workspace">
    <AdminHeader title="Overview" description="A clear view of your healthcare platform." action={<div className="admin-header-actions"><Link to="/admin/audit" className="admin-outline-button"><Activity size={16} /> Audit log</Link><Link to="/admin/users/new" className="admin-primary-button"><Plus size={16} /> Add user</Link></div>} />
    <div className="admin-metrics"><MetricCard label="Total users" value={stats.users} detail="Across all roles" tone="admin-metric__icon--blue" icon={<Users size={19} />} /><MetricCard label="Patients" value={stats.patients} detail="Registered patients" tone="admin-metric__icon--teal" icon={<ShieldCheck size={19} />} /><MetricCard label="Doctors" value={stats.doctors} detail="Active profiles" tone="admin-metric__icon--violet" icon={<Stethoscope size={19} />} /><MetricCard label="Appointments" value={stats.appointments} detail="All-time bookings" tone="admin-metric__icon--amber" icon={<Clock3 size={19} />} /></div>
    <div className="admin-dashboard-grid"><Card className="admin-chart-card"><div className="admin-card-heading"><div><h2>Appointment activity</h2><p>Distribution by current status</p></div><span className="admin-chart-caption"><Activity size={15} /> Live data</span></div><div className="admin-bar-chart">{statuses.length ? statuses.map(([status, count]) => <div className="admin-bar-row" key={status}><span>{status}</span><div><i style={{ width: `${Math.max((count / maxStatus) * 100, count ? 8 : 0)}%` }} /></div><strong>{count}</strong></div>) : <EmptyState title="No appointment activity" />}</div></Card><Card className="admin-chart-card admin-breakdown"><div className="admin-card-heading"><div><h2>Platform health</h2><p>At-a-glance operating mix</p></div><CircleDollarSign size={19} /></div><div className="admin-donut" style={{ "--donut": `${stats.users ? (stats.patients / stats.users) * 100 : 0}%` } as React.CSSProperties}><span>{stats.users ? Math.round((stats.patients / stats.users) * 100) : 0}%<small>patients</small></span></div><div className="admin-legend"><span><i className="admin-dot admin-dot--teal" /> Patients <b>{stats.patients}</b></span><span><i className="admin-dot admin-dot--violet" /> Doctors <b>{stats.doctors}</b></span></div></Card></div>
    <div className="admin-dashboard-grid admin-dashboard-grid--lower"><Card className="admin-quick-card"><div className="admin-card-heading"><div><h2>Quick actions</h2><p>Common administrative tasks</p></div></div><div className="admin-action-grid"><Link to="/admin/users/new"><UserPlus size={18} /><span><b>Add a user</b><small>Create a patient or staff account</small></span><ChevronRight size={15} /></Link><Link to="/admin/doctors/new"><FilePlus2 size={18} /><span><b>Add a doctor</b><small>Set up a professional profile</small></span><ChevronRight size={15} /></Link><Link to="/admin/users"><Users size={18} /><span><b>Review users</b><small>Search and filter accounts</small></span><ChevronRight size={15} /></Link><Link to="/admin/doctors"><Stethoscope size={18} /><span><b>Review doctors</b><small>Approve or suspend profiles</small></span><ChevronRight size={15} /></Link><Link to="/admin/appointments"><Clock3 size={18} /><span><b>Manage appointments</b><small>View, filter, and delete bookings</small></span><ChevronRight size={15} /></Link></div></Card><Card className="admin-activity-card"><div className="admin-card-heading"><div><h2>Recent activity</h2><p>Latest privileged actions</p></div><Link to="/admin/audit">View all <ArrowUpRight size={15} /></Link></div>{events.length ? <div className="admin-activity-list">{events.slice(0, 5).map((event) => <div key={event.id}><span className="admin-activity-icon"><CheckCircle2 size={15} /></span><span><b>{event.action.replace(".", " ")}</b><small>{event.detail || event.target} Â· {formatTime(event.created_at)}</small></span></div>)}</div> : <EmptyState title="No activity yet" description="Admin actions will appear here." />}</Card></div>
  </div>;
}

export function AdminUsersScreen() {
  const { notify } = useToast();
  const [users, setUsers] = useState<User[]>([]); const [role, setRole] = useState(""); const [query, setQuery] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [deletingId, setDeletingId] = useState<number | null>(null);
  const load = useCallback(() => { setLoading(true); listAdminUsers(role ? { role } : {}).then((response) => setUsers(response.data.results)).catch((reason) => setError(message(reason))).finally(() => setLoading(false)); }, [role]); useEffect(() => { load(); }, [load]);
  const refresh = useCallback(() => { listAdminUsers(role ? { role } : {}).then((response) => setUsers(response.data.results)).catch(() => {}); }, [role]);
  useRealtimeSync({ refresh, events: ["user.created", "user.deleted", "user.updated"] });
  async function handleDelete(user: User) {
    if (!window.confirm(`Delete ${user.first_name || user.username}'s account? Their appointments and reviews will also be removed.`)) return;
    setDeletingId(user.id);
    try { await deleteAdminUser(user.id); notify("success", "User deleted."); setUsers((current) => current.filter((item) => item.id !== user.id)); } catch (reason) { notify("error", message(reason)); } finally { setDeletingId(null); }
  }
  const filtered = users.filter((user) => `${user.first_name} ${user.last_name} ${user.email} ${user.username}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="admin-workspace"><AdminHeader title="Users" description="Manage every account across the platform." action={<Link to="/admin/users/new" className="admin-primary-button"><UserPlus size={16} /> Add user</Link>} /><Card className="admin-table-card"><div className="admin-table-toolbar"><div className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users..." /></div><div className="admin-filter-tabs">{[["", "All"], ["patient", "Patients"], ["doctor", "Doctors"], ["admin", "Admins"]].map(([key, label]) => <button key={key} className={role === key ? "active" : ""} onClick={() => setRole(key)}>{label}</button>)}</div></div>{error && <ErrorState message={error} onRetry={load} />}{loading ? <Skeleton lines={5} /> : filtered.length === 0 ? <EmptyState title="No users found" description="Try a different search or filter." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Role</th><th>Joined</th><th /></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><span className="admin-table-user"><span>{(user.first_name[0] || user.username[0] || "U").toUpperCase()}</span><b>{user.first_name || user.username} {user.last_name}</b><small>{user.email}</small></span></td><td><span className={`admin-role admin-role--${user.role}`}>{user.role}</span></td><td>{user.date_joined ? formatDate(user.date_joined) : "â€”"}</td><td>{user.role !== "admin" && <button className="admin-table-action" style={{ color: "var(--color-danger, #dc2626)", marginRight: 8 }} disabled={deletingId === user.id} onClick={() => handleDelete(user)}><Trash2 size={14} /> {deletingId === user.id ? "Deleting..." : "Delete"}</button>}<ChevronRight size={17} /></td></tr>)}</tbody></table></div>}</Card></div>;
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
  return <div className="admin-workspace"><AdminHeader title="Doctors" description="Review professional profiles and availability." action={<Link to="/admin/doctors/new" className="admin-primary-button"><Plus size={16} /> Add doctor</Link>} /><Card className="admin-table-card">{error && <ErrorState message={error} onRetry={load} />}{loading ? <Skeleton lines={6} /> : doctors.length === 0 ? <EmptyState title="No doctors yet" description="Create the first doctor profile to get started." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Doctor</th><th>Experience</th><th>Rating</th><th>Status</th><th>Actions</th></tr></thead><tbody>{doctors.map((doctor) => <tr key={doctor.id}><td><span className="admin-table-user"><span className="admin-doctor-avatar"><Stethoscope size={16} /></span><b>Dr. {doctor.first_name} {doctor.last_name}</b><small>{doctor.specialties && doctor.specialties.length > 0 ? doctor.specialties.map((s) => s.patient_friendly_name || s.name).join(", ") : "Profile details pending"}</small></span></td><td>{doctor.experience_years ?? 0} years</td><td>{formatRating(doctor.average_rating)}</td><td>{doctor.is_available ? <span className="admin-status admin-status--good"><CheckCircle2 size={14} /> Active</span> : <span className="admin-status admin-status--pending"><XCircle size={14} /> Suspended</span>}</td><td><button className="admin-table-action" onClick={() => toggle(doctor)}>{doctor.is_available ? "Suspend" : "Approve"}</button><button className="admin-table-action" style={{ color: "var(--color-danger, #dc2626)", margin: "0 0 0 12px" }} disabled={deletingId === doctor.id} onClick={() => handleDelete(doctor)}><Trash2 size={14} /> {deletingId === doctor.id ? "Deleting..." : "Delete"}</button><Link className="admin-table-action admin-table-action--quiet" to={`/doctors/${doctor.id}`}>View</Link></td></tr>)}</tbody></table></div>}</Card></div>;
}

function FormField({ label, name, value, onChange, type = "text", required = false }: { label: string; name: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="admin-field"><span>{label}{required && " *"}</span><input name={name} type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>; }

export function AdminCreateUserScreen() {
  const { notify } = useToast(); const [saving, setSaving] = useState(false); const [form, setForm] = useState({ username: "", email: "", password: "", first_name: "", last_name: "", phone: "", role: "patient" as "patient" | "doctor" });
  function update(name: string, value: string) { setForm((current) => ({ ...current, [name]: value })); }
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await createAdminUser(form); notify("success", "User created successfully."); setForm({ username: "", email: "", password: "", first_name: "", last_name: "", phone: "", role: "patient" }); } catch (reason) { notify("error", message(reason)); } finally { setSaving(false); } }
  return <div className="admin-workspace admin-form-page"><AdminHeader title="Add user" description="Create a verified patient or staff account." action={<Link to="/admin/users" className="admin-outline-button">Back to users</Link>} /><Card className="admin-form-card"><form onSubmit={submit}><div className="admin-form-grid"><FormField label="First name" name="first_name" value={form.first_name} onChange={(value) => update("first_name", value)} required /><FormField label="Last name" name="last_name" value={form.last_name} onChange={(value) => update("last_name", value)} required /><FormField label="Username" name="username" value={form.username} onChange={(value) => update("username", value)} required /><FormField label="Email" name="email" type="email" value={form.email} onChange={(value) => update("email", value)} required /><FormField label="Temporary password" name="password" type="password" value={form.password} onChange={(value) => update("password", value)} required /><FormField label="Phone" name="phone" value={form.phone} onChange={(value) => update("phone", value)} /><label className="admin-field"><span>Account role</span><select value={form.role} onChange={(event) => update("role", event.target.value)}><option value="patient">Patient</option><option value="doctor">Doctor</option></select></label></div><div className="admin-form-actions"><Link to="/admin/users" className="admin-outline-button">Cancel</Link><button className="admin-primary-button" disabled={saving} type="submit"><UserPlus size={16} /> {saving ? "Creating..." : "Create user"}</button></div></form></Card></div>;
}

export function AdminCreateDoctorScreen() {
  const { notify } = useToast(); const [saving, setSaving] = useState(false); const [form, setForm] = useState({ username: "", email: "", password: "", first_name: "", last_name: "", qualifications: "", experience_years: "0", consultation_fee: "0", bio: "" });
  function update(name: string, value: string) { setForm((current) => ({ ...current, [name]: value })); }
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await createAdminDoctor({ ...form, experience_years: Number(form.experience_years), consultation_fee: form.consultation_fee || "0" }); notify("success", "Doctor profile created successfully."); setForm({ username: "", email: "", password: "", first_name: "", last_name: "", qualifications: "", experience_years: "0", consultation_fee: "0", bio: "" }); } catch (reason) { notify("error", message(reason)); } finally { setSaving(false); } }
  return <div className="admin-workspace admin-form-page"><AdminHeader title="Add doctor" description="Create an account and professional profile together." action={<Link to="/admin/doctors" className="admin-outline-button">Back to doctors</Link>} /><Card className="admin-form-card"><form onSubmit={submit}><div className="admin-form-grid"><FormField label="First name" name="first_name" value={form.first_name} onChange={(value) => update("first_name", value)} required /><FormField label="Last name" name="last_name" value={form.last_name} onChange={(value) => update("last_name", value)} required /><FormField label="Username" name="username" value={form.username} onChange={(value) => update("username", value)} required /><FormField label="Email" name="email" type="email" value={form.email} onChange={(value) => update("email", value)} required /><FormField label="Temporary password" name="password" type="password" value={form.password} onChange={(value) => update("password", value)} required /><FormField label="Experience (years)" name="experience_years" type="number" value={form.experience_years} onChange={(value) => update("experience_years", value)} /><FormField label="Consultation fee (TSh)" name="consultation_fee" value={form.consultation_fee} onChange={(value) => update("consultation_fee", value)} /><FormField label="Qualifications" name="qualifications" value={form.qualifications} onChange={(value) => update("qualifications", value)} /><label className="admin-field admin-field--wide"><span>Professional bio</span><textarea value={form.bio} onChange={(event) => update("bio", event.target.value)} rows={4} /></label></div><div className="admin-form-actions"><Link to="/admin/doctors" className="admin-outline-button">Cancel</Link><button className="admin-primary-button" disabled={saving} type="submit"><Stethoscope size={16} /> {saving ? "Creating..." : "Create doctor"}</button></div></form></Card></div>;
}

export function AdminAuditScreen() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null); const [error, setError] = useState<string | null>(null); useEffect(() => { listAuditEvents().then((response) => setEvents(response.data)).catch((reason) => setError(message(reason))); }, []);
  return <div className="admin-workspace"><AdminHeader title="Audit log" description="A traceable record of privileged platform activity." action={<Link to="/admin" className="admin-outline-button">Back to overview</Link>} /><Card className="admin-table-card">{error && <ErrorState message={error} />}{events === null ? <Skeleton lines={6} /> : events.length === 0 ? <EmptyState title="No audit events" description="Actions performed by administrators will be recorded here." /> : <div className="admin-audit-list">{events.map((event) => <div className="admin-audit-row" key={event.id}><span className="admin-activity-icon"><Activity size={16} /></span><span><b>{event.action.replace(".", " ")}</b><small>{event.detail || event.target}</small></span><span className="admin-audit-meta"><b>{event.actor}</b><small>{formatTime(event.created_at)}</small></span></div>)}</div>}</Card></div>;
}

export function AdminAppointmentsScreen() {
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

  const filtered = appointments.filter((a) => {
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
    all: appointments.length,
    pending: appointments.filter((a) => a.status === "pending").length,
    confirmed: appointments.filter((a) => a.status === "confirmed").length,
    completed: appointments.filter((a) => a.status === "completed").length,
    cancelled: appointments.filter((a) => a.status === "cancelled" || a.status === "rejected").length,
  };

  return (
    <div className="admin-workspace">
      <AdminHeader
        title="Appointments"
        description="View and manage all platform appointments."
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
              ["confirmed", "Confirmed", statusCounts.confirmed],
              ["completed", "Completed", statusCounts.completed],
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
          <EmptyState title="No appointments found" description="Try a different search or filter." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date & Time</th>
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
                    <td><span className={`admin-role admin-role--${a.status === "pending" ? "patient" : a.status === "confirmed" ? "doctor" : a.status === "completed" ? "admin" : "patient"}`}>{a.status}</span></td>
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
