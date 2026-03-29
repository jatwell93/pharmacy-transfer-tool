// FILE: apps/worker/src/matcher.ts
// This file defines the TypeScript types and pure matching function for the
// dead-stock transfer algorithm. See ALGORITHM-SPEC.md for the authoritative
// algorithm reference including worked examples and Django behavior comparisons.

// --- Type Definitions ---

export interface DeadStockItem {
  sku: string;
  soh: number;
  description: string;
  cost: number;
}

export interface RouItem {
  sku: string;
  store: string;
  rou: number;
  isRanged: boolean;
  soh?: number; // optional, defaults to 0 when absent — needed for months-cover cap (D-07)
}

export interface MatchOptions {
  originStore: string;
  monthsCoverTarget: number;
}

export interface DestinationMatch {
  store: string;
  rou: number;
  isRanged: boolean;
  sellThrough: number;   // originSOH / destROU in months
  monthsCover: number;   // the monthsCoverTarget value used
  qtyToTransfer: number; // capped transfer quantity
  destSoh: number;       // destination store's existing SOH used in cap calc
}

export interface MatchResult {
  sku: string;
  description: string;
  soh: number;              // origin store's dead stock SOH
  cost: number;             // origin store's item cost
  sourceStore: string;      // origin store name
  bestMatch: DestinationMatch;
  allMatches: DestinationMatch[];
}

export interface DataQualityWarning {
  sku: string;
  field: "rou" | "soh" | "cost";
  reason: string;
}

export interface MatchTransfersResult {
  results: MatchResult[];
  warnings: DataQualityWarning[];
}

// --- Internal Constants ---

// Sell-through limit: hardcoded per CONTEXT.md specifics — v2 will make configurable.
// A destination store must have ROU >= originSOH / 12 to be a valid transfer target.
const SELL_THROUGH_LIMIT_MONTHS = 12;

// All string values that mean "is ranged = true" (D-10, MATCH-06).
// Fixes Django bug: Django only accepts "checked"; FRED exports may use any of these variants.
const RANGED_TRUTHY_VALUES = new Set(["checked", "yes", "true", "1", "y"]);

// --- Exported Utilities ---

/**
 * Parses a raw FRED export "Ranged" column value into a boolean.
 *
 * Accepts (case-insensitive, after trim): "checked", "yes", "true", "1", "y"
 * All other values return false.
 *
 * Called at upload/parse time (Phase 3), not inside matchTransfers.
 * matchTransfers receives isRanged: boolean on RouItem directly.
 *
 * Fixes Django bug: `str(row['Ranged']).strip().lower() == 'checked'`
 * which only accepts "checked" and silently treats "yes", "true", "1", "y" as false.
 */
export function parseIsRanged(raw: unknown): boolean {
  return RANGED_TRUTHY_VALUES.has(String(raw).trim().toLowerCase());
}

// --- Core Matching Function ---

/**
 * Finds dead-stock transfer matches across stores.
 *
 * Pure computation — no I/O, no external dependencies.
 * Accepts already-parsed in-memory arrays.
 *
 * See ALGORITHM-SPEC.md for full specification including worked examples,
 * Django behavior comparisons, and bug documentation.
 *
 * Algorithm stages:
 * 1. Filter deadStock (skip null/NaN soh, skip soh <= 0; emit warnings)
 * 2. Filter rouData (skip originStore, skip rou <= 0; emit warnings for NaN rou)
 * 3. Index rouData by SKU for O(1) lookup
 * 4. For each dead-stock item, find destination stores with matching SKU
 * 5. Apply sell-through filter: destROU >= originSOH / 12
 * 6. Apply months-cover cap: exclude stores where maxTransferQty === 0
 * 7. Compute sellThrough = originSOH / destROU
 * 8. Sort: ranged-first, then ROU-descending
 * 9. Return { results, warnings }
 */
export function matchTransfers(
  deadStock: DeadStockItem[],
  rouData: RouItem[],
  opts: MatchOptions,
): MatchTransfersResult {
  throw new Error("Not implemented — see ALGORITHM-SPEC.md");
}
