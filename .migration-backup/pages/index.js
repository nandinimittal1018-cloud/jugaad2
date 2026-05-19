// pages/index.js — FIXED

import { useEffect } from "react";
import dynamic from "next/dynamic";

const JugaadDiagnostics = dynamic(
  () => import("../components/JugaadDiagnostics"),
  { ssr: false }
);

export default function Home() {
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch(url, options) {
      if (
        typeof url === "string" &&
        url.includes("api.anthropic.com")
      ) {
        // ── BUG 4 FIX ───────────────────────────────────────────────────────
        // The old index.js was dropping the x-api-key and anthropic-version
        // headers (harmless since we add the key server-side), BUT it was also
        // spreading `options` AFTER manually setting method/headers, meaning
        // the spread could overwrite Content-Type with the original headers
        // object that included x-api-key, causing a CORS preflight failure in
        // some browsers.
        //
        // FIX: explicitly build clean headers, pass body through untouched.
        // ────────────────────────────────────────────────────────────────────
        return originalFetch("/api/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: options?.body,  // already a JSON string — pass through as-is
        });
      }
      return originalFetch(url, options);
    };

    // ── BUG 5 FIX ─────────────────────────────────────────────────────────────
    // The old code's cleanup function restored window.fetch correctly,
    // BUT it was declared inside the useEffect closure AFTER the patched fetch
    // was assigned, meaning if the component unmounted and remounted quickly
    // (e.g. HMR / React StrictMode double-invoke), the original fetch captured
    // in the closure was already the patched version — leading to infinite
    // redirect loops on subsequent mounts.
    //
    // FIX: capture originalFetch before any assignment, return cleanup that
    // restores it. This is already correct above — just documenting it.
    // ──────────────────────────────────────────────────────────────────────────
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <JugaadDiagnostics />;
}
