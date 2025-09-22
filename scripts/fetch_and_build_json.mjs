// node scripts/fetch_and_build_json.mjs "https://budget.illinois.gov/content/dam/soi/en/web/budget/documents/budget-book/fy2026-budget/Fiscal-Year-2026-Operating-Budget-Line-Item-Detail.xlsx" public budget
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx/xlsx.mjs";
XLSX.set_fs(fs);

const excelUrl = process.argv[2] || process.env.EXCEL_URL;
const outDir   = process.argv[3] || "public";
const prefix   = process.argv[4] || "budget";

if (!excelUrl) {
  console.error("❌ Missing Excel URL. Pass as arg #1 or set EXCEL_URL.");
  process.exit(1);
}

const norm = (s) => String(s ?? "").trim();
const toNumber = (v) => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const isTotalDivision = (division) => {
  const d = norm(division).toLowerCase();
  return d === "" || /(^|\s)total(s)?(\s|$)/i.test(d);
};

console.log(`⬇️  Fetching Excel from: ${excelUrl}`);
const res = await fetch(excelUrl);
if (!res.ok) {
  console.error(`❌ HTTP ${res.status} downloading Excel`);
  process.exit(1);
}
const ab = await res.arrayBuffer();
const wb = XLSX.read(ab, { type: "array" });
const ws = wb.Sheets[wb.SheetNames[0]];

const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
const HEADER_ROW = 2; // Excel row 3
const headers = grid[HEADER_ROW]?.map((h) => String(h ?? ""));
const findCol = (names, fallbackIdx) => {
  if (headers && headers.length) {
    const lower = headers.map((h) => h.toLowerCase().replace(/\s+/g, " "));
    for (const n of names) {
      const i = lower.indexOf(n);
      if (i !== -1) return i;
    }
  }
  return fallbackIdx;
};

// E, G, J, Q
const COL_E_AGENCY = findCol(["agency"], 4);
const COL_G_DIV    = findCol(["division"], 6);
const COL_J_SRC    = findCol(["funding source", "fund source", "source"], 9);
const COL_Q_AMT    = findCol(["funds", "allocation", "amount", "dollars"], 16);

const recs = [];
for (let r = HEADER_ROW + 1; r < grid.length; r++) {
  const row = grid[r] || [];
  const agency   = norm(row[COL_E_AGENCY]);
  const division = norm(row[COL_G_DIV]);
  const source   = norm(row[COL_J_SRC] ?? "");
  const amount   = toNumber(row[COL_Q_AMT]);

  if (!agency) continue;
  if (isTotalDivision(division)) continue;
  if (amount === 0) continue;

  recs.push({
    agency,
    division: division || "(Unspecified Division)",
    source: source || "(Unspecified Source)",
    amount: Math.round(amount * 100) / 100,
  });
}

const agg = new Map();
for (const r of recs) {
  const key = `${r.agency}|||${r.division}|||${r.source}`;
  agg.set(key, (agg.get(key) ?? 0) + r.amount);
}
const data = [...agg.entries()].map(([k, amt]) => {
  const [agency, division, source] = k.split("|||");
  return { agency, division, source, amount: Math.round(amt * 100) / 100 };
}).sort((a, b) =>
  a.agency.localeCompare(b.agency) ||
  a.division.localeCompare(b.division) ||
  a.source.localeCompare(b.source)
);

fs.mkdirSync(outDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const latestPath = path.join(outDir, `${prefix}_latest.json`);
const datedPath  = path.join(outDir, `${prefix}_${today}.json`);
fs.writeFileSync(latestPath, JSON.stringify(data, null, 2));
fs.writeFileSync(datedPath,  JSON.stringify(data, null, 2));
console.log(`✅ Wrote ${data.length} rows\n   • ${latestPath}\n   • ${datedPath}`);
