// FILE: apps/worker/src/lib/parser.ts
// This file provides pure parsing functions for converting raw CSV/XLSX ArrayBuffers
// into typed row arrays for ROU and dead-stock data. All FRED-specific quirks
// (BOM, CRLF, blank title rows, column aliasing) are handled here.
// No DB or HTTP dependencies — designed for isolated unit testing.

import * as XLSX from "xlsx";

// --- Type definitions ---

export interface RouRow {
  sku: string;
  description: string;
  rou: number; // NaN if non-numeric, NOT 0
  soh: number; // NaN if non-numeric, NOT 0
  isRanged: boolean; // parsed from "Ranged" column via RANGED_TRUTHY; false if column absent
}

export interface DeadStockRow {
  sku: string;
  description: string;
  soh: number; // NaN if non-numeric
  isRanged: boolean;
  costEx: number; // NaN when Cost Ex column absent OR cell non-numeric
}

// --- HEADER_ALIASES — ported from stock_transfer_project/api/views.py ---

export const HEADER_ALIASES: Record<string, string[]> = {
  "Item Code": ["Item Code", "SKU", "ItemCode", "Code", "Product Code"],
  "Item Description": [
    "Item Description",
    "Description",
    "Desc",
    "Product Name",
  ],
  ROU: ["ROU Value", "ROU", "Usage Rate", "Sales Rate", "Rate of Usage"],
  SOH: ["SOH", "Stock on Hand", "Quantity", "Qty", "Quantity on Hand"],
  Ranged: ["Ranged", "Is Ranged", "Ranged Item", "Range Flag"],
  "Cost Ex": ["Cost Ex", "Cost", "Unit Cost", "Price", "Cost Excl"],
};

// Truthy values for isRanged field (case-insensitive)
const RANGED_TRUTHY = new Set(["checked", "yes", "true", "1", "y"]);

// --- parseCSV ---

/**
 * Decodes an ArrayBuffer as UTF-8 text, strips BOM if present,
 * normalises line endings, filters blank lines, and splits into
 * a string[][] respecting quoted fields.
 */
export function parseCSV(buffer: ArrayBuffer): string[][] {
  let text = new TextDecoder("utf-8").decode(buffer);

  // Strip UTF-8 BOM (U+FEFF) — FRED exports sometimes include it
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // Normalise line endings: CRLF and bare CR → LF
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines = text.split("\n");
  const result: string[][] = [];

  for (const line of lines) {
    if (line.trim() === "") continue; // skip blank/empty lines
    result.push(parseCsvLine(line));
  }

  return result;
}

/**
 * Parses a single CSV line respecting double-quoted fields
 * (commas inside quotes are not treated as delimiters).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    if (i === line.length) {
      // End of line — push empty final field if line ends with comma
      break;
    }

    if (line[i] === '"') {
      // Quoted field: read until closing quote, handling escaped quotes ("")
      let field = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          // Escaped double-quote
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i];
          i++;
        }
      }
      fields.push(field);
      // skip comma after field
      if (i < line.length && line[i] === ",") i++;
    } else {
      // Unquoted field: read until comma or end of line
      const start = i;
      while (i < line.length && line[i] !== ",") {
        i++;
      }
      fields.push(line.slice(start, i));
      if (i < line.length && line[i] === ",") i++;
    }
  }

  // Handle trailing comma — adds empty final field
  if (line.endsWith(",")) {
    fields.push("");
  }

  return fields;
}

// --- parseXLSX ---

/**
 * Reads the first sheet of an XLSX ArrayBuffer and returns string[][]
 * with all cell values coerced to strings. Equivalent in structure to parseCSV output.
 */
export function parseXLSX(buffer: ArrayBuffer): string[][] {
  const wb = XLSX.read(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    ws,
    { header: 1, defval: "" },
  );
  // Coerce all cell values to strings
  return raw.map((row) => row.map((cell) => String(cell ?? "")));
}

// --- findHeaderRow ---

/**
 * Scans rows to find the first row that satisfies all required canonical column names.
 * For each required name, checks whether any alias from HEADER_ALIASES appears
 * in that row (trimmed, case-sensitive match).
 * Returns the row index, or -1 if no matching row is found.
 */
export function findHeaderRow(rows: string[][], required: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map((cell) => cell.trim());
    const satisfies = required.every((canonicalName) => {
      const aliases = HEADER_ALIASES[canonicalName] ?? [canonicalName];
      return aliases.some((alias) => row.includes(alias));
    });
    if (satisfies) return i;
  }
  return -1;
}

// --- buildColumnMap ---

/**
 * Maps each cell in a header row to its canonical column name via HEADER_ALIASES.
 * Returns a Record<canonicalName, columnIndex> for all recognised headers.
 * Unrecognised columns are silently dropped (per D-15).
 */
export function buildColumnMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};

  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i].trim();
    for (const [canonicalName, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(cell)) {
        map[canonicalName] = i;
        break;
      }
    }
  }

  return map;
}

// --- parseRouFile ---

/**
 * Parses a ROU file buffer (CSV or XLSX) into RouRow[].
 * Required columns: Item Code, ROU, SOH (via HEADER_ALIASES).
 * Rows with empty Item Code are skipped.
 * Non-numeric rou/soh produce NaN (not 0).
 * Throws Error if required headers are not found.
 */
export function parseRouFile(
  buffer: ArrayBuffer,
  filename: string,
): RouRow[] {
  const rows = filename.toLowerCase().endsWith(".xlsx")
    ? parseXLSX(buffer)
    : parseCSV(buffer);

  const required = ["Item Code", "ROU", "SOH"];
  const headerIdx = findHeaderRow(rows, required);

  if (headerIdx === -1) {
    throw new Error(
      `Required headers not found: ${required.join(", ")}. ` +
        `Check the file has Item Code, ROU (or alias), and SOH (or alias) columns.`,
    );
  }

  const colMap = buildColumnMap(rows[headerIdx]);
  const result: RouRow[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const skuCell = row[colMap["Item Code"]] ?? "";
    const sku = skuCell.trim();

    // Skip rows where Item Code is empty/whitespace
    if (sku === "") continue;

    const descCol = colMap["Item Description"];
    const description =
      descCol !== undefined ? (row[descCol]?.trim() ?? "") : "";

    const rouCell = row[colMap["ROU"]] ?? "";
    const sohCell = row[colMap["SOH"]] ?? "";

    // Use parseFloat — produces NaN for non-numeric values (NOT 0)
    const rou = parseFloat(rouCell);
    const soh = parseFloat(sohCell);

    // isRanged: false if Ranged column absent, otherwise check truthy set (per MATCH-06)
    const rangedCol = colMap["Ranged"];
    const isRanged =
      rangedCol !== undefined
        ? RANGED_TRUTHY.has((row[rangedCol]?.trim() ?? "").toLowerCase())
        : false;

    result.push({ sku, description, rou, soh, isRanged });
  }

  return result;
}

// --- parseDeadStockFile ---

/**
 * Parses a dead-stock file buffer (CSV or XLSX) into DeadStockRow[].
 * Required columns: Item Code, SOH (via HEADER_ALIASES).
 * Ranged column is optional — defaults to false if absent.
 * isRanged parses "checked", "yes", "true", "1", "y" (case-insensitive) as true.
 * Unrecognised columns are silently dropped (per D-15).
 * Throws Error if required headers are not found.
 */
export function parseDeadStockFile(
  buffer: ArrayBuffer,
  filename: string,
): DeadStockRow[] {
  const rows = filename.toLowerCase().endsWith(".xlsx")
    ? parseXLSX(buffer)
    : parseCSV(buffer);

  const required = ["Item Code", "SOH"];
  const headerIdx = findHeaderRow(rows, required);

  if (headerIdx === -1) {
    throw new Error(
      `Required headers not found: ${required.join(", ")}. ` +
        `Check the file has Item Code and SOH (or alias) columns.`,
    );
  }

  const colMap = buildColumnMap(rows[headerIdx]);

  // D-04: detect Cost Ex column at header level — SheetJS defval:"" means
  // both an absent column AND a blank cell return ""; only colMap absence is reliable.
  const hasCostColumn = colMap["Cost Ex"] !== undefined;

  const result: DeadStockRow[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const skuCell = row[colMap["Item Code"]] ?? "";
    const sku = skuCell.trim();

    // Skip rows where Item Code is empty/whitespace
    if (sku === "") continue;

    const descCol = colMap["Item Description"];
    const description =
      descCol !== undefined ? (row[descCol]?.trim() ?? "") : "";

    const sohCell = row[colMap["SOH"]] ?? "";
    const soh = parseFloat(sohCell);

    // isRanged: false if Ranged column absent, otherwise check truthy set
    const rangedCol = colMap["Ranged"];
    const isRanged =
      rangedCol !== undefined
        ? RANGED_TRUTHY.has((row[rangedCol]?.trim() ?? "").toLowerCase())
        : false;

    // Cost Ex extraction — NaN when column absent OR cell non-numeric.
    // Zero is preserved per D-08 (legitimate samples/donations in FRED).
    // Negative values are preserved here; upload route emits DataQualityWarning later (D-09).
    const costEx = hasCostColumn
      ? parseFloat(row[colMap["Cost Ex"]] ?? "")
      : NaN;

    result.push({ sku, description, soh, isRanged, costEx });
  }

  return result;
}
