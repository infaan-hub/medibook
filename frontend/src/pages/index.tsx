import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyAppointments } from "../api/appointments";
import { getPatientProfile } from "../api/patients";
import { listDoctors, type ListDoctorsParams } from "../api/doctors";
import type { Appointment, DoctorProfile, User } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { formatRating } from "../components/reviews";
import { useSession } from "../state/app-context";
import { useRealtimeEvent } from "../realtime/socket";
import {
  Calendar,
  Bell,
  ChevronRight,
  MapPin,
  Search,
  Star,
} from "lucide-react";

/** Photo shown on every doctor card: uploaded picture first, placeholder last. */
export function doctorCardImage(doctor: DoctorProfile, index = 0): string {
  if (doctor.profile_image) return doctor.profile_image;
  return dashboardDoctorImages[index % dashboardDoctorImages.length];
}

export { DoctorAvailabilityScreen, DoctorProfileScreen, DoctorPersonalScreen } from "./doctor";
export { DoctorDashboardScreen, DoctorAppointmentsScreen } from "./doctor-dashboard";
export { DoctorMedicalTreatmentScreen } from "./doctor-medical-treatment";
export { SpecialtyListPage, SpecialtyDetailPage } from "./specialties";
export { HospitalListPage, HospitalDetailPage } from "./hospitals";
export { BookingScreen, BookingSuccessScreen, RescheduleScreen, AppointmentsListScreen, AppointmentDetailScreen } from "./appointments";
export { NotificationsScreen } from "./notifications";
export { AdminDashboardScreen, AdminUsersScreen, AdminDoctorsScreen, AdminCreateUserScreen, AdminCreateDoctorScreen, AdminAuditScreen, AdminAppointmentsScreen } from "./admin-dashboard";

function formatAppointment(appointment: Appointment): string {
  return `${appointment.appointment_date} at ${appointment.start_time.slice(0, 5)}`;
}

const dashboardDoctorImages = [
  "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=500&q=85",
];

function formatDoctorName(doctor: DoctorProfile): string {
  return `Dr. ${doctor.first_name} ${doctor.last_name}`.trim();
}

function PatientHome({ user }: { user: User }) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [doctors, setDoctors] = useState<DoctorProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadAppointments = useCallback(() => {
    listMyAppointments()
      .then((response) => setAppointments(response.data?.results ?? []))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load appointments."));
  }, []);

  useEffect(() => {
    loadAppointments();
    listDoctors()
      .then((response) => setDoctors((response.data?.results ?? []).slice(0, 3)))
      .catch(() => setDoctors([]));
  }, [loadAppointments]);

  // Live home: upcoming appointment reacts to bookings/status changes instantly.
  useRealtimeEvent((event) => {
    if (event === "appointment.created" || event === "appointment.updated") loadAppointments();
  });
  const next = appointments?.filter((item) => item.status === "pending" || item.status === "confirmed").sort((a, b) => formatAppointment(a).localeCompare(formatAppointment(b)))[0];

  return (
    <div className="page home-page">
      <header className="home__topbar">
        <div className="home__greeting">
          <span className="home__avatar">
            {user.profile_image ? <img src={user.profile_image} alt="" /> : ((user.first_name || "")[0] || (user.last_name || "")[0] || "M").toUpperCase()}
          </span>
          <span>
            <strong>{new Date().getHours() < 12 ? "Good morning!" : new Date().getHours() < 18 ? "Good afternoon!" : "Good evening!"}</strong>
            <span>{user.first_name || user.last_name || "there"}</span>
          </span>
        </div>
        <Link to="/notifications" className="home__notification" aria-label="Notifications">
          <Bell size={19} />
          <span className="home__notification-dot" />
        </Link>
      </header>

      <Link to="/doctors" className="home__search">
        <span className="home__search-icon"><MapPin size={18} /></span>
        <span>Search nearest available doctor</span>
        <Search size={19} />
      </Link>

      {error && <ErrorState message={error} />}

      <section className="home__section">
        <div className="home__section-heading">
          <h1>Top Doctors</h1>
          <Link to="/doctors">See all <ChevronRight size={15} /></Link>
        </div>
        {doctors === null ? <Skeleton lines={4} /> : doctors.length === 0 ? (
          <EmptyState title="No doctors available" description="Check back soon for available doctors." />
        ) : (
          <div className="home__doctor-list">
            {doctors.map((doctor, index) => (
              <Link key={doctor.id} to={`/doctors/${doctor.id}`} className="home__doctor-card">
                <img src={doctorCardImage(doctor, index)} alt={formatDoctorName(doctor)} />
                <span className="home__doctor-info">
                  <strong>{formatDoctorName(doctor)}</strong>
                  <span>{doctor.qualifications || "Medical specialist"}</span>
                  {(doctor.office_address || doctor.city) && <span className="home__doctor-location"><MapPin size={11} /> {doctor.office_address || doctor.city}</span>}
                  <span className="home__doctor-rating"><Star size={13} fill="currentColor" /> {formatRating(doctor.average_rating)}</span>
                </span>
                <ChevronRight size={17} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="home__section home__appointments-section">
        <div className="home__section-heading">
          <h2>Upcoming Appointments</h2>
          <Link to="/appointments">See all <ChevronRight size={15} /></Link>
        </div>
        <div className="home__filters" aria-label="Appointment filters">
          <span className="home__filter home__filter--active">All</span>
          <span className="home__filter">General</span>
          <span className="home__filter">Specialist</span>
          <span className="home__filter">Pediatrics</span>
        </div>
        {appointments === null ? <Skeleton lines={3} /> : next ? (
          <Link to={`/appointments/${next.id}`} className="home__appointment-card">
            <span className="home__appointment-datebox">
              <strong>{new Date(`${next.appointment_date}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit" })}</strong>
              <span>{new Date(`${next.appointment_date}T00:00:00`).toLocaleDateString(undefined, { month: "short" })}</span>
            </span>
            <span className="home__appointment-info">
              <strong>Doctor appointment</strong>
              <span>{formatAppointment(next)}</span>
              <span className={`badge badge--${next.status}`}>{next.status}</span>
            </span>
            <ChevronRight size={17} />
          </Link>
        ) : (
          <EmptyState icon={<Calendar size={28} />} title="No upcoming appointments" description="Find a doctor to book your next visit." action={<Link to="/doctors">Find a doctor</Link>} />
        )}
      </section>
    </div>
  );
}

export function HomeScreen() {
  const { user } = useSession();
  // Route-level RequirePatient guarantees patient-only. Any non-patient
  // reaching here (stale render) shows nothing — guards redirect.
  if (!user || user.role !== "patient") return null;
  return <PatientHome user={user} />;
}

export function DoctorsPage() {
  const { user } = useSession();
  const [search, setSearch] = useState(""); const [city, setCity] = useState("");
  const [results, setResults] = useState<DoctorProfile[] | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const fetchDoctors = useCallback((params: ListDoctorsParams) => { setLoading(true); setError(null); listDoctors(params).then((response) => setResults(response.data.results)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load doctors.")).finally(() => setLoading(false)); }, []);
  const load = useCallback(() => { fetchDoctors({ search: search || undefined, city: city || undefined }); }, [fetchDoctors, search, city]);
  // First visit: patients get their saved location pre-filled so doctors near
  // them surface first; everyone else sees the full directory.
  useEffect(() => {
    if (user?.role !== "patient") { load(); return; }
    let cancelled = false;
    getPatientProfile()
      .then((response) => {
        if (cancelled) return;
        const homeCity = response.data.city?.trim() ?? "";
        if (homeCity) setCity(homeCity);
        fetchDoctors({ search: search || undefined, city: homeCity || undefined });
      })
      .catch(() => { if (!cancelled) load(); });
    return () => { cancelled = true; };
  }, []);
  return <div className="page doctors-page"><h1 className="page__title">Find a doctor</h1><Card className="doctors__filters"><div className="field"><label className="field__label" htmlFor="doctor-search">Name</label><input id="doctor-search" className="field__input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" /></div><div className="field"><label className="field__label" htmlFor="doctor-city">Location</label><input id="doctor-city" className="field__input" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Filter by location / area" /></div><Button onClick={load} loading={loading}>Search</Button></Card>{error && <ErrorState message={error} onRetry={load} />}{loading && <Skeleton lines={5} />}{!loading && results?.length === 0 && <EmptyState title="No doctors found" description="Try another name or location." />}{!loading && !!results?.length && <div className="home__doctor-list doctors__grid">{results.map((doctor, index) => <Link key={doctor.id} to={`/doctors/${doctor.id}`} className="home__doctor-card"><img src={doctorCardImage(doctor, index)} alt={`Dr. ${doctor.first_name} ${doctor.last_name}`} loading="lazy" /><span className="home__doctor-info"><strong>Dr. {doctor.first_name} {doctor.last_name}</strong><span>{doctor.qualifications || "Medical specialist"}</span>{(doctor.office_address || doctor.city) && <span className="home__doctor-location"><MapPin size={11} /> {doctor.office_address || doctor.city}</span>}<span className="home__doctor-rating"><Star size={13} fill="currentColor" /> {formatRating(doctor.average_rating)}</span></span><ChevronRight size={17} /></Link>)}</div>}</div>;
}

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null); const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { setError(null); listMyAppointments().then((response) => setAppointments(response.data.results)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load appointments.")); }, []);
  useEffect(() => { load(); }, [load]);
  return <div className="page"><h1 className="page__title">Appointments</h1>{error && <ErrorState message={error} onRetry={load} />}{appointments === null ? <Skeleton lines={4} /> : appointments.length === 0 ? <EmptyState title="No appointments" description="Your appointment history will appear here." /> : appointments.map((appointment) => <Card key={appointment.id}><p>{formatAppointment(appointment)}</p><p>Status: {appointment.status}</p></Card>)}</div>;
}

export function NotFoundPage() { return <div className="page"><EmptyState title="Page not found" description="The page you requested does not exist." action={<Link to="/">Go home</Link>} /></div>; }
