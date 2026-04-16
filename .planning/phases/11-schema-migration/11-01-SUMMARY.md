---
phase: 11-schema-migration
plan: "01"
subsystem: database
tags: [schema, migration, neon, postgres, stripe]
dependency_graph:
  requires: []
  provides:
    - dead_stock.cost_ex column (DOUBLE PRECISION, nullable)
    - subscriptions.plan_tier column (TEXT NOT NULL DEFAULT 'free')
    - subscriptions.stripe_price_id column (TEXT, nullable)
    - Migrated paid->pro subscriptions rows
  affects:
    - apps/worker/src/db/schema.sql
    - apps/worker/src/db/migrations/002-v1.1-schema.sql
    - apps/worker/.dev.vars.example
    - apps/worker/wrangler.jsonc
tech_stack:
  added: []
  patterns:
    - Idempotent DDL migration using ADD COLUMN IF NOT EXISTS
    - Paid->pro row migration via UPDATE ... WHERE status='paid'
key_files:
  created:
    - apps/worker/src/db/migrations/002-v1.1-schema.sql
  modified:
    - apps/worker/src/db/schema.sql
    - apps/worker/.dev.vars.example
    - apps/worker/wrangler.jsonc
decisions:
  - "cost_ex typed as DOUBLE PRECISION (not NUMERIC/FLOAT) to match soh column type in dead_stock and rou_data"
  - "plan_tier NOT NULL DEFAULT 'free' so existing rows receive the free tier automatically without a backfill"
  - "stripe_price_id nullable (no default) — set only at checkout or webhook time, never at row creation"
  - "UPDATE plan_tier='pro' WHERE status='paid' placed last in migration so column exists before UPDATE runs"
  - "Existing STRIPE_PRICE_ID entry preserved in .dev.vars.example and wrangler.jsonc — still used by Phase 5 billing"
metrics:
  duration: ~8 minutes
  completed_date: "2026-04-16"
  tasks_completed: 5
  tasks_total: 5
  files_created: 1
  files_modified: 3
---

# Phase 11 Plan 01: Schema Migration Summary

**One-liner:** Idempotent v1.1 NEON migration adding cost_ex (DOUBLE PRECISION), plan_tier (NOT NULL DEFAULT 'free'), and stripe_price_id (nullable) columns with paid->pro row migration.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create 002-v1.1-schema.sql migration file | 6eb5f33 | apps/worker/src/db/migrations/002-v1.1-schema.sql (created) |
| 2 | Update canonical schema.sql with three new columns | b528e5a | apps/worker/src/db/schema.sql |
| 3 | Update .dev.vars.example and wrangler.jsonc | 7a8e50d | apps/worker/.dev.vars.example, apps/worker/wrangler.jsonc |
| 4 | Verify Worker test suite passes (89 tests, 8 files, exit 0) | — (no files) | verification only |
| 5 | Execute migration against live NEON database | bf70827 (checkpoint) | live NEON DB — verified via Query 5 |

## Artifacts

### apps/worker/src/db/migrations/002-v1.1-schema.sql

Four statements in order (all idempotent):

```sql
-- 1. Add cost_ex to dead_stock (nullable)
ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS cost_ex DOUBLE PRECISION;

-- 2. Add plan_tier to subscriptions (NOT NULL DEFAULT 'free')
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free';

-- 3. Add stripe_price_id to subscriptions (nullable)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- 4. Migrate paid rows to pro tier
UPDATE subscriptions SET plan_tier = 'pro' WHERE status = 'paid';
```

### apps/worker/src/db/schema.sql — changes

`dead_stock` block: added `cost_ex DOUBLE PRECISION` between `soh` and `is_ranged` rows.

`subscriptions` block: added `stripe_price_id TEXT` between `stripe_subscription_id` and `status`; added `plan_tier TEXT NOT NULL DEFAULT 'free'` between `status` and `updated_at`.

All 6 tables, 6 RLS policies, 1 GRANT, and all indexes unchanged.

### apps/worker/.dev.vars.example — additions

```
STRIPE_PRICE_ID_PRO=price_xxx
STRIPE_PRICE_ID_ENTERPRISE=price_xxx
```

Appended after existing `STRIPE_PRICE_ID=price_xxx` (preserved). Includes comment block with Stripe Dashboard instructions.

### apps/worker/wrangler.jsonc — additions

```
// wrangler secret put STRIPE_PRICE_ID_PRO         // Phase 11 (v1.1)
// wrangler secret put STRIPE_PRICE_ID_ENTERPRISE  // Phase 11 (v1.1)
```

Appended after existing `// wrangler secret put STRIPE_PRICE_ID` (preserved).

## Task 4 — Test Suite Results

```
Test Files  8 passed (8)
     Tests  89 passed (89)
  Start at  20:24:39
  Duration  6.73s
```

Exit code 0. No regressions from schema.sql edit. Tests mock the DB; schema.sql is not read at test time.

## Task 5 — Live NEON Migration: COMPLETE

Migration executed against live NEON database via NEON SQL Editor. All four statements completed successfully.

### Query 5 Output (confirmed by user)

```
column_name      | data_type        | is_nullable | column_default
-----------------+------------------+-------------+---------------
cost_ex          | double precision | YES         |
plan_tier        | text             | NO          | 'free'::text
stripe_price_id  | text             | YES         |
```

All three rows match expected output exactly:
- `dead_stock.cost_ex` — double precision, nullable, no default (correct)
- `subscriptions.plan_tier` — text, NOT NULL, default 'free'::text (correct)
- `subscriptions.stripe_price_id` — text, nullable, no default (correct)

Resume signal received: `migration-verified: Query 5 output matches expected 3 rows exactly.`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed npm dependencies before running tests**
- **Found during:** Task 4
- **Issue:** `apps/worker/node_modules` did not exist in the worktree — `npm test` would fail with "vitest not found"
- **Fix:** Ran `npm install` in `apps/worker/` before running tests. `node_modules` is gitignored; no committed files changed.
- **Files modified:** none (node_modules is gitignored)
- **Commit:** none required

## Known Stubs

None. This is a DDL-only phase — no application code stubs introduced.

## Threat Flags

No new security surface introduced. Migration file committed per T-11-02 (placeholder values only, no real Stripe IDs). T-11-01 mitigated via `neondb_owner` role instructions in migration header comment.

## Self-Check

Files created/modified verified:
- `apps/worker/src/db/migrations/002-v1.1-schema.sql` — EXISTS
- `apps/worker/src/db/schema.sql` — MODIFIED (cost_ex, plan_tier, stripe_price_id added)
- `apps/worker/.dev.vars.example` — MODIFIED (PRO + ENTERPRISE entries appended)
- `apps/worker/wrangler.jsonc` — MODIFIED (PRO + ENTERPRISE comments appended)

Commits verified:
- 6eb5f33 — feat(11-01): create 002-v1.1-schema.sql migration file
- b528e5a — feat(11-01): update schema.sql with v1.1 columns
- 7a8e50d — feat(11-01): add STRIPE_PRICE_ID_PRO and STRIPE_PRICE_ID_ENTERPRISE placeholders

## Self-Check: PASSED
