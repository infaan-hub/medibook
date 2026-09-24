"use client";

import dynamic from "next/dynamic";

/**
 * Client-only mount of the existing SPA (react-router). Same src/ tree as
 * before — only the bundler changed from Vite to Next.js.
 */
const App = dynamic(() => import("../../src/App"), { ssr: false });

export default function CatchAllPage() {
  return (
    <div id="root">
      <App />
    </div>
  );
}
