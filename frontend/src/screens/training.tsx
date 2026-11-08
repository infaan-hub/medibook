import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { Card, Button, Badge, EmptyState, Skeleton, ErrorState } from "../components/ui";

export function TrainingScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiGet<any[]>("/training/");
      setItems(res.data ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load trainings.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const active = items.find((t) => ["pending","accepted","scheduled","in_progress"].includes(t.status));

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 className="page__title">Training</h1>
        {!active && <Link to="/training/request"><Button>Request training</Button></Link>}
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> :
       loading ? <Skeleton lines={6} /> :
       items.length === 0 ? <EmptyState title="No training requests" description="Request a training to get started." /> :
       <div style={{ display: "grid", gap: 12 }}>
         {items.map((t) => (
           <Card key={t.id}>
             <h3>{t.training_topic}</h3>
             <p>Status: {t.status}</p>
             <p>Audience: {t.audience}{t.company_name ? ` (${t.company_name})` : ""}</p>
             <p>Preferred start: {new Date(t.preferred_start_date).toLocaleDateString()} · {t.preferred_days} day(s)</p>
             <p>Delivery: {t.delivery_mode}{t.location ? ` · ${t.location}` : ""}</p>
             {t.doctor && <p>Specialist: Dr. {t.doctor.user.first_name} {t.doctor.user.last_name}</p>}
             <p>Sessions: {t.sessions?.map((s:any)=>`${s.session_number}:${s.status}`).join(", ")}</p>
           </Card>
         ))}
       </div>}
    </div>
  );
}
