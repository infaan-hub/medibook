import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../ui/design/tokens.css";
import "../ui/styles/global.css";
import "../ui/styles/shell.css";

export const metadata: Metadata = {
  title: "MediBook",
  description:
    "MediBook — find doctors, check availability, and book healthcare appointments.",
  manifest: "/manifest.json",
  icons: {
    // PNG only: Chrome ignores JPEG icons when checking installability (§22.1).
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon-180.png",
  },
  // iOS: launch from the home screen without Safari chrome.
  appleWebApp: {
    capable: true,
    title: "MediBook",
    statusBarStyle: "default",
  },
  other: {
    // Next emits the modern `mobile-web-app-capable`; iOS < 16.4 still needs
    // the legacy name to open the installed app standalone.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#08a79d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
          Earliest possible A2HS capture (§22.1, §69): the SPA is client-only
          (`app/[[...slug]]/page.tsx` uses ssr:false), so Chrome can fire
          `beforeinstallprompt` before React evaluates. `pwa/installPrompt.ts`
          adopts whatever this script stores.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();' +
              "window.__mbDeferredInstallPrompt=e;" +
              'window.dispatchEvent(new Event("medibook:install-available"))});',
          }}
        />
        {children}
      </body>
    </html>
  );
}
