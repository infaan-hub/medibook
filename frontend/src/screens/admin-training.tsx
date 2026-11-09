import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { Card, Button, EmptyState, Skeleton, ErrorState } from "../components/ui";
import { useToast } from "../state/app-context";
import { GraduationCap, Trash2 } from "lucide-react";

export function AdminTrainingScreen() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/training");
      setItems(res.data ?? []);
    } catch (e: any) { setError(e?.message || "Failed."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function remove(id: number) {
    if (!window.confirm("Delete this training request?")) return;
    try {
      await apiPost("/training/?action=delete", { id });
      notify("success", "Training deleted.");
      setItems((cur) => cur.filter((t) => t.id !== id));
    } catch (e: any) { notify("error", e?.message || "Unable to delete."); }
  }

  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => void load()} /></div>;

  return (
    <div className="page admin-workspace">
      <div className="admin-page-header">
        <div><p className="admin-eyebrow">MediBook control center</p><h1>Training</h1><p>View and manage all training requests.</p></div>
      </div>
      {items.length === 0 && <EmptyState title="No training requests" description="Training requests will appear here." />}
      {items.map((t) => (
        <Card key={t.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Training #{t.id} — {t.training_topic}</strong>
            <Button variant="secondary" onClick={() => void remove(t.id)}><Trash2 size={14} /> Delete</Button>
          </div>
          <p>Patient: {t.patient?.first_name} {t.patient?.last_name}</p>
          <p>Status: {t.status}</p>
          {t.doctor && <p>Specialist: {t.doctor.user.first_name} {t.doctor.user.last_name}</p>}
        </Card>
      ))}
    </div>
  );
}