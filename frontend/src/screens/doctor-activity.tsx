/**
 * Doctor Activity — the signed-in doctor's own audit trail (logins,
 * appointments, profile changes …) from GET /api/doctor/audit/.
 * Reuses the admin audit-row styling; no admin filters needed here.
 */
import { useCallback, useEffect, useState } from "react";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { listMyActivity } from "../api/doctors";
import type { AuditEvent } from "../api/types";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";

const PAGE_SIZE = 20;

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DoctorActivityScreen() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listMyActivity({ page, page_size: PAGE_SIZE })
      .then((response) => {
        setEvents(response.data.results);
        setCount(response.data.count);
      })
      .catch((reason) => {
        setError(message(reason));
        setEvents((current) => current ?? []);
      });
  }, [page]);
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const from = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, count);

  return (
    <div className="page doctor-activity-page">
      <h1 className="page__title">Activity</h1>
      <Card>
        <div className="admin-card-heading">
          <div>
            <h2>Your recent activity</h2>
            <p>Logins, appointments and changes you made</p>
          </div>
        </div>
        {error && <ErrorState message={error} onRetry={load} />}
        {events === null ? (
          <Skeleton lines={6} />
        ) : events.length === 0 ? (
          <EmptyState title="No activity yet" description="Your logins and appointment actions will appear here." />
        ) : (
          <>
            <div className="admin-audit-list">
              {events.map((event) => (
                <div className="admin-audit-row" key={event.id}>
                  <span className="admin-activity-icon"><Activity size={16} /></span>
                  <span>
                    <b>{event.action.replace(/[._]/g, " ")}</b>
                    <small>{event.target} · {event.detail}</small>
                  </span>
                  <span className="admin-audit-meta">
                    <b>{event.actor}</b>
                    <small>{formatTime(event.created_at)}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="admin-audit-pager">
              <span>{from}–{to} of {count.toLocaleString()} events</span>
              <span>
                <button className="admin-table-action" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  <ChevronLeft size={14} /> Previous
                </button>
                <button className="admin-table-action" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                  Next <ChevronRight size={14} />
                </button>
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
