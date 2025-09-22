import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Upload, RotateCcw, Download, Save, FolderOpen, FileText, Info,
  TrendingUp, TrendingDown, DollarSign, BarChart3, AlertTriangle,
  CheckCircle, AlertCircle, PanelRightClose, PanelRightOpen, ArrowLeft,
  ChevronDown, ChevronRight, X as XIcon
} from 'lucide-react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';

// ---------- Currency helpers ----------
const USD_FULL = (dollars:number) =>
  dollars.toLocaleString('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 });

const USD_M = (millions:number) => {
  const dollars = millions * 1_000_000;
  const m = dollars / 1_000_000;
  // $M,MMM.M
  const formatted = m.toLocaleString('en-US', { minimumFractionDigits:1, maximumFractionDigits:1 });
  return `$${formatted}M`;
};

const pct = (n:number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

const parseCurrency = (s:string) => {
  if (!s) return 0;
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
};
const formatCurrencyWithCommas = (n:number) =>
  n.toLocaleString('en-US', { maximumFractionDigits:0 });

// ---------- Types ----------
type Row = { category: string; fund: string; amountM: number; type: 'revenue' | 'spending' };
type TreeNode = { name:string; size?:number; type?:'revenue'|'spending'; children?:TreeNode[] };

// ---------- Palettes ----------
const CATEGORY_COLORS = ['#F3EEE2','#E6F0E7','#FDEAD7','#EAF3FF','#EFEAF7','#FFF7CF','#FFDAD1','#E8F3D9'];
const FUND_COLORS     = ['#C1B7A8','#B2A59A','#ADBCC6','#C8D4DA','#B8BEE2','#A3D6CF','#BBDAB9','#F2E49D','#F6B5A3','#C9A7DB'];
const colorByName = (name:string, palette:string[]) => {
  let h = 0; for (let i=0; i<name.length; i++) h = (h*31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

// Sidebar “Before/After” colors
const SIDEBAR_BEFORE = '#111111';       // black
const SIDEBAR_AFTER  = '#1877F2';       // blue
// To switch to orange or dark green, change SIDEBAR_AFTER to '#FF6A00' or '#1B7A3C'.

const CATEGORY_INFO: Record<string,string> = {
  "General Funds": "Support the operating and administrative expenses of most state agencies.",
  "Highway Funds": "Transportation-related activities at the state and local levels.",
  "Special State Funds": "Restricted accounts for specific revenue and expenditure sources.",
  "Federal Trust Funds": "Grants/contracts between state agencies and the federal government.",
  "Debt Service Funds": "Interest and principal on debt obligations.",
  "State Trust Funds": "Funds held on behalf of other entities (e.g., pensions).",
  "Revolving Funds": "Inter-agency service operations on cost reimbursement basis.",
  "Bond Financed Funds": "Bond proceeds for infrastructure and development."
};

// ---------- Util ----------
const slug = (s:string) => s.toLowerCase().replace(/[^a-z0-9]+/gi,'-');

// ============================================

const BudgetCalculator = () => {
  // ----- Data load -----
  const BUDGET_URL = '/budget.json';
  const [budgetData, setBudgetData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(BUDGET_URL);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const payload = await r.json();
        setBudgetData(Array.isArray(payload) ? payload : (payload.rows || []));
      } catch (e:any) {
        console.error(e);
        setError('Failed to load budget.json');
      } finally { setLoading(false); }
    })();
  }, []);

  // ----- App state -----
  const [adjustments, setAdjustments] = useState<Record<string, number>>({}); // committed changes ($)
  const [draft, setDraft] = useState<Record<string, string>>({});             // text with commas
  const [savedScenarios, setSavedScenarios] = useState<Record<string, any>>({});
  const [notifications, setNotifications] = useState<{id:number;message:string;type:'info'|'success'|'error'}[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);

  // Treemap drilldown
  const [level, setLevel] = useState<'categories'|'funds'>('categories');
  const [selectedCategory, setSelectedCategory] = useState<string|null>(null);

  // Category accordions
  const [openCatsSpending, setOpenCatsSpending] = useState<Record<string, boolean>>({});
  const [openCatsRevenue,  setOpenCatsRevenue]  = useState<Record<string, boolean>>({});

  // ----- Notifications -----
  const notify = useCallback((message:string, type:'info'|'success'|'error'='info') => {
    const id = Date.now();
    setNotifications(p => [...p, { id, message, type }]);
    setTimeout(() => setNotifications(p => p.filter(n => n.id !== id)), 3500);
  }, []);
  const NotificationContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map(n => (
        <div key={n.id} className={`p-3 rounded-md shadow flex items-center gap-2 max-w-sm ${n.type==='success'?'bg-[#2e7d32] text-white':n.type==='error'?'bg-[#c62828] text-white':'bg-[#1565c0] text-white'}`}>
          {n.type==='success' && <CheckCircle className="w-4 h-4" />}
          {n.type==='error' && <AlertCircle className="w-4 h-4" />}
          {n.type==='info' && <Info className="w-4 h-4" />}
          <span className="text-sm">{n.message}</span>
        </div>
      ))}
    </div>
  );

  // ----- Indexes & grouping -----
  const spendingRows = useMemo(() => budgetData.filter(r => r.type==='spending'), [budgetData]);
  const revenueRows  = useMemo(() => budgetData.filter(r => r.type==='revenue'),  [budgetData]);

  const groupByCat = useCallback((rows:Row[]) => {
    const g: Record<string, Row[]> = {};
    rows.forEach(r => { (g[r.category] ||= []).push(r); });
    return g;
  }, []);
  const byCatSpending = useMemo(()=>groupByCat(spendingRows),[spendingRows, groupByCat]);
  const byCatRevenue  = useMemo(()=>groupByCat(revenueRows), [revenueRows,  groupByCat]);

  // ----- Calculations -----
  const adjustedFundAmountM = useCallback((fund: Row) => {
    const delta$ = adjustments[fund.fund] || 0;
    return Math.max(0, fund.amountM + (delta$ / 1_000_000));
  }, [adjustments]);

  const totals = useMemo(() => {
    const sumM = (rows:Row[], f:(r:Row)=>number) => rows.reduce((s, r) => s + f(r), 0);

    const orig = {
      revenue:  sumM(revenueRows,  r => r.amountM),
      spending: sumM(spendingRows, r => r.amountM),
    };
    (orig as any).deficit = orig.revenue - orig.spending;

    const adj = {
      revenue:  sumM(revenueRows,  r => adjustedFundAmountM(r)),
      spending: sumM(spendingRows, r => adjustedFundAmountM(r)),
    };
    (adj as any).deficit = adj.revenue - adj.spending;

    return { original: orig, adjusted: adj };
  }, [revenueRows, spendingRows, adjustedFundAmountM]);

  // ----- Treemap data (using spending) -----
  const treeDataCategories: TreeNode[] = useMemo(() => {
    const byCat: Record<string, number> = {};
    spendingRows.forEach(r => {
      byCat[r.category] = (byCat[r.category] || 0) + adjustedFundAmountM(r);
    });
    return Object.keys(byCat).map(cat => ({ name: cat, size: byCat[cat] }));
  }, [spendingRows, adjustedFundAmountM]);

  const treeDataFunds: TreeNode[] = useMemo(() => {
    if (!selectedCategory) return [];
    const funds = spendingRows.filter(r=>r.category===selectedCategory);
    return funds.map(f => ({ name: f.fund, size: adjustedFundAmountM(f), type: f.type }));
  }, [spendingRows, selectedCategory, adjustedFundAmountM]);

  const currentTreeData = level==='categories' ? treeDataCategories : treeDataFunds;

  // ----- Treemap tooltip & coloring (FIXED: color now derives from name) -----
  const TreemapTooltipComp = ({ active, payload }: any) => {
    if (!active || !payload || !payload[0]) return null;
    const p = payload[0].payload as TreeNode;
    const isLeaf = !p.children || p.children.length===0;
    return (
      <div className="bg-white border border-black/20 rounded-md px-3 py-2 text-sm text-black shadow">
        <div className="font-semibold">{p.name}</div>
        {isLeaf && <div>Adjusted: {USD_M((p.size||0))}</div>}
      </div>
    );
  };

  // ----- Actions -----
  const resetAdjustments = useCallback(() => {
    setAdjustments({});
    setDraft({});
    notify('All adjustments cleared', 'success');
  }, [notify]);

  const saveScenario = useCallback(() => {
    if (Object.keys(adjustments).length === 0) return notify('No adjustments to save', 'error');
    const name = prompt('Enter scenario name:'); if (!name) return;
    const description = prompt('Enter description (optional):') || '';
    setSavedScenarios(prev => ({ ...prev, [name]: { adjustments: { ...adjustments }, created: new Date().toISOString(), description } }));
    notify(`Scenario "${name}" saved`, 'success');
  }, [adjustments, notify]);

  const loadScenario = useCallback((name:string) => {
    const s = savedScenarios[name]; if (!s) return;
    setAdjustments(s.adjustments || {});
    setDraft(Object.fromEntries(Object.entries(s.adjustments || {}).map(([k,v]) => [k, formatCurrencyWithCommas(Math.round(Number(v)||0))])));
    notify(`Loaded scenario: ${name}`, 'success');
  }, [savedScenarios, notify]);

  const exportData = useCallback(() => {
    if (Object.keys(adjustments).length === 0) return notify('No adjustments to export', 'error');
    const scenarioName = prompt('Enter scenario name for export:', 'budget_scenario') || 'budget_scenario';
    const rows = budgetData.map(item => {
      const delta$ = adjustments[item.fund] || 0;
      const adjM = Math.max(0, item.amountM + delta$/1_000_000);
      return {
        'Fund Category': item.category,
        'Fund Name': item.fund,
        'Original Amount (M)': item.amountM,
        'Change ($)': delta$,
        'Adjusted Amount (M)': Math.round(adjM * 100) / 100,
        'Type': item.type,
      };
    });
    const headers = Object.keys(rows[0] || { dummy:'' });
    const csvEscape = (v:any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [ headers.map(csvEscape).join(','), ...rows.map(r => headers.map(h => csvEscape((r as any)[h])).join(',')) ].join('\n');

    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenarioName.replace(/[^a-z0-9]/gi,'_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Scenario exported', 'success');
  }, [budgetData, adjustments, notify]);

  // Draft input change (keeps commas while typing)
  const onDraftChange = (fund:string, value:string) => {
    const cleaned = value.replace(/[^\d,-]/g, ''); // allow digits, comma, minus
    setDraft(p => ({ ...p, [fund]: cleaned }));
  };

  // CALCULATE: commit all draft values to adjustments
  const applyCalculate = () => {
    const next: Record<string, number> = { ...adjustments };
    for (const [fund, text] of Object.entries(draft)) {
      const dollars = parseCurrency(text);
      if (isFinite(dollars)) next[fund] = dollars;
    }
    setAdjustments(next);
    notify('Adjustments applied', 'success');
  };

  // Remove a single adjustment (and its draft value)
  const removeAdjustment = (fund:string) => {
    setAdjustments(p => {
      const n = { ...p }; delete n[fund]; return n;
    });
    setDraft(p => {
      const n = { ...p }; delete n[fund]; return n;
    });
  };

  // ----- UI bits -----
  const OverviewCards = () => {
    const orig = totals.original;
    const adj  = totals.adjusted;
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {[
          { label: 'Revenue', key: 'revenue', icon: TrendingUp, before: orig.revenue, after: adj.revenue },
          { label: 'Spending', key: 'spending', icon: TrendingDown, before: orig.spending, after: adj.spending },
          { label: 'Surplus / Deficit', key: 'deficit', icon: AlertTriangle, before: (orig.revenue-orig.spending), after: (adj.revenue-adj.spending) },
        ].map(({ label, key, icon:Icon, before, after }) => {
          const before$ = before*1_000_000, after$ = after*1_000_000;
          const delta$  = after$ - before$;
          const changeColor = key==='deficit'
            ? (after$ < 0 ? 'text-[#c62828]' : 'text-[#2e7d32]')
            : (delta$ >= 0 ? 'text-[#2e7d32]' : 'text-[#c62828]');
          const hasChange = Math.abs(delta$) > 1;
          return (
            <div key={key} className="bg-[#f3f2ee] rounded-xl p-5 border border-black/10 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold">{label}</h3>
                <Icon className="w-5 h-5 opacity-70" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-black">{USD_FULL(after$)}</div>
                {hasChange && (
                  <div className={`flex items-center gap-1 text-sm ${changeColor}`}>
                    {delta$ > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span>{USD_FULL(Math.abs(delta$))}</span>
                    <span>({pct((delta$ / (before$ || 1)) * 100)})</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Treemap with smooth transition & proper colors
  const TreemapBlock = () => (
    <div className="bg-white rounded-xl p-6 shadow-sm mb-6 border border-black/10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {level === 'funds' && (
            <button
              onClick={() => { setLevel('categories'); setSelectedCategory(null); }}
              className="px-2 py-1 border border-black/20 rounded hover:bg-[#f6f5f2] flex items-center gap-1"
              aria-label="Back to categories"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <h3 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 opacity-70" />
            {level === 'categories' ? 'Budget Treemap — Categories' : `Budget Treemap — ${selectedCategory}`}
          </h3>
        </div>
        <div className="text-sm opacity-70">
          Spending total: {USD_M(totals.adjusted.spending)}
        </div>
      </div>

      <div className="h-[520px] relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={level === 'categories' ? 'cats' : `funds-${selectedCategory}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={currentTreeData}
                dataKey="size"
                stroke="#ffffff"
                // NOTE: the fill prop is irrelevant when using custom content; we set our own fills below.
                fill="#ffffff"
                aspectRatio={4/3}
                isAnimationActive={false}
                onClick={(node:any) => {
                  if (!node) return;
                  const name = node.name as string;
                  if (level === 'categories') {
                    setSelectedCategory(name);
                    setLevel('funds');
                  }
                }}
                content={(props:any) => {
                  const { x, y, width, height, name } = props; // props has no 'payload'; use name directly
                  if (width <= 0 || height <= 0) return null;
                  const fill = level === 'categories'
                    ? colorByName(name, CATEGORY_COLORS)
                    : colorByName(name, FUND_COLORS);
                  return (
                    <g>
                      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: '#fff', strokeWidth: 1 }} />
                      {width > 110 && height > 34 && (
                        <text x={x+8} y={y+20} fill="#000" fontSize={12} fontWeight={600}>
                          {name}
                        </text>
                      )}
                    </g>
                  );
                }}
              >
                <Tooltip content={<TreemapTooltipComp />} />
              </Treemap>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 text-xs opacity-70">
        {level === 'categories'
          ? <>Click a category to drill into its funds.</>
          : <>Click <span className="font-medium">Back</span> to return to categories.</>}
      </div>
    </div>
  );

  // Sidebar content (scrolls with the page; not fixed)
  const Sidebar: React.FC = () => {
    const revBefore = totals.original.revenue * 1_000_000;
    const revAfter  = totals.adjusted.revenue * 1_000_000;
    const spBefore  = totals.original.spending * 1_000_000;
    const spAfter   = totals.adjusted.spending * 1_000_000;
    const defBefore = revBefore - spBefore;
    const defAfter  = revAfter  - spAfter;

    const rows = [
      { key: 'Revenue',  before: revBefore, after: revAfter  },
      { key: 'Spending', before: spBefore,  after: spAfter   },
      { key: 'Deficit',  before: defBefore, after: defAfter  },
    ];
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.before)), ...rows.map(r => Math.abs(r.after)));
    const scale = (v:number) => (maxAbs ? Math.max(2, (Math.abs(v) / maxAbs) * 220) : 2);

    // $M,MMM.M formatter for labels here (just like USD_M but takes dollars)
    const fmtM = (dollars:number) => {
      const m = dollars / 1_000_000;
      return `$${m.toLocaleString('en-US', { minimumFractionDigits:1, maximumFractionDigits:1 })}M`;
    };

    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
          <h3 className="font-semibold">Adjustments</h3>
          <button onClick={() => setShowSidebar(false)} className="p-2 rounded hover:bg-[#f6f5f2]" aria-label="Close sidebar">
            <PanelRightClose className="w-5 h-5" />
          </button>
        </div>

        {/* Horizontal bars */}
        <div className="p-4 border-b border-black/10">
          <div className="space-y-5">
            {rows.map(r => (
              <div key={r.key}>
                <div className="text-base font-semibold mb-1">{r.key}</div>

                <div className="text-sm mb-1">
                  <span className="opacity-70 mr-2">Before</span>
                  <span className="font-semibold">{fmtM(r.before)}</span>
                </div>
                <div className="h-4 bg-[#eef1f3] rounded">
                  <div className="h-4 rounded" style={{ width: `${scale(r.before)}px`, background: SIDEBAR_BEFORE }} />
                </div>

                <div className="text-sm mt-2 mb-1">
                  <span className="opacity-70 mr-2">After</span>
                  <span className="font-semibold" style={{ color: SIDEBAR_AFTER }}>{fmtM(r.after)}</span>
                </div>
                <div className="h-4 bg-[#eef1f3] rounded">
                  <div className="h-4 rounded" style={{ width: `${scale(r.after)}px`, background: SIDEBAR_AFTER }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Current adjustments list with remove (X) */}
        <div className="flex-1 overflow-auto p-4">
          {Object.keys(adjustments).length === 0 ? (
            <div className="text-sm opacity-70">No adjustments yet.</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(adjustments).map(([fund, delta$]) => {
                const fundData = budgetData.find(i => i.fund === fund);
                const adjM = fundData ? Math.max(0, fundData.amountM + (delta$ as number)/1_000_000) : 0;
                return (
                  <div key={fund} className="flex items-center justify-between p-3 bg-[#f3f2ee] rounded border border-black/10">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" title={fund}>{fund}</div>
                      <div className="text-xs opacity-70">{(delta$ as number) >= 0 ? '+' : '−'}{USD_FULL(Math.abs(delta$ as number))}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">→ {USD_M(adjM)}</div>
                      <button
                        aria-label={`Remove ${fund}`}
                        className="p-1 rounded hover:bg-black/5"
                        onClick={() => removeAdjustment(fund)}
                        title="Remove this adjustment"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Shared category accordion (used in both columns)
  const CategoryAccordion: React.FC<{
    rows: Row[];
    openMap: Record<string, boolean>;
    setOpenMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    column: 'sp' | 'rev';
  }> = ({ rows, openMap, setOpenMap, column }) => {
    const byCat = useMemo(() => {
      const g: Record<string, Row[]> = {};
      rows.forEach(r => { (g[r.category] ||= []).push(r); });
      return g;
    }, [rows]);

    return (
      <div className="space-y-4">
        {Object.keys(byCat).map(cat => {
          const funds = byCat[cat];
          const open = openMap[cat] ?? true;
          return (
            <div key={`${column}-${cat}`} className="bg-white rounded-xl shadow-sm overflow-hidden border border-black/10">
              <button
                onClick={() => setOpenMap(p => ({ ...p, [cat]: !open }))}
                className="w-full flex items-center justify-between bg-[#f3f2ee] px-4 py-3 border-b border-black/10"
              >
                <div className="flex items-center gap-2">
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="text-lg font-semibold">{cat}</span>
                </div>
                <Info title={CATEGORY_INFO[cat] || ''} className="w-4 h-4 opacity-70" />
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                  >
                    <div className="p-4 space-y-4">
                      {funds.map(fund => {
                        const key = fund.fund;
                        const inputId = `adj-${slug(fund.fund)}-${column}`;
                        const deltaText = draft[key] ?? (adjustments[key] ? formatCurrencyWithCommas(Math.round(adjustments[key])) : '');
                        const adjM = Math.max(0, fund.amountM + (parseCurrency(deltaText) / 1_000_000));
                        return (
                          <div key={`${column}-${key}`} className="space-y-2">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate" title={fund.fund}>{fund.fund}</div>
                                <div className="text-sm opacity-70">
                                  Original: {USD_M(fund.amountM)}{' '}
                                  {deltaText && parseCurrency(deltaText) !== 0 && (
                                    <span className={`${parseCurrency(deltaText)>0?'text-[#2e7d32]':'text-[#c62828]'} ml-2`}>
                                      → {USD_M(adjM)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 w-[280px]">
                                <label htmlFor={inputId} className="text-xs opacity-70 whitespace-nowrap">Change ($)</label>
                                <input
                                  id={inputId}
                                  type="text"
                                  inputMode="numeric"
                                  className="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2e7d32]"
                                  placeholder="0"
                                  value={deltaText}
                                  onChange={(e) => onDraftChange(key, e.target.value)}
                                  onBlur={(e) => {
                                    const v = parseCurrency(e.target.value);
                                    const pretty = v ? formatCurrencyWithCommas(Math.round(v)) : '';
                                    setDraft(p => ({ ...p, [key]: pretty }));
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  };

  // ----- Early returns -----
  if (loading) return <div className="min-h-screen flex items-center justify-center opacity-70">Loading budget…</div>;
  if (error)   return <div className="min-h-screen flex items-center justify-center text-[#c62828]">{error}</div>;

  const hasRevenue = revenueRows.length > 0;

  return (
    <div className="min-h-screen w-full bg-[#f6f5f2] text-black">
      <NotificationContainer />

      {/* Top bar */}
      <div className="bg-[#eae6dd] border-b border-black/10 sticky top-0 z-30">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-7 h-7 opacity-70" />
              <h1 className="text-2xl font-bold">Illinois Budget Calculator</h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Sidebar toggle */}
              <button
                onClick={() => setShowSidebar(s=>!s)}
                className="px-3 py-2 border border-black/20 rounded bg-white hover:bg-[#f3f2ee] flex items-center gap-2"
              >
                {showSidebar ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                Sidebar
              </button>

              {/* Calculate applies all draft changes */}
              <button onClick={applyCalculate} className="px-3 py-2 rounded bg-[#2e7d32] text-white hover:opacity-90">
                Calculate
              </button>

              {/* Actions */}
              <div className="w-px h-6 bg-black/20 mx-1" />
              <button onClick={resetAdjustments} className="px-3 py-2 rounded bg-[#40574a] text-white hover:opacity-90 flex items-center gap-2"><RotateCcw className="w-4 h-4" />Reset</button>
              <button onClick={saveScenario} className="px-3 py-2 rounded bg-[#1565c0] text-white hover:opacity-90 flex items-center gap-2"><Save className="w-4 h-4" />Save</button>
              <button
                onClick={() => {
                  const names = Object.keys(savedScenarios);
                  if (names.length===0) return notify('No saved scenarios yet', 'info');
                  const name = prompt(`Load which scenario?\n\n${names.join('\n')}`);
                  if (name && names.includes(name)) loadScenario(name);
                }}
                className="px-3 py-2 rounded bg-black text-white hover:opacity-90 flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />Load ({Object.keys(savedScenarios).length})
              </button>
              <button onClick={exportData} className="px-3 py-2 rounded bg-[#7a9364] text-white hover:opacity-90 flex items-center gap-2"><Download className="w-4 h-4" />Export</button>
              <button onClick={() => alert('Uploads disabled in JSON mode.')} className="hidden sm:flex items-center gap-2 px-3 py-2 border border-black/20 rounded bg-white hover:bg-[#f3f2ee]">
                <Upload className="w-4 h-4" />Upload
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pushing layout: LEFT sidebar that scrolls with content (not fixed) */}
      <div className="w-full">
        <div className="flex w-full">
          <aside
            className={`transition-all duration-300 ease-in-out bg-white border-r border-black/10 ${
              showSidebar ? 'w-[360px]' : 'w-0'
            } overflow-hidden`}
            aria-label="Adjustments sidebar"
          >
            <Sidebar />
          </aside>

          <main className={`flex-1 transition-all duration-300 ${showSidebar ? 'pl-6' : 'pl-0'}`}>
            <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
              <OverviewCards />
              <TreemapBlock />

              {/* Two columns: Spending (left) / Revenue (right) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section>
                  <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" /> Adjust Spending
                  </h2>
                  <CategoryAccordion
                    rows={spendingRows}
                    openMap={openCatsSpending}
                    setOpenMap={setOpenCatsSpending}
                    column="sp"
                  />
                </section>

                <section>
                  <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Adjust Revenue
                  </h2>
                  {hasRevenue ? (
                    <CategoryAccordion
                      rows={revenueRows}
                      openMap={openCatsRevenue}
                      setOpenMap={setOpenCatsRevenue}
                      column="rev"
                    />
                  ) : (
                    <div className="bg-white border border-black/10 rounded-xl p-6 text-sm opacity-70">
                      No revenue funds in this dataset. (This column will populate when revenue data is included.)
                    </div>
                  )}
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default BudgetCalculator;
