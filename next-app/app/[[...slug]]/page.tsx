"use client";

import dynamic from "next/dynamic";

/**
 * Client-only mount of the MediBook SPA (react-router). Next.js serves every
 * non-API path through this optional catch-all; routing inside is handled by
 * the existing React Router tree in ui/App.tsx.
 */
const App = dynamic(() => import("../../ui/App"), { ssr: false });

export default function CatchAllPage() {
  return (
    <div id="root">
      <App />
    </div>
  );
}
