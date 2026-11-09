import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { apiGet, apiPost } from "../api/client";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";
import { ArrowLeft, GraduationCap, Trash2, UserRound } from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  pending: "#a86200",
  accepted: "#087f79",
  in_progress: "#7c3aed",
  completed: "#16805d",
  cancelled: "#a9b6bf",
};

export function AdminTrainingScreen() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/training");
      setItems(res.data ?? []);
    } catch (e: any) { setError(e?.message || "Failed."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = items.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return String(t.id).includes(q)
        || String(t.training_topic).toLowerCase().includes(q)
        || `${t.patient?.first_name ?? ""} ${t.patient?.last_name ?? ""}`.toLowerCase().includes(q)
        || `${t.doctor?.user?.first_name ?? ""} ${t.doctor?.user?.last_name ?? ""}`.toLowerCase().includes(q);
    }
    return true;
  });

  const statusCounts = {
    all: items.length,
    pending: items.filter((t) => t.status === "pending").length,
    accepted: items.filter((t) => t.status === "accepted").length,
    in_progress: items.filter((t) => t.status === "in_progress").length,
    completed: items.filter((t) => t.status === "completed").length,
    cancelled: items.filter((t) => t.status === "cancelled").length,
  };

  async function remove(id: number) {
    if (!window.confirm("Delete this training request?")) return;
    try {
      await apiPost("/training/?action=delete", { id });
      notify("success", "Training deleted.");
      setItems((cur) => cur.filter((t) => t.id !== id));
    } catch (e: any) { notify("error", e?.message || "Unable to delete."); }
  }

  if (loading) return <div className="page admin-workspace"><Skeleton lines={6} /></div>;
  if (error) return <div className="page admin-workspace"><ErrorState message={error} onRetry={() => void load()} /></div>;

  return (
    <div className="admin-workspace">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">MediBook control center</p>
          <h1>Training</h1>
          <p>View and manage all training requests.</p>
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
              placeholder="Search by ID, topic, patient or specialist..."
            />
          </div>
          <div className="admin-filter-tabs">
            {([
              ["", "All", statusCounts.all],
              ["pending", "Pending", statusCounts.pending],
              ["accepted", "Accepted", statusCounts.accepted],
              ["in_progress", "In progress", statusCounts.in_progress],
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
        {filtered.length === 0 ? (
          <EmptyState title="No training requests" description="Try a different search or filter." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((t) => (
              <TrainingCard key={t.id} t={t} onDelete={() => remove(t.id)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TrainingCard({ t, onDelete }: { t: any; onDelete: () => void }) {
  const { notify } = useToast();
  const [deleting, setDeleting] = useState(false);
  const tone = STATUS_TONE[t.status] ?? "#82909d";
  const patient = `${t.patient?.first_name ?? ""} ${t.patient?.last_name ?? ""}`.trim() || `Patient #${t.patient}`;
  const specialist = t.doctor?.user ? `${t.doctor.user.first_name} ${t.doctor.user.last_name}` : "Not assigned";

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
            <GraduationCap size={14} style={{ marginRight: 6 }} /> Training #{t.id}
          </span>
          <h2 style={{ margin: "2px 0 4px", color: "#17384a", fontSize: "var(--text-lg)" }}>{t.training_topic}</h2>
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
            <b style={{ color: tone, fontSize: "var(--text-sm)" }}>{t.status}</b>
          </span>
        </div>
        <div className="admin-field">
          <small style={{ color: "#82909d", textTransform: "uppercase", fontSize: "10px", letterSpacing: ".04em" }}>Specialist</small>
          <p style={{ margin: "2px 0 0", color: "#17384a", fontSize: "var(--text-sm)", fontWeight: "500" }}>{specialist}</p>
        </div>
        <div className="admin-field" style={{ gridColumn: "span 3", display: "flex", alignItems: "center", gap: 8 }}>
          <UserRound size={16} style={{ color: "#82909d" }} />
          <small style={{ color: "#82909d", fontSize: "11px" }}>{t.audience === "company" ? `Company · ${t.company_name || ""}` : "Individual request"}</small>
        </div>
      </div>
      {t.notes && (
        <div className="admin-field">
          <small style={{ color: "#82909d", textTransform: "uppercase", fontSize: "10px", letterSpacing: ".04em" }}>Notes</small>
          <p style={{ margin: "2px 0 0", color: "#536b7a", fontSize: "var(--text-sm)" }}>{t.notes}</p>
        </div>
      )}
    </Card>
  );
}