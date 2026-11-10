import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";
import { ArrowLeft, Brain, Trash2, UserRound } from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  pending: "#a86200",
  assigned: "#a86200",
  accepted: "#087f79",
  in_progress: "#7c3aed",
  follow_up: "#7c3aed",
  completed: "#16805d",
  cancelled: "#a9b6bf",
  expired: "#525252",
};

export function AdminPsychotherapyScreen() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/psychotherapy");
      setItems(res.data ?? []);
    } catch (e: any) { setError(e?.message || "Failed."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = items.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return String(r.id).includes(q)
        || `${r.patient?.first_name ?? ""} ${r.patient?.last_name ?? ""}`.toLowerCase().includes(q)
        || `${r.doctor?.user?.first_name ?? ""} ${r.doctor?.user?.last_name ?? ""}`.toLowerCase().includes(q)
        || String(r.session_mode).toLowerCase().includes(q)
        || String(r.language_preference).toLowerCase().includes(q);
    }
    return true;
  });

  const statusCounts = {
    all: items.length,
    pending: items.filter((r) => r.status === "pending").length,
    assigned: items.filter((r) => r.status === "assigned").length,
    accepted: items.filter((r) => r.status === "accepted").length,
    in_progress: items.filter((r) => r.status === "in_progress").length,
    follow_up: items.filter((r) => r.status === "follow_up").length,
    completed: items.filter((r) => r.status === "completed").length,
    expired: items.filter((r) => r.status === "expired").length,
  };

  async function remove(id: number) {
    if (!window.confirm("Delete this psychology service request?")) return;
    try {
      await apiPost("/psychotherapy/?action=delete", { id });
      notify("success", "Psychology service deleted.");
      setItems((cur) => cur.filter((r) => r.id !== id));
    } catch (e: any) { notify("error", e?.message || "Unable to delete."); }
  }

  if (loading) return <div className="page admin-workspace"><Skeleton lines={6} /></div>;
  if (error) return <div className="page admin-workspace"><ErrorState message={error} onRetry={() => void load()} /></div>;

  return (
    <div className="admin-workspace">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">MediBook control center</p>
          <h1>Psychology service</h1>
          <p>View and manage all psychology service requests and sessions.</p>
        </div>
        <Link to="/admin" className="admin-outline-button"><ArrowLeft size={16} /> Back to overview</Link>
      </div>
      <Card className="admin-table-card">
        <div className="admin-table-toolbar">
          <div className="admin-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, patient, psychologist, mode or language..."
            />
          </div>
          <div className="admin-filter-tabs">
            {([
              ["", "All", statusCounts.all],
              ["pending", "Pending", statusCounts.pending],
              ["assigned", "Assigned", statusCounts.assigned],
              ["accepted", "Accepted", statusCounts.accepted],
              ["in_progress", "In progress", statusCounts.in_progress],
              ["follow_up", "Follow-up", statusCounts.follow_up],
              ["completed", "Completed", statusCounts.completed],
              ["expired", "Expired", statusCounts.expired],
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
        {filtered.length === 0 ? (
          <EmptyState title="No psychology service requests" description="Try a different search or filter." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((r) => (
              <PsychotherapyCard key={r.id} r={r} onDelete={() => remove(r.id)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PsychotherapyCard({ r, onDelete }: { r: any; onDelete: () => void }) {
  const { notify } = useToast();
  const [deleting, setDeleting] = useState(false);
  const tone = STATUS_TONE[r.status] ?? "#82909d";
  const patient = `${r.patient?.first_name ?? ""} ${r.patient?.last_name ?? ""}`.trim() || `Patient #${r.patient}`;
  const psychologist = r.doctor?.user ? `${r.doctor.user.first_name} ${r.doctor.user.last_name}` : "Not assigned";

  async function remove() {
    setDeleting(true);
    try {
      await onDelete();
    } catch (e: any) { notify("error", e?.message || "Unable to delete."); }
    finally { setDeleting(false); }
  }

  return (
    <Card style={{ borderLeft: `4px solid ${tone}`, marginBottom: 12 }}>
      <div className="admin-card-heading" style={{ marginBottom: 14, justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span className="admin-eyebrow" style={{ color: tone, fontWeight: "600", textTransform: "uppercase", fontSize: "11px" }}>
            <Brain size={14} style={{ marginRight: 6 }} /> Psychology service #{r.id}
          </span>
          <h2 style={{ margin: "2px 0 4px", color: "#17384a", fontSize: "var(--text-lg)" }}>
            {r.session_mode === "in_person" ? "In-person" : "Online"} session
          </h2>
        </div>
        <Button variant="secondary" loading={deleting} disabled={deleting} onClick={() => remove()}>
          <Trash2 size={14} /> Delete
        </Button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, marginBottom: 10 }}>
        <div className="admin-field">
          <small style={{ color: "#82909d", textTransform: "uppercase", fontSize: "10px", letterSpacing: ".04em" }}>Patient</small>
          <p style={{ margin: "2px 0 0", color: "#17384a", fontSize: "var(--text-sm)", fontWeight: "500" }}>{patient}</p>
        </div>
        <div className="admin-field">
          <small style={{ color: "#82909d", textTransform: "uppercase", fontSize: "10px", letterSpacing: ".04em" }}>Status</small>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone }} />
            <b style={{ color: tone, fontSize: "var(--text-sm)" }}>{r.status}</b>
          </span>
        </div>
        <div className="admin-field">
          <small style={{ color: "#82909d", textTransform: "uppercase", fontSize: "10px", letterSpacing: ".04em" }}>Psychologist</small>
          <p style={{ margin: "2px 0 0", color: "#17384a", fontSize: "var(--text-sm)", fontWeight: "500" }}>{psychologist}</p>
        </div>
        <div className="admin-field" style={{ gridColumn: "span 3", display: "flex", alignItems: "center", gap: 8 }}>
          <UserRound size={16} style={{ color: "#82909d" }} />
          <small style={{ color: "#82909d", fontSize: "11px" }}>
            Mode: {r.session_mode === "in_person" ? "In person" : "Online"} · Urgency: {r.urgency} · Language: {r.language_preference}
          </small>
        </div>
      </div>
      {r.notes && (
        <div className="admin-field">
          <small style={{ color: "#82909d", textTransform: "uppercase", fontSize: "10px", letterSpacing: ".04em" }}>Notes</small>
          <p style={{ margin: "2px 0 0", color: "#536b7a", fontSize: "var(--text-sm)" }}>{r.notes}</p>
        </div>
      )}
      {r.sessions?.length > 0 && (
        <div className="admin-field">
          <small style={{ color: "#82909d", textTransform: "uppercase", fontSize: "10px", letterSpacing: ".04em" }}>Sessions</small>
          <p style={{ margin: "2px 0 0", color: "#17384a", fontSize: "var(--text-sm)", fontWeight: "500" }}>
            {r.sessions.length} scheduled
            {r.sessions.some((session: any) => session.status === "expired")
              ? ` · ${r.sessions.filter((session: any) => session.status === "expired").length} expired`
              : ""}
          </p>
        </div>
      )}
      {r.status === "expired" && (
        <div className="admin-field">
          <small style={{ color: "#82909d", textTransform: "uppercase", fontSize: "10px", letterSpacing: ".04em" }}>Expired</small>
          <p style={{ margin: "2px 0 0", color: "#525252", fontSize: "var(--text-sm)" }}>
            A scheduled session was not started before its time passed. The patient must
            submit a new psychology service request.
          </p>
        </div>
      )}
    </Card>
  );
}