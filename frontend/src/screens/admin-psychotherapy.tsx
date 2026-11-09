import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";
import { Brain, Trash2 } from "lucide-react";

export function AdminPsychotherapyScreen() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/psychotherapy");
      setItems(res.data ?? []);
    } catch (e: any) { setError(e?.message || "Failed."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function remove(id: number) {
    if (!window.confirm("Delete this psychology service request?")) return;
    try {
      await apiPost("/psychotherapy/?action=delete", { id });
      notify("success", "Psychology service deleted.");
      setItems((cur) => cur.filter((r) => r.id !== id));
    } catch (e: any) { notify("error", e?.message || "Unable to delete."); }
  }

  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => void load()} /></div>;

  return (
    <div className="page admin-workspace">
      <div className="admin-page-header">
        <div><p className="admin-eyebrow">MediBook control center</p><h1>Psychology service</h1><p>View and manage all psychology service requests and sessions.</p></div>
      </div>
      {items.length === 0 && <EmptyState title="No psychology service requests" description="Requests will appear here." />}
      {items.map((r) => (
        <Card key={r.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Psychology service #{r.id}</strong>
            <Button variant="secondary" onClick={() => void remove(r.id)}><Trash2 size={14} /> Delete</Button>
          </div>
          <p>Patient: {r.patient?.first_name} {r.patient?.last_name}</p>
          <p>Status: {r.status}</p>
          {r.doctor && <p>Psychologist: {r.doctor.user.first_name} {r.doctor.user.last_name}</p>}
          {r.sessions?.length > 0 && <p>Sessions: {r.sessions.length}</p>}
        </Card>
      ))}
    </div>
  );
}