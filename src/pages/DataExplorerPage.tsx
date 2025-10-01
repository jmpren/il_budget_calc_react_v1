import React, { useEffect, useMemo, useRef, useState } from "react";

type BudgetRow = { agency: string; division: string; source: string; appropriation?: string; amount: number };

const toNumber = (v: unknown) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const USD_FULL = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const DATA_URL = import.meta.env.VITE_DATA_URL || `${import.meta.env.BASE_URL}budget_latest.json`;

function useHashParams() {
  const parse = () => {
    const h = window.location.hash || "";
    const qIndex = h.indexOf("?");
    const query = new URLSearchParams(qIndex >= 0 ? h.slice(qIndex + 1) : "");
    return {
      agency: query.get("agency") || "",
      division: query.get("division") || "",
      source: query.get("source") || "",
      q: query.get("q") || "",
    };
  };
  const [params, setParams] = useState(parse);
  useEffect(() => {
    const onHash = () => setParams(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return params;
}

// Simple debounce hook
function useDebounced<T>(value: T, ms = 150) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export default function DataExplorerPage() {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { agency: agencyFromHash, division: divisionFromHash, q: qFromHash } = useHashParams();

  // Filters
  const [agency, setAgency] = useState<string>(agencyFromHash || "");
  const [division, setDivision] = useState<string>(divisionFromHash || "");
  const [source, setSource] = useState<string>("");
  const [query, setQuery] = useState<string>(qFromHash || "");

  // Debounced q for big lists
  const q = useDebounced(query, 150);

  useEffect(() => {
    // update local filters when hash changes
    setAgency(agencyFromHash || "");
    setDivision(divisionFromHash || "");
    if (qFromHash !== undefined) setQuery(qFromHash || "");
  }, [agencyFromHash, divisionFromHash, qFromHash]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(DATA_URL);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const payload = await r.json();
        const raw: BudgetRow[] = (Array.isArray(payload) ? payload : payload?.rows || []).map((d: any) => ({
          agency: String(d.agency ?? d.Agency ?? "").trim(),
          division: String(d.division ?? d.Division ?? "").trim(),
          source: String(d.source ?? d.Source ?? d["Funding Source"] ?? d["Fund Source"] ?? "").trim(),
          appropriation: String(d.appropriation ?? d.Appropriation ?? d["Appropriation"] ?? d["Line Item"] ?? "").trim(),
          amount: toNumber(d.amount ?? d.Funds ?? d.Allocation),
        }));
        // minimal cleanup
        setRows(raw.filter(r => r.agency && r.division));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Normalized cache for faster contains checks
  const normalized = useMemo(() => rows.map(r => ({
    ...r,
    agency_l: r.agency.toLowerCase(),
    division_l: r.division.toLowerCase(),
    source_l: r.source.toLowerCase(),
    appr_l: (r.appropriation || "").toLowerCase(),
  })), [rows]);

  const agencies = useMemo(() => Array.from(new Set(normalized.map(r => r.agency))).sort(), [normalized]);
  const divisions = useMemo(() => {
    const set = new Set<string>();
    normalized.forEach(r => { if (!agency || r.agency === agency) set.add(r.division); });
    return Array.from(set).sort();
  }, [normalized, agency]);
  const sources = useMemo(() => {
    const set = new Set<string>();
    normalized.forEach(r => { if ((!agency || r.agency === agency) && (!division || r.division === division)) set.add(r.source); });
    return Array.from(set).sort();
  }, [normalized, agency, division]);

  // Fast filter chain
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return normalized.filter(r => {
      if (agency && r.agency !== agency) return false;
      if (division && r.division !== division) return false;
      if (source && r.source !== source) return false;
      if (!ql) return true;
      return r.agency_l.includes(ql) || r.division_l.includes(ql) || r.source_l.includes(ql) || r.appr_l.includes(ql);
    });
  }, [normalized, agency, division, source, q]);

  const total = useMemo(() => filtered.reduce((s, r) => s + toNumber(r.amount), 0), [filtered]);

  // --------- windowed rendering (basic virtualization) ----------
  const ROW_H = 36; // px per row
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = () => setScrollTop(viewportRef.current?.scrollTop || 0);
  const viewportH = 560; // px viewport
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 10);
  const end = Math.min(filtered.length, Math.ceil((scrollTop + viewportH) / ROW_H) + 10);
  const slice = filtered.slice(start, end);
  const padTop = start * ROW_H;
  const padBottom = Math.max(0, (filtered.length - end) * ROW_H);
  // ---------------------------------------------------------------

  if (loading) return <div className="min-h-screen grid place-items-center opacity-70">Loading…</div>;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="bg-white rounded-xl p-4 border border-black/10 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agency / division / source / appropriation…"
            className="w-full px-3 py-2 rounded border border-black/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]"
          />
          <select
            value={agency}
            onChange={(e) => { setAgency(e.target.value); setDivision(""); }}
            className="w-full px-3 py-2 rounded border border-black/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]"
          >
            <option value="">All agencies</option>
            {agencies.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            className="w-full px-3 py-2 rounded border border-black/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]"
            disabled={!agency}
            title={agency ? "" : "Select an agency first"}
          >
            <option value="">{agency ? "All divisions" : "Pick agency first"}</option>
            {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full px-3 py-2 rounded border border-black/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]"
          >
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="text-xs opacity-70 mt-2">
          Rows: {filtered.length.toLocaleString()} • Total: {USD_FULL(total)}
        </div>
      </div>

      <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 px-3 py-2 text-xs font-semibold bg-[#f6f5f2] border-b border-black/10">
          <div className="col-span-4">Agency</div>
          <div className="col-span-4">Division</div>
          <div className="col-span-2">Source</div>
          <div className="col-span-2">Amount</div>
        </div>

        {/* Virtualized viewport */}
        <div
          ref={viewportRef}
          onScroll={onScroll}
          className="text-sm"
          style={{ height: `${viewportH}px`, overflow: "auto", position: "relative" }}
        >
          <div style={{ height: padTop }} />
          {slice.map((r, i) => (
            <div key={start + i} className="grid grid-cols-12 px-3 py-2 border-b border-black/5">
              <div className="col-span-4 pr-2 truncate" title={r.agency}>{r.agency}</div>
              <div className="col-span-4 pr-2 truncate" title={r.division || "(Unspecified Division)"}>
                <div className="truncate">{r.division || "(Unspecified Division)"}</div>
                {r.appropriation && (
                  <div className="text-xs opacity-70 truncate" title={r.appropriation}>{r.appropriation}</div>
                )}
              </div>
              <div className="col-span-2 pr-2 truncate" title={r.source || "(Unspecified Source)"}>{r.source || "(Unspecified Source)"}</div>
              <div className="col-span-2 text-right tabular-nums">{USD_FULL(toNumber(r.amount))}</div>
            </div>
          ))}
          <div style={{ height: padBottom }} />
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-sm opacity-70">No rows match.</div>
          )}
        </div>
      </div>
    </div>
  );
}
