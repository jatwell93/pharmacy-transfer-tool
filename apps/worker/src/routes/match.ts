// FILE: apps/worker/src/routes/match.ts
// This file defines the POST /match API route for the PharmIQ Stock Transfer Worker.
// POST /match — accepts JSON body { monthsCoverTarget: number }, fetches all dead-stock
//               and ROU data for the org from NEON, runs matchTransfers() once per
//               dead-stock store, merges results and deduplicates warnings, and returns
//               a single combined JSON response: { results, warnings }.

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { withOrgContext } from '../db/client';
import { matchTransfers } from '../matcher';
import type { DeadStockItem, RouItem, MatchResult, DataQualityWarning } from '../matcher';

const matchRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// --- POST /match ---

matchRoute.post('/match', async (c) => {
  try {
    // Parse and validate request body
    const body = await c.req.json<{ monthsCoverTarget?: unknown; storeFilter?: unknown }>();
    const monthsCoverTarget = body.monthsCoverTarget;

    if (
      monthsCoverTarget === undefined ||
      monthsCoverTarget === null ||
      typeof monthsCoverTarget !== 'number' ||
      monthsCoverTarget < 1 ||
      monthsCoverTarget > 24
    ) {
      return c.json(
        { error: 'monthsCoverTarget is required and must be a number between 1 and 24' },
        400,
      );
    }

    // Optional store filter — if provided and non-empty, restrict both source and destination
    const storeFilter: string[] | null =
      Array.isArray(body.storeFilter) && body.storeFilter.length > 0
        ? (body.storeFilter as string[])
        : null;

    const orgId = c.get('orgId');
    const dbUrl = c.env.DATABASE_URL;

    // Fetch dead-stock data — separate query (per D-03, no JOIN)
    const deadStockRows = await withOrgContext<
      Array<{
        sku: string;
        description: string;
        soh: number;
        store_name: string;
      }>
    >(
      dbUrl,
      orgId,
      (tx) => tx`
        SELECT ds.sku, ds.description, ds.soh, s.name AS store_name
        FROM dead_stock ds
        JOIN stores s ON s.id = ds.store_id
        WHERE ds.org_id = ${orgId}
      `,
    );

    // Fetch ROU data — CRITICAL: do NOT select is_ranged from rou_data (column does not exist)
    const rouRows = await withOrgContext<
      Array<{
        sku: string;
        description: string;
        rou: number;
        soh: number;
        store_name: string;
      }>
    >(
      dbUrl,
      orgId,
      (tx) => tx`
        SELECT rd.sku, rd.description, rd.rou, rd.soh,
               s.name AS store_name
        FROM rou_data rd
        JOIN stores s ON s.id = rd.store_id
        WHERE rd.org_id = ${orgId}
      `,
    );

    // Convert rouRows to RouItem[] — apply store filter, set isRanged: false
    const rouData: RouItem[] = rouRows
      .filter((r) => !storeFilter || storeFilter.includes(r.store_name))
      .map((r) => ({
        sku: r.sku,
        store: r.store_name,
        rou: r.rou,
        isRanged: false, // rou_data table has no is_ranged column; default false
        soh: r.soh,
      }));

    // Group dead-stock rows by store name — apply store filter
    const storeDeadStock = new Map<string, DeadStockItem[]>();
    for (const row of deadStockRows.filter((r) => !storeFilter || storeFilter.includes(r.store_name))) {
      const items = storeDeadStock.get(row.store_name) || [];
      // cost is 0 — dead_stock table has no cost column (display-only per ALGORITHM-SPEC Section 5)
      items.push({ sku: row.sku, soh: row.soh, description: row.description, cost: 0 });
      storeDeadStock.set(row.store_name, items);
    }

    // Loop matchTransfers per dead-stock store, merge results and deduplicate warnings
    const allResults: MatchResult[] = [];
    const allWarnings: DataQualityWarning[] = [];
    const seenWarnings = new Set<string>();

    for (const [storeName, items] of storeDeadStock) {
      const { results, warnings } = matchTransfers(items, rouData, {
        originStore: storeName,
        monthsCoverTarget,
      });
      allResults.push(...results);
      for (const w of warnings) {
        const key = `${w.sku}::${w.field}`;
        if (!seenWarnings.has(key)) {
          seenWarnings.add(key);
          allWarnings.push(w);
        }
      }
    }

    return c.json({ results: allResults, warnings: allWarnings });
  } catch (err) {
    console.error('[match] handler error:', err);
    return c.json({ error: 'Match run failed — please try again.' }, 500);
  }
});

export default matchRoute;
