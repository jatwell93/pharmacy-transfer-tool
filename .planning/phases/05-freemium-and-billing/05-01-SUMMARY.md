---
phase: 05-freemium-and-billing
plan: 01
subsystem: worker-billing
tags: [billing, usage-metering, stripe, freemium, neon, hono]
dependency_graph:
  requires:
    - 04-matching-algorithm (match route exists)
    - 01-foundation (withOrgContext pattern, usage_meters + subscriptions tables in NEON)
  provides:
    - POST /api/match usage enforcement (429 for free-tier at limit)
    - GET /api/usage endpoint returning { count, limit, plan }
    - Stripe env vars in Env interface
  affects:
    - apps/worker/src/routes/match.ts (usage check added before matchTransfers)
    - apps/worker/src/index.ts (billingRoute mounted)
tech_stack:
  added:
    - stripe@^22.0.0 (npm dependency — SDK installed, not yet used in this plan)
  patterns:
    - Atomic SQL usage metering: INSERT ON CONFLICT DO NOTHING + UPDATE WHERE count < limit RETURNING count
    - neon() used directly (not withOrgContext) for multi-statement usage transaction
    - withOrgContext used for billing route read queries (subscriptions, usage_meters)
key_files:
  created:
    - apps/worker/src/routes/billing.ts
    - apps/worker/src/__tests__/billing.test.ts
  modified:
    - apps/worker/package.json (stripe dependency added)
    - apps/worker/src/types.ts (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID added to Env)
    - apps/worker/src/routes/match.ts (usage metering check inserted before dead-stock queries)
    - apps/worker/src/index.ts (billingRoute import and app.route mount added)
    - apps/worker/src/__tests__/match.test.ts (neon mock added to keep existing tests passing)
decisions:
  - Used neon() directly in match.ts usage check (not withOrgContext) because multi-statement INSERT ON CONFLICT + UPDATE WHERE requires a transaction with 3 statements including set_config — withOrgContext only wraps a single query
  - match.test.ts default neon mock returns paid plan so existing tests are unaffected by usage check insertion
  - .dev.vars created locally with placeholder Stripe values (gitignored — contains secrets)
metrics:
  duration_seconds: 240
  completed_date: "2026-04-05T12:16:04Z"
  tasks_completed: 2
  files_changed: 7
---

# Phase 5 Plan 1: Usage Metering and Billing Endpoint Summary

**One-liner:** Atomic SQL usage metering in POST /match (429 before matchTransfers for free-tier orgs at limit) plus GET /api/usage returning { count, limit, plan } backed by NEON subscriptions and usage_meters tables.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install Stripe SDK and update Env interface | b8ab657 | apps/worker/package.json, apps/worker/src/types.ts |
| 2 (RED) | Failing tests for billing route and usage check | 950920d | apps/worker/src/__tests__/billing.test.ts |
| 2 (GREEN) | Atomic usage metering + GET /api/usage + route mount | e3d4c94 | apps/worker/src/routes/billing.ts, apps/worker/src/routes/match.ts, apps/worker/src/index.ts, apps/worker/src/__tests__/match.test.ts |

## What Was Built

### Stripe SDK Installation (Task 1)

- `stripe@^22.0.0` added to `apps/worker/package.json` dependencies
- `Env` interface in `apps/worker/src/types.ts` extended with three Stripe env vars:
  - `STRIPE_SECRET_KEY` — for server-side Stripe API calls (Plan 02 webhook handler)
  - `STRIPE_WEBHOOK_SECRET` — for webhook signature verification (Plan 02)
  - `STRIPE_PRICE_ID` — for Checkout Session creation (Plan 02)
- `.dev.vars` created locally with placeholder values (gitignored)

### Atomic Usage Metering in POST /match (Task 2, BILLING-01)

The usage check is inserted into `apps/worker/src/routes/match.ts` immediately after input validation, before any `withOrgContext` data queries and before `matchTransfers()` executes.

**Two-step transaction pattern:**

1. **Plan check** — `neon(dbUrl).transaction()` with `set_config` + `SELECT status FROM subscriptions WHERE org_id = $1` — determines free vs paid
2. **Free-tier enforcement** (skipped for paid orgs) — second transaction with:
   - `INSERT INTO usage_meters ... ON CONFLICT (org_id, year_month) DO NOTHING` — creates row if first run
   - `UPDATE usage_meters SET count = count + 1 WHERE ... AND count < 1 RETURNING count` — atomic increment; returns 0 rows if already at limit
   - If 0 rows updated → `return c.json({ error: 'Monthly match run limit reached. Upgrade to continue.' }, 429)`

This implements T-5-01 and T-5-03 from the threat model — the database-level `WHERE count < limit` condition makes it impossible for concurrent transactions to both increment past the limit.

### GET /api/usage Endpoint (Task 2, BILLING-02)

New `apps/worker/src/routes/billing.ts` with `GET /usage`:
- Reads `subscriptions` table via `withOrgContext` → determines `plan` ('free' | 'paid') and `limit` (1 or -1)
- Reads `usage_meters` table for current `year_month` → determines `count`
- Returns `{ count, limit, plan }` — consumed by frontend Match page and Billing page (Plan 03)

Mounted in `apps/worker/src/index.ts` after existing authenticated routes.

### Tests (billing.test.ts — 7 tests)

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | Free org, no prior row (first-ever run) | 200, usage incremented |
| 2 | Free org at limit (UPDATE returns 0 rows) | 429, withOrgContext never called |
| 3 | Free org, explicit 'free' status, under limit | 200 |
| 4 | Paid org | 200, only 1 transaction call (plan check only) |
| 5 | GET /usage, free org with 1 run | { count: 1, limit: 1, plan: 'free' } |
| 6 | GET /usage, paid org | { count: 0, limit: -1, plan: 'paid' } |
| 7 | GET /usage, no subscription row | { count: 0, limit: 1, plan: 'free' } |

Full suite: **76 tests pass across 7 test files** (no regressions).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Updated match.test.ts to mock @neondatabase/serverless**

- **Found during:** Task 2 GREEN phase — existing match.test.ts tests would have failed after inserting the `neon()` usage check into match.ts because `@neondatabase/serverless` was not mocked in that test file
- **Fix:** Added `vi.mock("@neondatabase/serverless", ...)` with `mockMatchTransaction` to match.test.ts; set default return value to `[[], [{ status: "paid" }]]` (paid plan) in `beforeEach` so all 6 existing match tests pass without modification
- **Files modified:** `apps/worker/src/__tests__/match.test.ts`
- **Commit:** e3d4c94

None of the plan's required files were modified beyond the plan's scope.

## Known Stubs

None — all data flows are wired to real NEON queries via `withOrgContext` and direct `neon()` transactions. No hardcoded empty values or placeholder data in the implementation.

## Threat Surface Scan

All files modified in this plan are covered by the plan's threat model:

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-5-01 | Implemented — atomic `UPDATE WHERE count < limit RETURNING count` |
| T-5-02 | Implemented — `orgId` sourced from `c.get('orgId')` (Clerk JWT via requireOrg middleware) |
| T-5-03 | Implemented — Postgres row-level UPDATE atomicity prevents concurrent over-increment |

No new network endpoints, auth paths, or schema changes outside the threat model were introduced.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/worker/src/routes/billing.ts | FOUND |
| apps/worker/src/__tests__/billing.test.ts | FOUND |
| apps/worker/src/routes/match.ts | FOUND |
| apps/worker/src/index.ts | FOUND |
| apps/worker/src/types.ts | FOUND |
| Commit b8ab657 (Task 1) | FOUND |
| Commit 950920d (Task 2 RED) | FOUND |
| Commit e3d4c94 (Task 2 GREEN) | FOUND |
| All 76 tests pass | VERIFIED |
| TypeScript compiles cleanly | VERIFIED |
