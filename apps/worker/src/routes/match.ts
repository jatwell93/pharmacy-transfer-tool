// FILE: apps/worker/src/routes/match.ts
// This file defines the POST /match API route for the PharmIQ Stock Transfer Worker.
// POST /match — accepts JSON body { monthsCoverTarget: number }, fetches all dead-stock
//               and ROU data for the org from NEON, runs matchTransfers() once per
//               dead-stock store, merges results and deduplicates warnings, and returns
//               a single combined JSON response: { results, warnings }.

import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
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

    // --- Usage metering (D-01, D-05) ---
    // Step 1: Check org plan from subscriptions table using direct neon sql.transaction()
    // (withOrgContext not used here — multi-statement upsert+increment needs direct transaction control)
    const sql = neon(dbUrl);
    const claims = JSON.stringify({ org_id: orgId });

    const planResults = await sql.transaction((tx) => [
      tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
      tx`SELECT status FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`,
    ]);
    const planStatus = (planResults[1] as Array<{ status: string }>)[0]?.status ?? 'free';

    // Step 2: For free-tier orgs, enforce usage limit atomically (T-5-01, T-5-03)
    if (planStatus !== 'paid') {
      const freeLimit = 1;
      const yearMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-04"
      const usageResults = await sql.transaction((tx) => [
        tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
        tx`INSERT INTO usage_meters (org_id, year_month, count)
           VALUES (${orgId}, ${yearMonth}, 0)
           ON CONFLICT (org_id, year_month) DO NOTHING`,
        tx`UPDATE usage_meters
           SET count = count + 1
           WHERE org_id = ${orgId}
             AND year_month = ${yearMonth}
             AND count < ${freeLimit}
           RETURNING count`,
      ]);
      const updateRows = usageResults[2] as Array<{ count: number }>;
      if (updateRows.length === 0) {
        // UPDATE returned 0 rows — count was already at or above the limit
        return c.json({ error: 'Monthly match run limit reached. Upgrade to continue.' }, 429);
      }
    }
    // --- End usage metering ---

    // Fetch dead-stock data — separate query (per D-03, no JOIN)
    const deadStockRows = await withOrgContext<
      Array<{
        sku: string;
        description: string;
        soh: number;
        cost_ex: number | null;
        store_name: string;
      }>
    >(
      dbUrl,
      orgId,
      (tx) => tx`
        SELECT ds.sku, ds.description, ds.soh, ds.cost_ex, s.name AS store_name
        FROM dead_stock ds
        JOIN stores s ON s.id = ds.store_id
        WHERE ds.org_id = ${orgId}
      `,
    );

    // Fetch ROU data — includes is_ranged for ranged-first sort (Phase 7 fix for INT-01)
    const rouRows = await withOrgContext<
      Array<{
        sku: string;
        description: string;
        rou: number;
        soh: number;
        is_ranged: boolean;   // read from rou_data after Phase 7 ALTER TABLE
        store_name: string;
      }>
    >(
      dbUrl,
      orgId,
      (tx) => tx`
        SELECT rd.sku, rd.description, rd.rou, rd.soh, rd.is_ranged,
               s.name AS store_name
        FROM rou_data rd
        JOIN stores s ON s.id = rd.store_id
        WHERE rd.org_id = ${orgId}
      `,
    );

    // Convert rouRows to RouItem[] — apply store filter, read is_ranged from DB (per MATCH-05, MATCH-06)
    const rouData: RouItem[] = rouRows
      .filter((r) => !storeFilter || storeFilter.includes(r.store_name))
      .map((r) => ({
        sku: r.sku,
        store: r.store_name,
        rou: r.rou,
        isRanged: r.is_ranged,  // read from rou_data, not hardcoded (INT-01 fix)
        soh: r.soh,
      }));

    // Group dead-stock rows by store name — apply store filter
    const storeDeadStock = new Map<string, DeadStockItem[]>();
    for (const row of deadStockRows.filter((r) => !storeFilter || storeFilter.includes(r.store_name))) {
      const items = storeDeadStock.get(row.store_name) || [];
      items.push({ sku: row.sku, soh: row.soh, description: row.description, cost: row.cost_ex ?? 0 });
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
