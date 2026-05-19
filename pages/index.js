// pages/index.js
// ─────────────────────────────────────────────────────────────────────────────
// This file does ONE thing: intercept every fetch() call the React component
// makes to https://api.anthropic.com/v1/messages and silently redirect them
// to our secure backend route /api/claude — with zero changes to the component.
//
// HOW IT WORKS
// ────────────
// The component (JugaadDiagnostics) calls fetch("https://api.anthropic.com/...")
// We monkey-patch window.fetch BEFORE the component mounts so those calls
// transparently hit /api/claude instead.  The response shape is identical so
// the component never notices.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import dynamic from "next/dynamic";

// Load the component without SSR (it uses window / SpeechRecognition APIs)
const JugaadDiagnostics = dynamic(() => import("../components/JugaadDiagnostics"), {
  ssr: false,
});

export default function Home() {
  useEffect(() => {
    // ── Fetch interceptor ──────────────────────────────────────────────────
    // Runs once on mount, before any user interaction.
    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch(url, options) {
      // Only intercept direct Anthropic API calls
      if (
        typeof url === "string" &&
        url.includes("api.anthropic.com/v1/messages")
      ) {
        // Rewrite URL to our backend proxy
        return originalFetch("/api/claude", {
          ...options,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {}),
          },
          // Body is already a JSON string — pass through unchanged
        });
      }

      // All other fetches are unaffected
      return originalFetch(url, options);
    };

    // Cleanup: restore original fetch when the page unmounts
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <JugaadDiagnostics />;
}
