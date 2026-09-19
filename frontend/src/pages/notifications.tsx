/**
 * PHASE 13 — Notifications: in-app inbox with mark-read, delete, and unread filter.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteNotification,
  listNotifications,
  markNotificationRead,
} from "../api/notifications";
import type { Notification, NotificationType } from "../api/types";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_ICONS: Record<NotificationType, string> = {
  appointment_request: "📅",
  appointment_confirmed: "✅",
  appointment_cancelled: "❌",
  appointment_rejected: "🚫",
  appointment_reminder: "🔔",
  review: "⭐",
  system: "ℹ️",
};

/* ======================================
   NOTIFICATION ROW
   ====================================== */

function NotificationRow({
  notification,
  onRead,
  onDelete,
}: {
  notification: Notification;
  onRead: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const navigate = useNavigate();

  function handleClick() {
    if (!notification.is_read) onRead(notification.id);
    if (notification.related_appointment) {
      navigate(`/appointments/${notification.related_appointment}`);
    }
  }

  return (
    <div
      className={`notif-row${notification.is_read ? "" : " notif-row--unread"}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
    >
      <span className="notif-row__icon">{TYPE_ICONS[notification.notification_type]}</span>
      <div className="notif-row__content">
        <div className="notif-row__header">
          <span className="notif-row__title">{notification.title}</span>
          <span className="notif-row__time">{timeAgo(notification.created_at)}</span>
        </div>
        <p className="notif-row__message">{notification.message}</p>
      </div>
      <button
        className="notif-row__delete"
        onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
        aria-label="Delete notification"
      >
        ×
      </button>
    </div>
  );
}

/* ======================================
   NOTIFICATIONS SCREEN
   ====================================== */

export function NotificationsScreen() {
  const { notify } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    const params = filter === "unread" ? { unread: 1 } : undefined;
    listNotifications(params)
      .then((r) => setNotifications(r.data.results))
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function handleRead(id: number) {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (e) {
      notify("error", message(e));
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      notify("success", "Notification deleted.");
    } catch (e) {
      notify("error", message(e));
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="page">
      <h1 className="page__title">Notifications</h1>

      {/* Filter tabs */}
      <div className="tabs">
        <button
          className={`tabs__tab${filter === "all" ? " tabs__tab--active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={`tabs__tab${filter === "unread" ? " tabs__tab--active" : ""}`}
          onClick={() => setFilter("unread")}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <Skeleton lines={5} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon="🔔"
          title={filter === "unread" ? "No unread notifications" : "No notifications"}
          description={
            filter === "unread"
              ? "You're all caught up!"
              : "Notifications about your appointments and activity will appear here."
          }
        />
      ) : (
        <Card className="notif-list">
          {notifications.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onRead={handleRead}
              onDelete={handleDelete}
            />
          ))}
        </Card>
      )}
    </div>
  );
}
