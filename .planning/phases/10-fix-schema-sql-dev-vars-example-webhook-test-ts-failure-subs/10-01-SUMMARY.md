---
phase: 10
plan: "01"
subsystem: schema, config
tags: [schema, dx, config, tech-debt]
dependency_graph:
  requires: [phase-09]
  provides: [schema-store-number, subscriptions-free-default, stripe-dx-keys]
  affects: [apps/worker/src/db/schema.sql, apps/worker/.dev.vars.example, apps/worker/wrangler.jsonc, .planning/ROADMAP.md]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - apps/worker/src/db/schema.sql
    - apps/worker/.dev.vars.example
    - apps/worker/wrangler.jsonc
    - .planning/ROADMAP.md
decisions:
  - schema.sql stores table gains store_number TEXT (nullable) between name and created_at — no migration needed as this is the canonical DDL run against NEON
  - subscriptions.status DEFAULT changed from 'inactive' to 'free' — aligns with orgs.plan='free' default and billing route logic that reads 'free' status
  - ROADMAP.md Phase 9 was already complete from prior agent work — no edits required
metrics:
  duration: 10
  completed: "2026-04-13"
  tasks_completed: 3
  files_changed: 3
---

# Phase 10 Plan 01: Schema Fixes, DX Config Completeness, and Phase 9 Close Summary

**One-liner:** Closed 4 v1.0 tech-debt items — added store_number to schema.sql stores table, fixed subscriptions DEFAULT from 'inactive' to 'free', and added 3 Stripe DX keys to .dev.vars.example and wrangler.jsonc.

## What Was Done

### Change 1: store_number TEXT column added to stores table (schema.sql)

Added `store_number TEXT` (nullable) between `name` and `created_at` in the `CREATE TABLE IF NOT EXISTS stores` DDL. This allows store-number identifiers from FRED Office exports to be stored alongside the store name, without breaking existing rows (nullable column, no NOT NULL constraint).

Before:
```sql
CREATE TABLE IF NOT EXISTS stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);
```

After:
```sql
CREATE TABLE IF NOT EXISTS stores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  store_number TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);
```

### Change 2: subscriptions.status DEFAULT 'inactive' -> 'free' (schema.sql)

Changed the default value on `subscriptions.status` from `'inactive'` to `'free'`. The billing route and usage endpoint both check for `'free'` to determine tier — using `'inactive'` as the default would have caused new subscription rows to bypass free-tier enforcement. The value `'free'` is consistent with `orgs.plan DEFAULT 'free'`.

### Change 3: Stripe DX keys added to .dev.vars.example and wrangler.jsonc

Added 3 Stripe environment variable entries to `.dev.vars.example`:
```
# Stripe — required for freemium billing (Phase 5)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID=price_xxx
```

Added 3 corresponding `wrangler secret put` comment lines to `wrangler.jsonc` after the existing `ALLOWED_ORIGIN` entry:
```
// wrangler secret put STRIPE_SECRET_KEY
// wrangler secret put STRIPE_WEBHOOK_SECRET
// wrangler secret put STRIPE_PRICE_ID
```

### Change 4: ROADMAP.md Phase 9 close

Phase 9 was already correctly marked complete in ROADMAP.md (`1/1 | Complete | 2026-04-13`, `[x] **Phase 9**`) from prior agent work. No edits were required.

## Verification Results

All acceptance criteria passed:

| Check | Result |
|-------|--------|
| `grep -c "store_number TEXT" schema.sql` returns 1 | PASS |
| `grep "DEFAULT 'free'" schema.sql` matches status line | PASS |
| `grep "DEFAULT 'inactive'" schema.sql` returns no matches | PASS |
| `grep -c "STRIPE_" .dev.vars.example` returns 3 | PASS |
| `grep -c "STRIPE_" wrangler.jsonc` returns 3 | PASS |
| `grep "PRODCUT" .dev.vars.example` returns no matches | PASS |
| Phase 9 row shows `1/1 | Complete | 2026-04-13` | PASS |
| Phase 9 checkbox shows `[x]` | PASS |
| `npm test` exits 0 with 89 tests passing | PASS |

## Commit

`a64a664` — fix(phase-10): schema.sql store_number + subscriptions DEFAULT, Stripe DX keys, Phase 9 roadmap close

## Deviations from Plan

None — plan executed exactly as written. The ROADMAP.md changes for Task 3 were already present from prior Phase 9 agent work, so no edits to that file were needed.

## Self-Check: PASSED

- `apps/worker/src/db/schema.sql` — modified, committed in a64a664
- `apps/worker/.dev.vars.example` — modified, committed in a64a664
- `apps/worker/wrangler.jsonc` — modified, committed in a64a664
- All 89 tests pass (confirmed via `npm test` in apps/worker)
