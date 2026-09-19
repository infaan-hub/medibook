/**
 * App shell (§22.6 responsive layout): sticky header, phone bottom nav,
 * tablet+ sidebar rail, install/update prompts, offline banner.
 * PHASE 5: navigation and the header user chip are role-aware.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import type { BeforeInstallPromptEvent } from "../types/pwa";
import { useSession } from "../state/app-context";
import type { User } from "../api/types";

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

function navItemsFor(user: User | null): NavItem[] {
  const items: NavItem[] = [
    { to: "/", label: "Home", icon: "⌂" },
    { to: "/doctors", label: "Doctors", icon: "✚" },
  ];
  if (user?.role === "patient") {
    items.push({ to: "/appointments", label: "Appointments", icon: "🗓" });
  }
  if (user?.role === "doctor") {
    items.push({ to: "/appointments", label: "Schedule", icon: "🗓" });
    items.push({ to: "/doctor/dashboard", label: "Dashboard", icon: "📋" });
  }
  if (user?.role === "admin") {
    items.push({ to: "/admin", label: "Admin", icon: "⚙" });
  }
  if (user?.role === "patient") {
    items.push({ to: "/settings", label: "Settings", icon: "🩺" });
  }
  items.push({ to: "/profile", label: "Profile", icon: "👤" });
  return items;
}

function initials(user: User): string {
  const first = user.first_name.trim()[0] ?? "";
  const last = user.last_name.trim()[0] ?? "";
  return (first + last).toUpperCase() || user.email[0].toUpperCase();
}

/** Header chip: avatar initials + name + role, links to the profile screen. */
function UserChip() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <Link to="/profile" className="user-chip" title="Open profile">
      <span className="user-chip__avatar" aria-hidden="true">
        {initials(user)}
      </span>
      <span className="user-chip__text">
        <span className="user-chip__name">
          {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
        </span>
        <span className="user-chip__role">{user.role}</span>
      </span>
    </Link>
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

function NavLinks({ items, side = false }: { items: NavItem[]; side?: boolean }) {
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            ["nav-item", side ? "nav-item--side" : "", isActive ? "nav-item--active" : ""]
              .filter(Boolean)
              .join(" ")
          }
        >
          <span className="nav-item__icon" aria-hidden="true">
            {item.icon}
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

  useEffect(() => {
    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault(); // §22.1: defer the native prompt to a user gesture
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

  if (!event) return null;
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
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const online = useOnline();
  const { user } = useSession();
  const items = navItemsFor(user);

  return (
    <div className="shell">
      <header className="shell__header">
        <span className="shell__brand">
          <span className="shell__logo" aria-hidden="true">
            M
          </span>
          MediBook
        </span>
        <UserChip />
      </header>

      <div className="shell__body">
        <nav className="shell__nav--side" aria-label="Primary">
          <NavLinks items={items} side />
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
        <NavLinks items={items} />
      </nav>

      <InstallPrompt />
    </div>
  );
}