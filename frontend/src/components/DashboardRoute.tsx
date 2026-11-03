import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { BootScreen, RequirePatient, RequireSession } from "./guards";
import { isStandalonePWA } from "../lib/platform";
import { useSession } from "../state/app-context";

export function DashboardRoute({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === "booting") return <BootScreen />;
  if (status === "guest" && !isStandalonePWA()) return <>{children}</>;

  return (
    <RequireSession>
      <AppShell>
        <RequirePatient>{children}</RequirePatient>
      </AppShell>
    </RequireSession>
  );
}
