/**
 * App shell (§22.6 responsive layout): sticky header, phone bottom nav,
 * tablet+ sidebar rail, install/update prompts, offline banner.
 * PHASE 5: navigation and the header user chip are role-aware.
 * PHASE 13: notification bell with unread count badge.
 * Responsive: CSS Grid layout, hamburger toggle at all sizes,
 * mobile/tablet drawer, desktop collapsible sidebar with localStorage persistence.
 * Premium medical sidebar with Lucide icons.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import type { BeforeInstallPromptEvent } from "../types/pwa";
import { useSession, useToast } from "../state/app-context";
import type { User } from "../api/types";
import { listUnreadNotifications } from "../api/notifications";
import { useRealtimeEvent } from "../realtime/socket";
import { isStandalone } from "../pwa/installPrompt";
import {
  Home,
  Stethoscope,
  Calendar,
  LayoutDashboard,
  HeartPulse,
  User as UserIcon,
  Bell,
  Menu,
  ChevronRight,
  Activity,
  FilePlus2,
  Users as UsersIcon,
  UserPlus,
  X,
  LogOut,
} from "lucide-react";

const DESKTOP_BP = 1200;
const STORAGE_KEY = "medibook_sidebar_collapsed";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

function navItemsFor(user: User | null): NavItem[] {
  if (user?.role === "admin" && user.is_superuser) {
    return [
      { to: "/admin", label: "Overview", icon: <LayoutDashboard size={20} /> },
      { to: "/admin/users", label: "Users", icon: <UsersIcon size={20} /> },
      { to: "/admin/users/new", label: "Add user", icon: <UserPlus size={20} /> },
      { to: "/admin/doctors", label: "Doctors", icon: <Stethoscope size={20} /> },
      { to: "/admin/doctors/new", label: "Add doctor", icon: <FilePlus2 size={20} /> },
      { to: "/admin/audit", label: "Audit log", icon: <Activity size={20} /> },
      { to: "/profile", label: "Profile", icon: <UserIcon size={20} /> },
    ];
  }
  if (user?.role === "doctor") {
    return [
      { to: "/doctor/dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
      { to: "/doctor/personal", label: "My card", icon: <UserIcon size={20} /> },
      { to: "/doctor/appointments", label: "Appointments", icon: <Calendar size={20} /> },
      { to: "/doctor/medical-treatment", label: "Treatments", icon: <HeartPulse size={20} /> },
      { to: "/notifications", label: "Notifications", icon: <Bell size={20} /> },
      { to: "/profile", label: "Profile", icon: <UserIcon size={20} /> },
    ];
  }
  return [
    { to: "/", label: "Home", icon: <Home size={20} /> },
    { to: "/doctors", label: "Doctors", icon: <Stethoscope size={20} /> },
    { to: "/appointments", label: "Appointments", icon: <Calendar size={20} /> },
    { to: "/settings", label: "Medical", icon: <HeartPulse size={20} /> },
    { to: "/notifications", label: "Notifications", icon: <Bell size={20} /> },
    { to: "/profile", label: "Profile", icon: <UserIcon size={20} /> },
  ];
}

/** Bottom nav: exactly 5 items per role (mobile only). */
function bottomNavItemsFor(user: User | null): NavItem[] {
  if (user?.role === "admin" && user.is_superuser) {
    return [
      { to: "/admin", label: "Overview", icon: <LayoutDashboard size={20} /> },
      { to: "/admin/users", label: "Users", icon: <UsersIcon size={20} /> },
      { to: "/admin/doctors", label: "Doctors", icon: <Stethoscope size={20} /> },
      { to: "/admin/audit", label: "Audit log", icon: <Activity size={20} /> },
      { to: "/profile", label: "Profile", icon: <UserIcon size={20} /> },
    ];
  }
  if (user?.role === "doctor") {
    return [
      { to: "/doctor/dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
      { to: "/doctor/personal", label: "My card", icon: <UserIcon size={20} /> },
      { to: "/doctor/appointments", label: "Appointments", icon: <Calendar size={20} /> },
      { to: "/notifications", label: "Notifications", icon: <Bell size={20} /> },
      { to: "/profile", label: "Profile", icon: <UserIcon size={20} /> },
    ];
  }
  return [
    { to: "/", label: "Home", icon: <Home size={20} /> },
    { to: "/doctors", label: "Doctors", icon: <Stethoscope size={20} /> },
    { to: "/appointments", label: "Appointments", icon: <Calendar size={20} /> },
    { to: "/notifications", label: "Notifications", icon: <Bell size={20} /> },
    { to: "/profile", label: "Profile", icon: <UserIcon size={20} /> },
  ];
}

function initials(user: User): string {
  const first = user.first_name.trim()[0] ?? "";
  const last = user.last_name.trim()[0] ?? "";
  return (first + last).toUpperCase() || user.email[0].toUpperCase();
}

/** Hook: returns true when viewport >= DESKTOP_BP */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= DESKTOP_BP
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BP}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

/** Notification bell with unread count badge (live via WebSocket + poll fallback). */
function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { notify } = useToast();

  const refresh = useCallback(() => {
    listUnreadNotifications()
      .then((r) => setUnreadCount(r.data.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // Polling stays as a safety net while the realtime socket reconnects.
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Live updates: badge + toast the moment the server pushes an event.
  useRealtimeEvent((event, payload) => {
    if (event === "notification.created") {
      setUnreadCount((count) => count + 1);
      notify(
        "info",
        typeof payload.message === "string" ? payload.message : "New notification"
      );
      refresh();
    } else if (event === "appointment.created" || event === "appointment.updated") {
      refresh();
    }
  });

  return (
    <Link to="/notifications" className="notif-bell" title="Notifications">
      <Bell size={20} />
      {unreadCount > 0 && (
        <span className="notif-bell__badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
      )}
    </Link>
  );
}

/** Avatar that shows profile image or initials fallback. */
function ProfileAvatar({
  user,
  size = 36,
  className = "",
}: {
  user: User | null;
  size?: number;
  className?: string;
}) {
  if (!user) return null;
  if (user.profile_image) {
    return (
      <img
        src={user.profile_image}
        alt={[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
        className={`profile-avatar ${className}`}
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`profile-avatar profile-avatar--initials ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials(user)}
    </span>
  );
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}

function NavLinks({ items, side = false, onNavigate, user }: { items: NavItem[]; side?: boolean; onNavigate?: () => void; user?: User | null }) {
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            ["nav-item", side ? "nav-item--side" : "", isActive ? "nav-item--active" : "", side && isActive ? "nav-item--side--active" : ""]
              .filter(Boolean)
              .join(" ")
          }
          onClick={onNavigate}
        >
          <span className="nav-item__icon" aria-hidden="true">
            {item.to === "/profile" && user?.profile_image && !side ? (
              <img
                src={user.profile_image}
                alt=""
                className="nav-item__profile-img"
                width={22}
                height={22}
              />
            ) : (
              item.icon
            )}
          </span>
          <span className="nav-item__label">{item.label}</span>
          {!side && <span className="nav-item__bar" aria-hidden="true" />}
        </NavLink>
      ))}
    </>
  );
}

function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in window));
    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setEvent(e);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (dismissed || isStandalone()) return null;

  if (event) {
    return (
      <div className="prompt" role="dialog" aria-label="Install MediBook">
        <span>Install MediBook for a faster, offline-capable experience.</span>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => {
            void event.prompt();
            setEvent(null);
          }}
        >
          Install
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss install prompt"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="prompt" role="dialog" aria-label="Install MediBook">
        <span>Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install MediBook.</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const online = useOnline();
  const { user, logout } = useSession();
  const items = navItemsFor(user);
  const bottomItems = bottomNavItemsFor(user);
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLElement>(null);

  // Sidebar open state: on desktop, defaults to "not collapsed"; on mobile, defaults to closed
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.innerWidth >= DESKTOP_BP) {
      return localStorage.getItem(STORAGE_KEY) !== "true";
    }
    return false;
  });

  // Persist desktop sidebar state
  useEffect(() => {
    if (isDesktop) {
      localStorage.setItem(STORAGE_KEY, String(!sidebarOpen));
    }
  }, [sidebarOpen, isDesktop]);

  // Close mobile/tablet sidebar on route change
  useEffect(() => {
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isDesktop]);

  // Close sidebar on Escape key
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sidebarOpen]);

  // Lock body scroll when mobile/tablet drawer is open
  useEffect(() => {
    if (isDesktop || !sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen, isDesktop]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((o) => !o);
  }, []);

  return (
    <div className={`shell${sidebarOpen && !isDesktop ? " shell--drawer-open" : ""}${user?.role === "admin" && user.is_superuser ? " shell--admin" : ""}`}>
      <header className="shell__header">
        <button
          className="shell__hamburger"
          type="button"
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={sidebarOpen}
          aria-controls="shell-sidebar"
          onClick={toggleSidebar}
        >
          <Menu size={20} />
        </button>
        <span className="shell__brand">
          <img className="shell__logo" src="/images/logo.jpeg" alt="MediBook" width={28} height={28} draggable={false} />
          <span className="shell__brand-text">MediBook</span>
        </span>
        <div className="shell__header-actions">
          <NotificationBell />
        </div>
      </header>

      {sidebarOpen && !isDesktop && (
        <div className="shell__overlay" onClick={closeSidebar} aria-hidden="true" />
      )}

      <div className="shell__body">
        <nav
          ref={sidebarRef}
          id="shell-sidebar"
          className={`shell__nav--side${sidebarOpen ? " shell__nav--side--open" : ""}`}
          aria-label="Primary"
        >
          <div className="sidebar__header">
            <img className="sidebar__logo" src="/images/logo.jpeg" alt="" width={32} height={32} draggable={false} />
            <span className="sidebar__title">MediBook</span>
            {!isDesktop && (
              <button
                type="button"
                className="sidebar__close"
                onClick={closeSidebar}
                aria-label="Close navigation"
              >
                <X size={20} />
              </button>
            )}
          </div>
          <div className="sidebar__divider" />
          <NavLinks items={items} side onNavigate={closeSidebar} user={user} />
          <div className="sidebar__spacer" />
          <div className="sidebar__divider" />
          <Link
            to="/profile"
            className="sidebar__user"
            onClick={closeSidebar}
          >
            <ProfileAvatar user={user} size={44} className="sidebar__user-avatar" />
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">
                {user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email : "Guest"}
              </span>
              <span className="sidebar__user-role">{user?.role ?? ""}</span>
            </div>
            <ChevronRight size={16} className="sidebar__user-chevron" aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="sidebar__signout"
            onClick={() => {
              closeSidebar();
              logout().then(() => {
                // Every role lands on the guest-only sign-in screen.
                navigate("/signin", { replace: true });
              });
            }}
          >
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </nav>

        <main className="shell__content" id="main">
          {!online && (
            <div className="offline-banner" role="alert">
              You're offline — some features are unavailable.
            </div>
          )}
          {children}
        </main>
      </div>

      <nav className="shell__nav--bottom" aria-label="Primary">
        <NavLinks items={bottomItems} user={user} />
      </nav>

      <InstallPrompt />
    </div>
  );
}
