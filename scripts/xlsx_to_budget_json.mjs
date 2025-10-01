// scripts/xlsx_to_budget_json.mjs
// Usage:
//   node scripts/xlsx_to_budget_json.mjs <input.xlsx> <output.json> [--sheet "Sheet Name" | --sheetIndex 0]
//
// Reads row-wise line items from a budget workbook and outputs JSON rows:
//   { agency: string, division: string, source: string, amount: number }
//
// Changes vs previous version:
// - ❌ Removed dedupe: keeps ALL rows (avoids dropping legit items that share A/D/S)
// - ✅ Stronger amount parsing: handles $, commas, spaces, and ( ) negatives
// - ✅ Logs row count and total sum at the end for quick validation

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx/xlsx.mjs";
XLSX.set_fs(fs);

// ---------- CLI ----------
const args = process.argv.slice(2);
const inPath = args[0];
const outPath = args[1];

if (!inPath || !outPath) {
  console.error("Usage: node scripts/xlsx_to_budget_json.mjs <input.xlsx> <output.json> [--sheet \"Sheet Name\" | --sheetIndex 0]");
  process.exit(1);
}

let sheetNameArg = null;
let sheetIndexArg = null;

for (let i = 2; i < args.length; i++) {
  if (args[i] === "--sheet" && args[i + 1]) {
    sheetNameArg = args[i + 1];
    i++;
  } else if (args[i] === "--sheetIndex" && args[i + 1]) {
    const idx = Number(args[i + 1]);
    if (!Number.isInteger(idx) || idx < 0) {
      console.error("--sheetIndex must be a non-negative integer");
      process.exit(1);
    }
    sheetIndexArg = idx;
    i++;
  }
}

// ---------- Config ----------
const HEADER_ROW_1BASED = 3;          // headers on row 3
const DATA_START_ROW_1BASED = 4;      // data begins row 4
// Absolute column letters per your spec:
const COL = { AGENCY: "E", DIVISION: "G", SOURCE: "J", FUNDS: "Q" };

// ---------- Load workbook ----------
if (!fs.existsSync(inPath)) {
  console.error(`Input file not found: ${inPath}`);
  process.exit(1);
}
const wb = XLSX.readFile(inPath, { cellDates: false, cellNF: false, cellText: false });

let sheetName;
if (sheetNameArg) {
  sheetName = sheetNameArg;
  if (!wb.Sheets[sheetName]) {
    console.error(`Sheet named "${sheetName}" not found. Available: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }
} else if (sheetIndexArg != null) {
  sheetName = wb.SheetNames[sheetIndexArg];
  if (!sheetName) {
    console.error(`No sheet at index ${sheetIndexArg}. Available count: ${wb.SheetNames.length}`);
    process.exit(1);
  }
} else {
  sheetName = wb.SheetNames[0];
}

const ws = wb.Sheets[sheetName];
if (!ws || !ws["!ref"]) {
  console.error("Selected sheet is empty or missing !ref.");
  process.exit(1);
}

// ---------- Helpers ----------
const get = (addr) => {
  const cell = ws[addr];
  if (!cell) return "";
  const v = cell.v ?? cell.w ?? "";
  return typeof v === "string" ? v.trim() : v;
};

// Parse amounts like "$1,234,567", " 1 234 ", "(12,345)" -> number
const parseAmount = (raw) => {
  if (raw === null || raw === undefined || raw === "") return NaN;
  if (typeof raw === "number") return raw;
  let s = String(raw).trim();
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[\s,$]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
};

const range = XLSX.utils.decode_range(ws["!ref"]);

// ---------- Extract rows (NO DEDUPE) ----------
const out = [];
let total = 0;

for (let r1 = DATA_START_ROW_1BASED; r1 <= range.e.r + 1; r1++) {
  const agency = String(get(`${COL.AGENCY}${r1}`) ?? "").trim();
  const division = String(get(`${COL.DIVISION}${r1}`) ?? "").trim();
  const source = String(get(`${COL.SOURCE}${r1}`) ?? "").trim();
  const amtRaw = get(`${COL.FUNDS}${r1}`);

  // Skip completely blank rows
  const isAllBlank = !agency && !division && !source && (amtRaw === "" || amtRaw === null || amtRaw === undefined);
  if (isAllBlank) continue;

  // Skip obvious Total rows in key fields
  if (/^total$/i.test(agency) || /^total$/i.test(division) || /^total$/i.test(source)) continue;

  // Require minimal fields
  if (!agency || !division || !source) continue;

  const amount = parseAmount(amtRaw);
  if (!Number.isFinite(amount)) continue;

  out.push({ agency, division, source, amount });
  total += amount;
}

// ---------- Write + summary ----------
const outDir = path.dirname(outPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// write main data file
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

// --- NEW: write meta sidecar ---
const meta = {
  lastUpdated: new Date().toISOString().slice(0, 10), // "YYYY-MM-DD"
  rowCount: out.length,
  total: total,
};
// meta always goes next to your public assets
const metaPath = path.resolve("public/budget_meta.json");
const metaDir = path.dirname(metaPath);
if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
// --- END NEW ---

const fmtUSD = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

console.log(`[xlsx_to_budget_json] Sheet: ${sheetName}`);
console.log(`[xlsx_to_budget_json] Rows out: ${out.length}`);
console.log(`[xlsx_to_budget_json] Sum(amount): ${fmtUSD(total)}  (${total})`);
console.log(`[xlsx_to_budget_json] Wrote: ${outPath}`);
console.log(`[xlsx_to_budget_json] Meta: ${metaPath}`); // NEW log
