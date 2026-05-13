// FILE: apps/worker/src/routes/upload.ts
// This file defines the upload API routes for the PharmIQ Stock Transfer Worker.
// POST /upload — accepts multipart form data (storeName, storeNumber, rouFile, dsFile),
//               validates file size, parses via parser module, and bulk-inserts into NEON.
// GET /stores — returns the per-org store list with per-file upload timestamps.
//
// MIGRATION REQUIRED: ALTER TABLE stores ADD COLUMN store_number TEXT;
// Run once against NEON before deploying this route.
//
// MIGRATION REQUIRED (Phase 7): ALTER TABLE rou_data ADD COLUMN IF NOT EXISTS is_ranged BOOLEAN NOT NULL DEFAULT false;
// Run via NEON SQL editor as neondb_owner before deploying. Do NOT use DATABASE_URL (pharmiq_app has no DDL rights).
//
// MIGRATION REQUIRED (Phase 16): ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT;
// Run via NEON SQL editor as neondb_owner before deploying. Do NOT use DATABASE_URL (pharmiq_app has no DDL rights).

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { withOrgContext } from '../db/client';
import { parseRouFile, parseDeadStockFile } from '../lib/parser';
import type { DataQualityWarning } from '../matcher';

const uploadRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// --- POST /upload ---

uploadRoute.post('/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const orgId = c.get('orgId');
    const warnings: DataQualityWarning[] = [];
    const storeName = (body['storeName'] as string)?.trim();
    const storeNumber = (body['storeNumber'] as string)?.trim() || null;
    const rouFile = body['rouFile'];
    const dsFile = body['dsFile'];

    // Validation
    if (!storeName) return c.json({ error: 'storeName is required' }, 400);
    if (!(rouFile instanceof File) && !(dsFile instanceof File)) {
      return c.json({ error: 'At least one file must be provided' }, 400);
    }

    // Size checks BEFORE arrayBuffer() — per D-13, Pitfall 3
    for (const [label, f] of [['rouFile', rouFile], ['dsFile', dsFile]] as const) {
      if (f instanceof File && f.size > MAX_BYTES) {
        const mb = (f.size / 1024 / 1024).toFixed(1);
        return c.json(
          {
            error: `File too large — maximum 5 MB. Your file is ${mb} MB.`,
            field: label,
          },
          413,
        );
      }
    }

    // Ensure org row exists (FK: stores → orgs)
    const dbUrl = c.env.DATABASE_URL;
    await withOrgContext<void>(
      dbUrl,
      orgId,
      (tx) => tx`INSERT INTO orgs (org_id) VALUES (${orgId}) ON CONFLICT DO NOTHING`,
    );

    // Upsert store — get-or-create (per D-01)
    const existing = await withOrgContext<{ id: string }[]>(
      dbUrl,
      orgId,
      (tx) => tx`SELECT id FROM stores WHERE org_id = ${orgId} AND name = ${storeName}`,
    );

    let storeId: string;
    if (existing.length > 0) {
      storeId = existing[0].id;
      // Update store_number if provided
      if (storeNumber !== null) {
        await withOrgContext<void>(
          dbUrl,
          orgId,
          (tx) => tx`UPDATE stores SET store_number = ${storeNumber} WHERE id = ${storeId}`,
        );
      }
    } else {
      const created = await withOrgContext<{ id: string }[]>(
        dbUrl,
        orgId,
        (tx) =>
          tx`INSERT INTO stores (org_id, name, store_number, created_at)
             VALUES (${orgId}, ${storeName}, ${storeNumber}, NOW()) RETURNING id`,
      );
      storeId = created[0].id;
    }

    let rouRowCount: number | undefined;
    let dsRowCount: number | undefined;

    // Process ROU file if provided
    if (rouFile instanceof File) {
      let rows;
      try {
        const buf = await rouFile.arrayBuffer();
        rows = parseRouFile(buf, rouFile.name);
      } catch (_err) {
        return c.json(
          {
            error: 'ROU Report could not be read. Expected columns: Item Code/SKU, Item Description, Stock on Hand/SOH, Rate of Usage/ROU (Ranged optional). Check the file is a valid FRED Office export.',
            field: 'rouFile',
          },
          400,
        );
      }

      rouRowCount = rows.length;

      // DELETE existing ROU data for this store (per RESEARCH Pattern 6)
      await withOrgContext<void>(
        dbUrl,
        orgId,
        (tx) => tx`DELETE FROM rou_data WHERE org_id = ${orgId} AND store_id = ${storeId}`,
      );

      // Bulk INSERT via UNNEST — per RESEARCH Pattern 5
      if (rows.length > 0) {
        const skus = rows.map((r) => r.sku);
        const descriptions = rows.map((r) => r.description);
        const rous = rows.map((r) => r.rou);
        const sohs = rows.map((r) => r.soh);
        const ranged = rows.map((r) => r.isRanged);

        await withOrgContext<void>(
          dbUrl,
          orgId,
          (tx) => tx`
            INSERT INTO rou_data (org_id, store_id, sku, description, rou, soh, is_ranged, uploaded_at)
            SELECT ${orgId}, ${storeId}::uuid,
                   unnest(${skus}::text[]),
                   unnest(${descriptions}::text[]),
                   unnest(${rous}::float8[]),
                   unnest(${sohs}::float8[]),
                   unnest(${ranged}::boolean[]),
                   NOW()
          `,
        );
      }
    }

    // Process dead-stock file if provided
    if (dsFile instanceof File) {
      let rows;
      try {
        const buf = await dsFile.arrayBuffer();
        rows = parseDeadStockFile(buf, dsFile.name);
      } catch (_err) {
        return c.json(
          {
            error: 'Dead-Stock Report could not be read. Expected columns: Item Code/SKU, Item Description, Stock on Hand/SOH (Ranged optional). Check the file is a valid FRED Office export.',
            field: 'dsFile',
          },
          400,
        );
      }

      dsRowCount = rows.length;

      // D-09: negative cost_ex is a data entry error — emit warning, store NULL
      for (const row of rows) {
        if (!Number.isNaN(row.costEx) && row.costEx < 0) {
          warnings.push({
            sku: row.sku,
            field: "cost",
            reason: "cost_ex is negative — likely a data entry error in FRED; stored as null",
          });
        }
      }

      await withOrgContext<void>(
        dbUrl,
        orgId,
        (tx) => tx`DELETE FROM dead_stock WHERE org_id = ${orgId} AND store_id = ${storeId}`,
      );

      if (rows.length > 0) {
        const skus = rows.map((r) => r.sku);
        const descriptions = rows.map((r) => r.description);
        const sohs = rows.map((r) => r.soh);
        const ranged = rows.map((r) => r.isRanged);
        const costs: (number | null)[] = rows.map((r) => {
          // D-08: zero is valid (preserved). D-09: negative → NULL (warning emitted above). NaN → NULL.
          if (Number.isNaN(r.costEx)) return null;
          if (r.costEx < 0) return null;
          return r.costEx;
        });
        const departments = rows.map((r) => r.department);

        await withOrgContext<void>(
          dbUrl,
          orgId,
          (tx) => tx`
            INSERT INTO dead_stock (org_id, store_id, sku, description, soh, is_ranged, cost_ex, department, uploaded_at)
            SELECT ${orgId}, ${storeId}::uuid,
                   unnest(${skus}::text[]),
                   unnest(${descriptions}::text[]),
                   unnest(${sohs}::float8[]),
                   unnest(${ranged}::boolean[]),
                   unnest(${costs}::float8[]),
                   unnest(${departments}::text[]),
                   NOW()
          `,
        );
      }
    }

    return c.json({ ok: true, storeId, storeName, rouRows: rouRowCount, dsRows: dsRowCount, warnings });
  } catch (err) {
    console.error('[upload] handler error:', err);
    return c.json({ error: 'Upload failed — database error. Please try again.' }, 500);
  }
});

// --- GET /stores ---

uploadRoute.get('/stores', async (c) => {
  try {
    const orgId = c.get('orgId');
    const dbUrl = c.env.DATABASE_URL;

    const stores = await withOrgContext<
      Array<{
        id: string;
        name: string;
        store_number: string | null;
        created_at: string;
        rou_uploaded_at: string | null;
        ds_uploaded_at: string | null;
      }>
    >(
      dbUrl,
      orgId,
      (tx) => tx`
        SELECT s.id, s.name, s.store_number,
               s.created_at,
               MAX(r.uploaded_at) AS rou_uploaded_at,
               MAX(d.uploaded_at) AS ds_uploaded_at
        FROM stores s
        LEFT JOIN rou_data r ON r.store_id = s.id
        LEFT JOIN dead_stock d ON d.store_id = s.id
        WHERE s.org_id = ${orgId}
        GROUP BY s.id, s.name, s.store_number, s.created_at
        ORDER BY s.name ASC
      `,
    );

    // camelCase JSON keys per project conventions
    return c.json({
      stores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        storeNumber: s.store_number,
        createdAt: s.created_at,
        rouUploadedAt: s.rou_uploaded_at,
        dsUploadedAt: s.ds_uploaded_at,
      })),
    });
  } catch (err) {
    console.error('[stores] handler error:', err);
    return c.json({ error: 'Failed to load stores. Please try again.' }, 500);
  }
});

export default uploadRoute;
