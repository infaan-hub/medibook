/**
 * PHASE 5 — Admin placeholder (behind RequireRole("admin")).
 * The real dashboard with platform statistics arrives in PHASE 14.
 */

import { Card, EmptyState } from "../components/ui";
import { useSession } from "../state/app-context";

export function AdminScreen() {
  const { user } = useSession();
  return (
    <div className="page">
      <h1 className="page__title">Admin dashboard</h1>
      <p className="page__subtitle">Platform statistics and management screens arrive in PHASE 14.</p>

      <Card>
        <h2 className="card__title">Signed in as administrator</h2>
        <p className="card__text">{user?.email}</p>
      </Card>

      <EmptyState
        icon="⚙"
        title="Admin screens coming soon"
        description="The backend /api/admin/stats/ endpoint is live and tested; the dashboard UI is built in PHASE 14."
      />
    </div>
  );
}
