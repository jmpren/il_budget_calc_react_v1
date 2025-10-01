// src/components/DataFooter.tsx
import React from "react";

export default function DataFooter() {
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = import.meta.env.BASE_URL || "/";
        const res = await fetch(`${base}budget_meta.json`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const meta = await res.json();
        if (!cancelled && meta?.lastUpdated) setLastUpdated(meta.lastUpdated);
      } catch {
        // optional footer — silently skip if file missing
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!lastUpdated) return null;

  return (
    <footer
      style={{
        marginTop: "2rem",
        padding: "1rem 0",
        opacity: 0.8,
        fontSize: 12,
        textAlign: "center",
        borderTop: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      Data last updated: {lastUpdated}
    </footer>
  );
}
