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
    icon: "/icons/logo.jpeg",
    apple: "/icons/logo.jpeg",
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
      <body>{children}</body>
    </html>
  );
}
