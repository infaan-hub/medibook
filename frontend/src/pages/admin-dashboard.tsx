/**
 * PHASE 14 — Admin Dashboard: stats overview, user management, doctor management.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  approveDoctor,
  getAdminStats,
  listAdminUsers,
  type AdminStats,
} from "../api/admin";
import { listDoctors } from "../api/doctors";
import type { DoctorProfile, User } from "../api/types";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ======================================
   ADMIN DASHBOARD
   ====================================== */

export function AdminDashboardScreen() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    getAdminStats()
      .then((r) => setStats(r.data))
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (loading) return <div className="page"><Skeleton lines={6} /></div>;

  return (
    <div className="page">
      <h1 className="page__title">Admin Dashboard</h1>
      <p className="page__subtitle">Platform overview and management.</p>

      {/* Stats cards */}
      {stats && (
        <div className="stats-row">
          <Card className="stats-row__card">
            <span className="stats-row__number">{stats.users}</span>
            <span className="stats-row__label">Total Users</span>
          </Card>
          <Card className="stats-row__card">
            <span className="stats-row__number">{stats.patients}</span>
            <span className="stats-row__label">Patients</span>
          </Card>
          <Card className="stats-row__card">
            <span className="stats-row__number">{stats.doctors}</span>
            <span className="stats-row__label">Doctors</span>
          </Card>
          <Card className="stats-row__card">
            <span className="stats-row__number">{stats.appointments}</span>
            <span className="stats-row__label">Appointments</span>
          </Card>
        </div>
      )}

      {/* Appointment breakdown */}
      {stats && Object.keys(stats.appointments_by_status).length > 0 && (
        <Card>
          <h2>Appointments by status</h2>
          <div className="stats-row">
            {Object.entries(stats.appointments_by_status).map(([status, count]) => (
              <div key={status} className="stats-row__card stats-row__card--mini">
                <span className="stats-row__number">{count}</span>
                <span className="stats-row__label">{status}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick links */}
      <Card>
        <h2>Management</h2>
        <div className="dash-links">
          <Link to="/admin/users"><Button variant="secondary">Manage users</Button></Link>
          <Link to="/admin/doctors"><Button variant="secondary">Manage doctors</Button></Link>
        </div>
      </Card>
    </div>
  );
}

/* ======================================
   ADMIN USERS SCREEN
   ====================================== */

export function AdminUsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [role, setRole] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    const params: Record<string, unknown> = {};
    if (role) params.role = role;
    listAdminUsers(params)
      .then((r) => setUsers(r.data.results))
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, [role]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <Link to="/admin">← Dashboard</Link>
      <h1 className="page__title">Users</h1>

      {/* Role filter */}
      <div className="tabs">
        {[
          { key: "", label: "All" },
          { key: "patient", label: "Patients" },
          { key: "doctor", label: "Doctors" },
          { key: "admin", label: "Admins" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`tabs__tab${role === tab.key ? " tabs__tab--active" : ""}`}
            onClick={() => setRole(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <Skeleton lines={5} />
      ) : users.length === 0 ? (
        <EmptyState title="No users found" description="No users match the selected filter." />
      ) : (
        <Card className="admin-list">
          {users.map((u) => (
            <div key={u.id} className="admin-list__row">
              <div className="admin-list__info">
                <span className="admin-list__name">
                  {u.first_name} {u.last_name}
                </span>
                <span className="admin-list__meta">
                  {u.email} &middot; {u.role}
                </span>
                <span className="admin-list__meta">
                  Joined {formatDate(String(u.id))}
                </span>
              </div>
              <div className="admin-list__badge">
                {u.is_verified ? (
                  <Badge status="confirmed" />
                ) : (
                  <span className="badge badge--pending">unverified</span>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ======================================
   ADMIN DOCTORS SCREEN
   ====================================== */

export function AdminDoctorsScreen() {
  const { notify } = useToast();
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    listDoctors()
      .then((dr) => setDoctors(dr.data.results))
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(doctorId: number, isAvailable: boolean) {
    try {
      await approveDoctor(doctorId, isAvailable);
      notify("success", isAvailable ? "Doctor approved." : "Doctor suspended.");
      load();
    } catch (e) {
      notify("error", message(e));
    }
  }

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="page">
      <Link to="/admin">← Dashboard</Link>
      <h1 className="page__title">Doctors</h1>

      {loading ? (
        <Skeleton lines={5} />
      ) : doctors.length === 0 ? (
        <EmptyState title="No doctors" description="No doctors registered on the platform." />
      ) : (
        <Card className="admin-list">
          {doctors.map((doc) => (
            <div key={doc.id} className="admin-list__row">
              <div className="admin-list__info">
                <span className="admin-list__name">
                  Dr. {doc.first_name} {doc.last_name}
                </span>
                <span className="admin-list__meta">
                  {doc.qualifications || "No qualifications"} &middot; {doc.experience_years} years
                </span>
                <span className="admin-list__meta">
                  Fee: {doc.consultation_fee} &middot; Rating: {doc.average_rating?.toFixed(1) || "N/A"}
                </span>
              </div>
              <div className="admin-list__actions">
                {doc.is_available ? (
                  <Button variant="danger" onClick={() => handleApprove(doc.id, false)}>
                    Suspend
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => handleApprove(doc.id, true)}>
                    Approve
                  </Button>
                )}
                <Link to={`/doctors/${doc.id}`}>
                  <Button variant="ghost">View</Button>
                </Link>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
