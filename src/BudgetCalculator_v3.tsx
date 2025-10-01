import React, { useEffect, useMemo, useState } from "react";
import { Search, BarChart3, XCircle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from "recharts";
import DataFooter from "./components/DataFooter";

/* =========================
   Types & Helpers
   ========================= */
type BudgetRow = { agency: string; division: string; source: string; amount: number };

type DonutSlice = { name: string; amount: number; color: string; pct: number };

const USD_FULL = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const currencyFormatter = (n: number) =>
  "$" + Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

const toNumber = (v: unknown) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const includesCI = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes((needle || "").trim().toLowerCase());

const COLORS = [
  "#4F6EF7", "#7D89F8", "#2DC5F4", "#C15CFC", "#F54AC0",
  "#08BDBA", "#7A9364", "#F0C808", "#DD1C1A", "#B8BEE2",
  "#A3D6CF", "#C1B7A8",
];
const colorByIndex = (i: number) => COLORS[i % COLORS.length];

const DATA_URL =
  import.meta.env.VITE_DATA_URL ||               // set for prod if you host JSON elsewhere
  `${import.meta.env.BASE_URL}budget_latest.json`;  // local/public fallback


// Filter out agency-level totals / blank division lines
const isLikelyTotalRow = (division: string) => {
  const d = (division || "").trim().toLowerCase();
  if (!d) return true; // blank division -> drop
  if (/(^|\s)total(s)?(\s|$)/i.test(d)) return true; // “Total”, “Agency Total”, etc.
  return false;
};

/* =========================
   Component
   ========================= */
const BudgetCalculator_v3: React.FC = () => {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [donutMode, setDonutMode] = useState<"division" | "source">("division");

  // Data Explorer state
const [explorerOpen, setExplorerOpen] = useState(false);
const [explorerQuery, setExplorerQuery] = useState("");

// Rows shown in explorer (auto-filters to selected agency if set)
const explorerRows = useMemo(() => {
  const q = explorerQuery.trim().toLowerCase();
  return rows.filter(r => {
    if (selectedAgency && r.agency !== selectedAgency) return false;
    if (!q) return true;
    return (
      r.agency.toLowerCase().includes(q) ||
      r.division.toLowerCase().includes(q) ||
      r.source.toLowerCase().includes(q)
    );
  });
}, [rows, selectedAgency, explorerQuery]);

// Explorer total
const explorerTotal = useMemo(
  () => explorerRows.reduce((s, r) => s + toNumber(r.amount), 0),
  [explorerRows]
);


  // Load & sanitize data
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
          amount: toNumber(d.amount ?? d.Funds ?? d.Allocation),
        }));

        // drop blanks & totals; keep only detail rows
        const detailOnly = raw.filter((r) => r.agency && !isLikelyTotalRow(r.division));

        // consolidate duplicates (same agency+division+source)
        const agg = new Map<string, BudgetRow>();
        for (const r of detailOnly) {
          const key = `${r.agency}|||${r.division}|||${r.source}`;
          const prev = agg.get(key);
          if (prev) prev.amount += toNumber(r.amount);
          else agg.set(key, { ...r });
        }

        setRows([...agg.values()]);
      } catch (err) {
        console.warn("Failed to load /budget_v3.json; ensure it’s {agency, division, source, amount} in /public.", err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Reset toggle on agency change
  useEffect(() => {
    if (selectedAgency) setDonutMode("division");
  }, [selectedAgency]);

  // Aggregations
  const totalState = useMemo(() => rows.reduce((s, r) => s + toNumber(r.amount), 0), [rows]);

  const agencies = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.agency, (map.get(r.agency) ?? 0) + toNumber(r.amount));
    const list = Array.from(map.entries()).map(([agency, total]) => ({ agency, total }));
    list.sort((a, b) => b.total - a.total);
    return list;
  }, [rows]);

  const filteredAgencies = useMemo(() => {
    if (!search.trim()) return agencies;
    return agencies.filter((a) => includesCI(a.agency, search));
  }, [agencies, search]);

  const divisions = useMemo(() => {
    if (!selectedAgency) return [] as { division: string; total: number }[];
    const map = new Map<string, number>();
    rows.forEach((r) => {
      if (r.agency === selectedAgency) {
        const key = r.division || "(Unspecified Division)";
        map.set(key, (map.get(key) ?? 0) + toNumber(r.amount));
      }
    });
    const list = Array.from(map.entries()).map(([division, total]) => ({ division, total }));
    list.sort((a, b) => b.total - a.total);
    return list;
  }, [rows, selectedAgency]);

  const sourcesInAgency = useMemo(() => {
    if (!selectedAgency) return [] as { source: string; total: number }[];
    const map = new Map<string, number>();
    rows.forEach((r) => {
      if (r.agency === selectedAgency) {
        const key = r.source || "(Unspecified Source)";
        map.set(key, (map.get(key) ?? 0) + toNumber(r.amount));
      }
    });
    const list = Array.from(map.entries()).map(([source, total]) => ({ source, total }));
    list.sort((a, b) => b.total - a.total);
    return list;
  }, [rows, selectedAgency]);

  const agencyTotal = useMemo(() => (selectedAgency ? divisions.reduce((s, d) => s + d.total, 0) : 0), [divisions, selectedAgency]);
  const agencyDivisionCount = divisions.length;
  const agencyPctOfState = totalState ? (agencyTotal / totalState) * 100 : 0;

  // Donut data (switchable between Division / Funding Source)
  const donutData: DonutSlice[] = useMemo(() => {
    if (!selectedAgency) return [];
    const data = donutMode === "division"
      ? divisions.map((d, i) => ({ name: d.division || "(Unspecified Division)", amount: d.total, color: colorByIndex(i), pct: agencyTotal ? d.total / agencyTotal : 0 }))
      : sourcesInAgency.map((s, i) => ({ name: s.source || "(Unspecified Source)", amount: s.total, color: colorByIndex(i), pct: agencyTotal ? s.total / agencyTotal : 0 }));
    return data;
  }, [selectedAgency, donutMode, divisions, sourcesInAgency, agencyTotal]);

  if (loading) return <div className="min-h-screen grid place-items-center opacity-70">Loading…</div>;

  return (
    <div className="min-h-screen w-full bg-[#f6f5f2] text-black">
      {/* Top bar */}
      <div className="bg-[#eae6dd] border-b border-black/10 sticky top-0 z-30">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-7 h-7 opacity-70" />
              <h1 className="text-2xl font-bold">Illinois Budget Explorer</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-5 border border-black/10 shadow-sm">
            <div className="text-sm opacity-70 mb-1">Agency Total Funds</div>
            <div className="text-2xl font-bold">{selectedAgency ? USD_FULL(agencyTotal) : "—"}</div>
            {selectedAgency && <div className="text-xs opacity-60 mt-1">For: {selectedAgency}</div>}
          </div>
          <div className="bg-white rounded-xl p-5 border border-black/10 shadow-sm">
            <div className="text-sm opacity-70 mb-1">Number of Divisions</div>
            <div className="text-2xl font-bold">{selectedAgency ? agencyDivisionCount : "—"}</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-black/10 shadow-sm">
            <div className="text-sm opacity-70 mb-1">Agency % of Total State Budget</div>
            <div className="text-2xl font-bold">{selectedAgency ? `${agencyPctOfState.toFixed(1)}%` : "—"}</div>
            <div className="text-xs opacity-60 mt-1">State Total: {USD_FULL(totalState)}</div>
          </div>
        </div>

        {/* FULL-WIDTH Donut card — ABOVE the search, only after an agency is selected */}
        {selectedAgency && (
          <div className="bg-white rounded-xl border border-black/10 shadow-sm p-0">
            <div className="px-6 pt-6 flex items-start justify-between">
              <div>
                <h3 className="text-base font-medium text-slate-900">{donutMode === "division" ? `Division breakdown — ${selectedAgency}` : `Funding sources — ${selectedAgency}`}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">Allocation with amounts and shares of the agency total.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-3 text-sm">
                  <button
                    className={donutMode === 'division' ? 'text-blue-600 font-medium' : 'text-slate-600 hover:text-slate-800'}
                    onClick={() => setDonutMode('division')}
                  >
                    Divisions
                  </button>
                  <button
                    className={donutMode === 'source' ? 'text-blue-600 font-medium' : 'text-slate-600 hover:text-slate-800'}
                    onClick={() => setDonutMode('source')}
                  >
                    Funding Sources
                  </button>
                </div>
                <button
                  onClick={() => setSelectedAgency(null)}
                  className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
                  title="Clear selected agency"
                >
                  <XCircle className="w-4 h-4" />
                  Clear
                </button>
              </div>
            </div>

            <div className="px-6 pb-6">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Donut */}
                <div className="h-[360px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="amount"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={92}
                        outerRadius={130}
                        isAnimationActive={false}
                        labelLine={false}
                      >
                        {donutData.map((item, idx) => (
                          <Cell key={idx} fill={item.color} stroke="#fff" strokeWidth={1} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: any, _name: any, payload: any) => [
                          USD_FULL(Number(value) || 0),
                          payload?.payload?.name ?? "",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Center total */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-lg font-semibold text-slate-700">{USD_FULL(agencyTotal)}</div>
                  </div>
                </div>

                {/* List */}
                <div>
                  <p className="mt-0 mb-2 flex items-center justify-between text-xs text-slate-600">
                    <span>{donutMode === 'division' ? 'Division' : 'Source'}</span>
                    <span>Amount / Share</span>
                  </p>

                  <ul className="divide-y divide-black/10 border border-black/10 rounded">
                    {donutData.map((item, i) => (
                      <li key={item.name + i} className="flex items-center justify-between px-4 py-3 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-6 border-l-[2.5px] pl-3 flex items-center" style={{ borderLeftColor: item.color }}>
                            <span className="truncate">{item.name}</span>
                          </div>
                        </div>
                        <span className="tabular-nums">
                          {currencyFormatter(item.amount)} <span className="opacity-70">({(item.pct * 100).toFixed(1)}%)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Full-width search bar (under tiles / donut) */}
        <div className="w-full">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agencies…"
              className="w-full pl-10 pr-3 py-3 rounded-xl border border-black/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]"
            />
          </div>
          <div className="text-xs opacity-70 mt-2">
            Showing {filteredAgencies.length} of {agencies.length} agencies
          </div>
        </div>

        {/* Agencies list */}
        <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-black/10 font-semibold">Agencies</div>
          {filteredAgencies.length === 0 ? (
            <div className="p-4 text-sm opacity-70">No agencies match your search.</div>
          ) : (
            <ul className="max-h-[60vh] overflow-auto divide-y divide-black/10">
              {filteredAgencies.map(({ agency, total }) => (
                <li key={agency}>
                  <button
                    onClick={() => setSelectedAgency(agency)}
                    className={`w-full text-left px-4 py-3 hover:bg-[#f6f5f2] ${agency === selectedAgency ? "bg-[#f3f2ee]" : ""}`}
                    aria-pressed={agency === selectedAgency}
                  >
                    <div className="font-medium truncate" title={agency}>{agency}</div>
                    <div className="text-sm opacity-70">{USD_FULL(total)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* No division table (per request) */}
      </div>

{/* Data Explorer */}
<div className="bg-white border border-black/10 rounded-xl overflow-hidden">
  <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <span className="font-semibold">Data Explorer</span>
      {selectedAgency && (
        <span className="text-xs px-2 py-0.5 rounded bg-black/5">
          Filtered to agency: {selectedAgency}
        </span>
      )}
    </div>
    <button
      className="text-sm text-slate-600 hover:text-slate-900"
      onClick={() => setExplorerOpen(v => !v)}
    >
      {explorerOpen ? "Hide" : "Show"}
    </button>
  </div>

  {explorerOpen && (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <input
          value={explorerQuery}
          onChange={(e) => setExplorerQuery(e.target.value)}
          placeholder="Search agency / division / source…"
          className="w-full px-3 py-2 rounded border border-black/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]"
        />
        <div className="text-xs opacity-70 whitespace-nowrap">
          Rows: {explorerRows.length.toLocaleString()} • Total: {USD_FULL(explorerTotal)}
        </div>
      </div>

      <div className="border border-black/10 rounded">
        <div className="grid grid-cols-12 px-3 py-2 text-xs font-semibold bg-[#f6f5f2] border-b border-black/10">
          <div className="col-span-4">Agency</div>
          <div className="col-span-5">Division</div>
          <div className="col-span-2">Source</div>
          <div className="col-span-1 text-right">Amount</div>
        </div>
        <div className="max-h-[50vh] overflow-auto text-sm">
          {explorerRows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 px-3 py-2 border-b border-black/5">
              <div className="col-span-4 pr-2 truncate" title={r.agency}>{r.agency}</div>
              <div className="col-span-5 pr-2 truncate" title={r.division || "(Unspecified Division)"}>{r.division || "(Unspecified Division)"}</div>
              <div className="col-span-2 pr-2 truncate" title={r.source || "(Unspecified Source)"}>{r.source || "(Unspecified Source)"}</div>
              <div className="col-span-1 text-right tabular-nums">{currencyFormatter(toNumber(r.amount))}</div>
            </div>
          ))}
          {explorerRows.length === 0 && (
            <div className="px-3 py-6 text-sm opacity-70">No rows match.</div>
          )}
        </div>
      </div>
    </div>
  )}
</div>

      <DataFooter />
    </div>
  );
};

export default BudgetCalculator_v3;
