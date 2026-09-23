import type { ReactNode } from "react";

export const metadata = {
  title: "MediBook API",
  description: "MediBook backend — Next.js + TypeScript + Prisma + PostgreSQL",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
