// scripts/xlsx_to_budget_json.mjs
// Usage:
//   node scripts/xlsx_to_budget_json.mjs <input.xlsx> <output.json> [--sheet "Sheet Name" | --sheetIndex 0]
//
// Notes:
// - Headers are on row 3; data starts row 4
// - Column mapping (absolute letters):
//     E = Agency, G = Division, J = Source, Q = Funds (amount)
// - Skips blank rows and any row where Agency/Division/Source equals "Total"
// - Dedupes by Agency|Division|Source
// - Coerces amount to Number (strips commas/spaces)

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
const HEADER_ROW_1BASED = 3;
const DATA_START_ROW_1BASED = HEADER_ROW_1BASED + 1;
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
    console.error(`Sheet named "${sheetName}" not found in workbook.`);
    console.error("Available sheets:", wb.SheetNames.join(", "));
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

const range = XLSX.utils.decode_range(ws["!ref"]);

// ---------- Extract rows ----------
const out = [];
const seen = new Set();

for (let r1 = DATA_START_ROW_1BASED; r1 <= range.e.r + 1; r1++) {
  const agency = String(get(`${COL.AGENCY}${r1}`) ?? "").trim();
  const division = String(get(`${COL.DIVISION}${r1}`) ?? "").trim();
  const source = String(get(`${COL.SOURCE}${r1}`) ?? "").trim();
  let amountRaw = get(`${COL.FUNDS}${r1}`);

  // Skip blank rows
  const amountBlank = amountRaw === "" || amountRaw === null || amountRaw === undefined;
  const rowBlank = !agency && !division && !source && amountBlank;
  if (rowBlank) continue;

  // Skip "Total" lines in any key field
  if (/^total$/i.test(agency) || /^total$/i.test(division) || /^total$/i.test(source)) continue;

  // Minimal fields required
  if (!agency || !division || !source) continue;

  // Coerce amount
  if (typeof amountRaw === "string") {
    amountRaw = amountRaw.replace(/[, ]/g, "");
  }
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) continue;

  // Dedup key
  const key = `${agency}|${division}|${source}`;
  if (seen.has(key)) continue;
  seen.add(key);

  out.push({ agency, division, source, amount });
}

// ---------- Write ----------
const outDir = path.dirname(outPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`[xlsx_to_budget_json] Sheet: ${sheetName}`);
console.log(`[xlsx_to_budget_json] Rows out: ${out.length}`);
console.log(`[xlsx_to_budget_json] Wrote: ${outPath}`);
