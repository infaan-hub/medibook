import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyAppointments } from "../api/appointments";
import { listDoctors, type ListDoctorsParams } from "../api/doctors";
import type { Appointment, DoctorProfile, User } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useSession } from "../state/app-context";
import { DoctorDashboardScreen } from "./doctor";

export { DoctorAvailabilityScreen, DoctorDashboardScreen, DoctorProfileScreen } from "./doctor";

function formatAppointment(appointment: Appointment): string {
  return `${appointment.appointment_date} at ${appointment.start_time.slice(0, 5)}`;
}

function PatientHome({ user }: { user: User }) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listMyAppointments().then((response) => setAppointments(response.data.results)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load appointments."));
  }, []);
  const next = appointments?.filter((item) => item.status === "pending" || item.status === "confirmed").sort((a, b) => formatAppointment(a).localeCompare(formatAppointment(b)))[0];
  return <div className="page"><h1 className="page__title">Welcome, {user.first_name || user.email}</h1><p className="page__subtitle">Find the right care and manage your appointments.</p>{error && <ErrorState message={error} />}<Card className="home__card"><h2 className="home__card-title">Upcoming appointment</h2>{appointments === null ? <Skeleton lines={3} /> : next ? <><p>{formatAppointment(next)}</p><p>Status: {next.status}</p><Link to="/appointments">View appointment</Link></> : <EmptyState title="No upcoming appointments" description="Find a doctor to book your next visit." action={<Link to="/doctors">Find a doctor</Link>} />}</Card></div>;
}

export function HomeScreen() {
  const { user } = useSession();
  if (!user) return <NotFoundPage />;
  if (user.role === "doctor") return <DoctorDashboardScreen />;
  if (user.role === "admin") return <div className="page"><h1 className="page__title">MediBook administration</h1><Link to="/admin">Open admin dashboard</Link></div>;
  return <PatientHome user={user} />;
}

export function DoctorsPage() {
  const [search, setSearch] = useState(""); const [city, setCity] = useState("");
  const [results, setResults] = useState<DoctorProfile[] | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const load = useCallback(() => { setLoading(true); setError(null); const params: ListDoctorsParams = { search: search || undefined, city: city || undefined }; listDoctors(params).then((response) => setResults(response.data.results)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load doctors.")).finally(() => setLoading(false)); }, [search, city]);
  useEffect(() => { load(); }, [load]);
  return <div className="page"><h1 className="page__title">Find a doctor</h1><Card className="doctors__filters"><div className="field"><label className="field__label" htmlFor="doctor-search">Name</label><input id="doctor-search" className="field__input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" /></div><div className="field"><label className="field__label" htmlFor="doctor-city">City</label><input id="doctor-city" className="field__input" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Filter by city" /></div><Button onClick={load} loading={loading}>Search</Button></Card>{error && <ErrorState message={error} onRetry={load} />}{loading && <Skeleton lines={5} />}{!loading && results?.length === 0 && <EmptyState title="No doctors found" description="Try another name or city." />}{!loading && results?.map((doctor) => <Link key={doctor.id} to={`/doctors/${doctor.id}`} className="doctor-card doctor-card--link"><Card><h2>{doctor.first_name} {doctor.last_name}</h2><p>{doctor.experience_years} years of experience</p><p>Consultation fee: {doctor.consultation_fee}</p></Card></Link>)}</div>;
}

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null); const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { setError(null); listMyAppointments().then((response) => setAppointments(response.data.results)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load appointments.")); }, []);
  useEffect(() => { load(); }, [load]);
  return <div className="page"><h1 className="page__title">Appointments</h1>{error && <ErrorState message={error} onRetry={load} />}{appointments === null ? <Skeleton lines={4} /> : appointments.length === 0 ? <EmptyState title="No appointments" description="Your appointment history will appear here." /> : appointments.map((appointment) => <Card key={appointment.id}><p>{formatAppointment(appointment)}</p><p>Status: {appointment.status}</p></Card>)}</div>;
}

export function NotFoundPage() { return <div className="page"><EmptyState title="Page not found" description="The page you requested does not exist." action={<Link to="/">Go home</Link>} /></div>; }
