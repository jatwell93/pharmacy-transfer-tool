// FILE: apps/worker/src/routes/dead-stock-summary.ts
// GET /dead-stock-summary — returns per-store unit totals and dollar values.
// Aggregates dead_stock by store via LEFT JOIN; uses FILTER clauses for null-safe SUM/COUNT.
// Response shape per D-06: { stores: [{ name, totalUnits, totalValue, hasCostData }] }
// hasCostData (D-05, D-11) is the explicit signal for COST-04 — frontend uses it (not totalValue===0)
// to detect missing cost column and prompt for FRED Stock Valuation re-upload.

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { withOrgContext } from '../db/client';

const summaryRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

summaryRoute.get('/dead-stock-summary', async (c) => {
  try {
    const orgId = c.get('orgId');
    const dbUrl = c.env.DATABASE_URL;

    // D-10: SUM(...) FILTER (WHERE ... IS NOT NULL) — plain SUM across all-NULL rows returns NULL, not 0
    // D-11: COUNT(cost_ex) FILTER (...) > 0 — true if any non-null cost row exists for the store
    // COALESCE(..., 0) — LEFT JOIN against a store with no dead_stock rows produces NULL aggregates; coerce to 0
    // COST-02: totalValue is SUM(cost_ex * soh), NOT SUM(cost_ex) — cost_ex is per-unit; multiply by soh for total $
    const rows = await withOrgContext<Array<{
      name: string;
      total_units: number;
      total_value: number;
      has_cost_data: boolean;
    }>>(
      dbUrl,
      orgId,
      (tx) => tx`
        SELECT
          s.name,
          COALESCE(SUM(d.soh) FILTER (WHERE d.soh IS NOT NULL), 0)                                       AS total_units,
          COALESCE(SUM(d.cost_ex * d.soh) FILTER (WHERE d.cost_ex IS NOT NULL AND d.soh IS NOT NULL), 0) AS total_value,
          (COUNT(d.cost_ex) FILTER (WHERE d.cost_ex IS NOT NULL) > 0)                                    AS has_cost_data
        FROM stores s
        LEFT JOIN dead_stock d ON d.store_id = s.id
        WHERE s.org_id = ${orgId}
        GROUP BY s.id, s.name
        ORDER BY s.name ASC
      `,
    );

    // D-06: camelCase response shape. Defensive coercions per RESEARCH Pitfall 5 / Open Question 1
    // (NEON HTTP driver may serialize numerics or booleans as strings depending on PG type).
    return c.json({
      stores: rows.map((r) => ({
        name: r.name,
        totalUnits: Number(r.total_units),
        totalValue: Number(r.total_value),
        hasCostData: Boolean(r.has_cost_data),
      })),
    });
  } catch (err) {
    console.error('[dead-stock-summary] handler error:', err);
    return c.json({ error: 'Failed to load dead stock summary. Please try again.' }, 500);
  }
});

export default summaryRoute;
