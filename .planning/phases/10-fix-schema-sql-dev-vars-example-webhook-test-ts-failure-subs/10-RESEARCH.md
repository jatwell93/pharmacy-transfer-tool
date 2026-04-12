# Phase 10: Fix schema.sql + .dev.vars.example + webhook.test.ts failure + subscriptions.status DEFAULT naming — Research

**Researched:** 2026-04-13
**Domain:** Postgres schema maintenance, developer experience (DX) config, test correctness, SQL semantic naming
**Confidence:** HIGH

---

## Summary

Phase 10 is a tech-debt closure phase. All four items were catalogued in the `v1.0-MILESTONE-AUDIT.md` as non-blocking tech debt. None require new architecture or new dependencies — they are all small, targeted corrections to existing files.

**Item 1 — schema.sql missing `store_number` column:** The `stores` table in `schema.sql` does not include the `store_number TEXT` column that was added via a migration file (`001-add-store-number.sql`) during Phase 3. Any developer who provisions a fresh NEON database from `schema.sql` alone will receive a runtime error on the first upload because `upload.ts` references `store_number` in both INSERT and SELECT queries.

**Item 2 — .dev.vars.example missing Stripe variables:** The example file was created in Phase 1 with only 4 Clerk/database keys. Phase 5 added 6 Stripe-related keys to `.dev.vars` but `.dev.vars.example` was never updated. A new developer cloning the repo cannot set up a working local environment without reading the actual `.dev.vars` (which contains real secrets and is gitignored).

**Item 3 — webhook.test.ts failure (already resolved):** The `customer.subscription.deleted` test was previously failing because `neon()` was mocked to return only `{ transaction: mockTransaction }` instead of a full callable template-tag function that also has `.transaction` attached. This was fixed in commit `395a94d` (Phase 9). All 89 tests pass now (89/89). This phase should document/confirm this resolution — no code change needed.

**Item 4 — subscriptions.status DEFAULT 'inactive' naming:** `schema.sql` line 63 sets `DEFAULT 'inactive'` but the application only ever writes `'paid'` or `'free'` to this column (via `webhook.ts`). The code treats anything other than `'paid'` as free-tier (binary check: `=== 'paid'`). The DEFAULT `'inactive'` is a semantic inconsistency — a freshly inserted subscription row gets `'inactive'` status, which is then treated as free-tier correctly by the binary check, so there is no functional break. However, it introduces a third status value (`'inactive'`) that has no defined handling and would confuse future developers reading the schema.

**Primary recommendation:** Four targeted file edits, no new dependencies, no migration needed for items 1 and 4 (schema.sql is a setup script run once, not a migration tool), and no code logic changes for item 3 (already fixed). All 89 tests remain passing after changes.

---

## Project Constraints (from CLAUDE.md)

- Stack: Cloudflare Workers (Node) + Pages (React) + NEON Postgres + Clerk
- Auth: Clerk — already integrated
- Data: NEON Postgres — multi-tenant per-org data scoping
- Deployment: Cloudflare Pages/Workers — no Python, no traditional server
- Business model: Free tier = 1 match run/month; enforced in backend
- GSD workflow enforcement: Use `/gsd:execute-phase` for planned phase work; no direct edits outside GSD workflow
- RTK prefix: use `rtk` for all CLI commands
- Commit docs: `true` (per config.json)

---

## Detailed Issue Analysis

### Issue 1: schema.sql Missing `store_number` Column

**What is wrong:**

```sql
-- Current stores table in schema.sql (line 19-25):
CREATE TABLE IF NOT EXISTS stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);
```

The `store_number TEXT` column is missing. A migration file exists at `apps/worker/src/db/migrations/001-add-store-number.sql`:

```sql
-- Phase 3 migration: add store_number column to stores table (per CONTEXT.md D-01, D-03)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_number TEXT;
```

But the base `schema.sql` was never updated to include the column definition.

**Why it matters:**

`upload.ts` references `store_number` in:
- Line 84: `INSERT INTO stores (org_id, name, store_number, created_at)`
- Line 216: `SELECT s.id, s.name, s.store_number, ...`
- Line 224: `GROUP BY s.id, s.name, s.store_number, s.created_at`

A fresh NEON deployment using only `schema.sql` will fail with `column "store_number" does not exist` on the first upload attempt.

**Fix:** Add `store_number TEXT` to the `stores` table definition in `schema.sql`. [VERIFIED: codebase grep + migration file]

Also add `is_ranged BOOLEAN NOT NULL DEFAULT false` to `rou_data` — this was added via an ALTER in Phase 7 but already present in `schema.sql` (verified at line 35). No change needed for this.

**Current correct state of rou_data in schema.sql:** The `is_ranged` column IS present (Phase 7 already updated schema.sql via commit `1f9fb15`). Only `store_number` is missing.

**Fix precision:** Add `store_number TEXT` to the stores CREATE TABLE statement ONLY. No other schema changes needed. [VERIFIED: comparison of schema.sql vs upload.ts queries]

---

### Issue 2: .dev.vars.example Missing Stripe Variables

**Current .dev.vars.example contents (4 keys):**

```
CLERK_SECRET_KEY=sk_test_xxx
CLERK_PUBLISHABLE_KEY=pk_test_xxx
DATABASE_URL=postgresql://pharmiq_app:xxx@xxx.neon.tech/neondb?sslmode=require
ALLOWED_ORIGIN=http://localhost:5173
```

**Actual .dev.vars (live file, gitignored) has 10 keys including:**

```
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_PRODCUT_ID_10_BY_10=price_...   ← note: PRODCUT typo in env var name
STRIPE_PRODCUT_ID_15_BY_15=price_...   ← note: PRODCUT typo in env var name
STRIPE_PRODCUT_ID_UNLIMITED=price_...  ← note: PRODCUT typo in env var name
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_51...
```

**What types.ts and test files show as required:**

From `apps/worker/src/types.ts` — the `Env` interface:
```typescript
export interface Env {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  DATABASE_URL: string;
  ALLOWED_ORIGIN: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID: string;
}
```

The `TEST_ENV` objects in test files confirm the mandatory keys:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`

**Additional wrangler.jsonc note:** The comments section lists only 4 secrets (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `DATABASE_URL`, `ALLOWED_ORIGIN`). The Stripe secrets are also missing from the `wrangler secret put` comment list.

**Fix:** Update `.dev.vars.example` to include the 3 Stripe keys required by `types.ts` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`) with placeholder values. Update the `wrangler.jsonc` comment block to list all secrets including the 3 Stripe ones.

**Decision on the PRODCUT typos:** The `.dev.vars` has `STRIPE_PRODCUT_ID_*` env vars (3 keys with "PRODCUT" typo) that are NOT in `types.ts`. These appear to be legacy keys from a multi-price exploration during Phase 5 that were never wired into code — only `STRIPE_PRICE_ID` is used. The `.dev.vars.example` should NOT propagate these typo'd names. [VERIFIED: types.ts, TEST_ENV objects in billing.test.ts, webhook.test.ts]

---

### Issue 3: webhook.test.ts Failure (ALREADY RESOLVED)

**Status: FIXED in commit 395a94d (Phase 9, 2026-04-13)**

The previous failure: the `customer.subscription.deleted` test mocked `neon()` to return `{ transaction: mockTransaction }` — an object, not a callable function. But `webhook.ts` uses `sql` both as:
1. `sql.transaction(callback)` — for `checkout.session.completed`
2. `sql\`...\`` — as a template tag directly for the `subscription.deleted` UPDATE

The fix made `mockSql` a callable `vi.fn()` with `.transaction` attached:

```typescript
const { mockSql, mockTransaction } = vi.hoisted(() => {
  const mockSql = vi.fn().mockResolvedValue([]);
  const mockTransaction = vi.fn();
  mockSql.transaction = mockTransaction;
  return { mockSql, mockTransaction };
});
```

**Current state:** 89/89 tests pass. No changes required to `webhook.test.ts`. [VERIFIED: test run output, commit 395a94d]

**Phase 10 action:** Confirm in SUMMARY.md that this item is resolved; no file change needed.

---

### Issue 4: subscriptions.status DEFAULT 'inactive' vs 'free'/'paid' Semantics

**What is wrong:**

```sql
-- schema.sql line 63:
status TEXT NOT NULL DEFAULT 'inactive',
```

**What the application actually writes:**

- `webhook.ts` checkout completed: `status = 'paid'`
- `webhook.ts` subscription deleted: `status = 'free'`
- No code ever writes `'inactive'`

**Why it matters:**

- The three values in use are: `'paid'`, `'free'`, `'inactive'` (DEFAULT only — never written by application code)
- All route logic uses a binary check: `=== 'paid'` → paid tier; anything else → free tier
- `'inactive'` as a DEFAULT means a fresh subscription row gets treated as free-tier (correct functionally) but is semantically wrong
- Future developers reading the schema expect `DEFAULT 'inactive'` to be a meaningful application state

**Correct DEFAULT:** Should be `'free'` to match the two-state model (`'free'` / `'paid'`) used throughout the application.

**Impact of change on existing NEON data:** Any existing `subscriptions` rows with `status = 'inactive'` would need to be updated — but since the application has never written `'inactive'` (only used as DEFAULT on INSERT, and any actual subscription created by the webhook would already be `'paid'`), in practice existing rows are either `'paid'` or don't exist yet. The fix in `schema.sql` only affects fresh deployments.

**Fix:** Change `DEFAULT 'inactive'` to `DEFAULT 'free'` in the subscriptions table CREATE TABLE statement. [VERIFIED: schema.sql line 63, webhook.ts lines 63-68 and 91, billing.ts line 28]

---

### Issue 5: ROADMAP.md Phase 9 Not Self-Closed (Minor — from Milestone Audit)

The milestone audit notes: "ROADMAP.md Phase 9 shows 0/1 In Progress — needs manual close now that verification passed." The Phase 9 VERIFICATION.md shows `status: passed`. This is a 1-line documentation update.

**Fix:** Update ROADMAP.md Phase 9 progress row from `0/1 | In Progress | -` to `1/1 | Complete | 2026-04-13`.

---

## Standard Stack

No new dependencies required. This phase uses only:

| Tool | Version | Purpose |
|------|---------|---------|
| SQL (Postgres) | NEON hosted | Schema correction (schema.sql edit) |
| Bash/text editor | — | .dev.vars.example and wrangler.jsonc update |
| Vitest | ^4.1.2 (installed) | Test verification run |

---

## Architecture Patterns

### Pattern 1: schema.sql as Idempotent Setup Script

`schema.sql` uses `CREATE TABLE IF NOT EXISTS` throughout — it is safe to re-run. The `store_number` column addition should match this pattern:

```sql
CREATE TABLE IF NOT EXISTS stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  store_number TEXT,                                    -- ADD THIS
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);
```

Adding `store_number TEXT` (nullable, no DEFAULT) matches the existing migration file and upload.ts query patterns (accepts NULL for stores without a number). [VERIFIED: 001-add-store-number.sql uses no DEFAULT, upload.ts sets `storeNumber || null`]

### Pattern 2: .dev.vars.example as Onboarding Contract

The `.dev.vars.example` file is the only gitignored-file substitute that new developers see. It must reflect every key in `types.ts Env` interface plus any keys used in TEST_ENV objects.

**Canonical source of truth for required keys:** `types.ts Env` interface (7 keys after Phase 5).

### Pattern 3: Binary Status Check

The application uses a binary plan model. The subscription status is treated as `'paid'` or non-`'paid'`. No code path handles `'inactive'` distinctly from `'free'`. This means the DEFAULT fix is purely semantic — zero behavior change for any live deployment. [VERIFIED: billing.ts line 28, match.ts line 60]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Schema migration for existing NEON DB | ALTER TABLE script | schema.sql is a fresh-deploy setup script; run 001-add-store-number.sql on existing DBs separately |
| Secret rotation | New key names | Keep existing key names exactly as in types.ts — DO NOT rename or add new keys |

---

## Common Pitfalls

### Pitfall 1: Confusing schema.sql with a Migration Tool

**What goes wrong:** Treating schema.sql as something to migrate existing databases and adding `ALTER TABLE` statements to it.
**Why it happens:** schema.sql is a setup script (`CREATE TABLE IF NOT EXISTS`) for fresh deployments, not a migration runner.
**How to avoid:** Only edit the `CREATE TABLE` statement. For existing NEON databases, the migration file `001-add-store-number.sql` is already the correct mechanism.
**Warning signs:** Adding `ALTER TABLE` to schema.sql.

### Pitfall 2: Adding Typo'd STRIPE_PRODCUT_ID_* Keys to .dev.vars.example

**What goes wrong:** Copying `.dev.vars` literally, including the 3 `STRIPE_PRODCUT_ID_*` keys (typo: PRODCUT not PRODUCT) that are not in `types.ts`.
**Why it happens:** Mechanical copy from live `.dev.vars` without cross-referencing `types.ts`.
**How to avoid:** Use `types.ts Env` interface as the canonical list. `STRIPE_PRICE_ID` is the only price-related key needed.
**Warning signs:** `.dev.vars.example` has more keys than `types.ts Env` interface.

### Pitfall 3: Changing subscriptions.status Handling Logic

**What goes wrong:** Changing `=== 'paid'` to `=== 'paid' || === 'active'` or adding new status handling.
**Why it happens:** Misreading the issue as a logic bug rather than a schema naming inconsistency.
**How to avoid:** Only change `DEFAULT 'inactive'` to `DEFAULT 'free'` in schema.sql. No code changes required.

### Pitfall 4: Re-Breaking webhook.test.ts

**What goes wrong:** Refactoring the neon mock setup in webhook.test.ts while "cleaning up" the test file.
**Why it happens:** The mock structure looks complex (callable vi.fn with .transaction attached).
**How to avoid:** Do not touch webhook.test.ts. All 89 tests pass — leave it as is.

---

## Code Examples

### Correct schema.sql stores table (after fix)

```sql
-- Source: apps/worker/src/db/schema.sql + apps/worker/src/db/migrations/001-add-store-number.sql
CREATE TABLE IF NOT EXISTS stores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  store_number TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);
```

### Correct subscriptions table status DEFAULT (after fix)

```sql
-- Source: apps/worker/src/routes/webhook.ts (status values used: 'paid', 'free')
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  status                  TEXT NOT NULL DEFAULT 'free',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Correct .dev.vars.example (after fix)

```
CLERK_SECRET_KEY=sk_test_xxx
CLERK_PUBLISHABLE_KEY=pk_test_xxx
DATABASE_URL=postgresql://pharmiq_app:xxx@xxx.neon.tech/neondb?sslmode=require
# ALLOWED_ORIGIN is used for CORS AND for azp (authorized parties) JWT claim validation.
# In production, set this to the Cloudflare Pages URL (e.g. https://pharmiq-stock-transfer-web.pages.dev).
# Without this, Clerk's @clerk/backend will reject tokens with an "Invalid azp" error (see RESEARCH Pitfall 6).
ALLOWED_ORIGIN=http://localhost:5173
# Stripe — required for freemium billing (Phase 5)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID=price_xxx
```

### Correct wrangler.jsonc comment block (after fix)

```jsonc
// Secrets managed via `wrangler secret put` (not in config):
// wrangler secret put CLERK_SECRET_KEY
// wrangler secret put CLERK_PUBLISHABLE_KEY
// wrangler secret put DATABASE_URL
// wrangler secret put ALLOWED_ORIGIN
// wrangler secret put STRIPE_SECRET_KEY
// wrangler secret put STRIPE_WEBHOOK_SECRET
// wrangler secret put STRIPE_PRICE_ID
```

---

## Runtime State Inventory

> This phase is NOT a rename/refactor/migration phase. No runtime state inventory required.
>
> **Schema.sql is a fresh-deployment setup script** — it does not touch existing NEON databases. The existing live NEON database already has `store_number` (added by migration 001) and already has `status` values of `'paid'` or `'free'` (never `'inactive'`, since code never writes that value). No data migration is required.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | Vitest test run | Yes | (npm available) | — |
| Vitest | Test verification | Yes | ^4.1.2 installed | — |
| NEON Postgres | Live schema validation | Not needed | — | schema.sql is validated by reading it against upload.ts |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest via `@cloudflare/vitest-pool-workers` |
| Config file | `apps/worker/vitest.config.ts` |
| Quick run command | `cd apps/worker && npm test` |
| Full suite command | `cd apps/worker && npm test` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| schema.sql stores table has store_number column | static verification (grep) | grep "store_number" apps/worker/src/db/schema.sql | ❌ post-fix |
| schema.sql subscriptions DEFAULT is 'free' | static verification (grep) | grep "DEFAULT 'free'" apps/worker/src/db/schema.sql | ❌ post-fix |
| .dev.vars.example has STRIPE_SECRET_KEY | static verification (grep) | grep "STRIPE_SECRET_KEY" apps/worker/.dev.vars.example | ❌ post-fix |
| All 89 tests pass (no regression from changes) | full suite | `cd apps/worker && npm test` | ✅ existing |

### Sampling Rate

- **Per task commit:** `cd apps/worker && npm test` (89 tests, ~18s)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

None — no new test files required. All changes are static file edits verified by grep + existing test suite.

---

## Security Domain

These changes are all schema/config documentation fixes. No new attack surface is introduced.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | No (no new input paths) | n/a |
| V6 Cryptography | No | n/a |
| V2 Authentication | No | n/a |

**Specific security note on .dev.vars.example:** The file must use placeholder values (`xxx`) — never real credentials. This is already the pattern for the 4 existing keys and must be maintained for the 3 new keys.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `STRIPE_PRODCUT_ID_*` keys in `.dev.vars` are legacy/unused (not in types.ts) | Issue 2 | Low — if wrong, worker would fail to start with TypeScript errors; types.ts Env is authoritative |

**All other claims in this document were VERIFIED by reading the actual codebase files in this session.**

---

## Open Questions

1. **Is there a `store_number` index missing from schema.sql?**
   - What we know: `stores` has indexes on `org_id` only (`CREATE INDEX IF NOT EXISTS idx_stores_org ON stores(org_id)`). upload.ts does not query by `store_number` alone — it queries by `org_id AND name`.
   - What's unclear: Whether a `store_number` index would be useful.
   - Recommendation: No index needed — `store_number` is a display field, not a query predicate. Leave index as-is.

2. **Should the ROADMAP.md Phase 9 close be included in this phase?**
   - What we know: The milestone audit lists it as tech debt. It's a 1-line doc change.
   - Recommendation: Include it — it's trivial and cleans up the milestone audit report.

---

## Sources

### Primary (HIGH confidence — VERIFIED in this session by reading actual files)

- `apps/worker/src/db/schema.sql` — stores table missing store_number, subscriptions DEFAULT 'inactive'
- `apps/worker/src/db/migrations/001-add-store-number.sql` — confirms store_number column definition
- `apps/worker/.dev.vars.example` — confirms 4 missing Stripe keys
- `apps/worker/.dev.vars` — confirms real key set (10 keys including Stripe)
- `apps/worker/src/types.ts` — authoritative Env interface (7 required keys)
- `apps/worker/src/routes/webhook.ts` — confirms 'paid'/'free' are the only status values written
- `apps/worker/src/routes/billing.ts` — confirms binary `=== 'paid'` check
- `apps/worker/src/routes/match.ts` — confirms binary `!== 'paid'` check
- `apps/worker/src/__tests__/webhook.test.ts` — confirms test is already fixed
- `apps/worker/wrangler.jsonc` — confirms comment block missing Stripe secrets
- `.planning/v1.0-MILESTONE-AUDIT.md` — canonical source of all 4 tech debt items
- Test run output: 89/89 tests passing — confirmed in this session

---

## Metadata

**Confidence breakdown:**

- Issue identification: HIGH — all 4 issues verified by direct file inspection
- Fix scope: HIGH — each fix is a targeted edit to a specific line/section
- No-regression risk: HIGH — changes are to schema.sql (setup script), .dev.vars.example (example file), and wrangler.jsonc comments; no TypeScript source changes; webhook.test.ts is already resolved

**Research date:** 2026-04-13
**Valid until:** Indefinite — these are static file corrections, not API-dependent findings
