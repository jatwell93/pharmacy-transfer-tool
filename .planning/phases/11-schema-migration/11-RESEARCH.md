# Phase 11: Schema Migration - Research

**Researched:** 2026-04-16
**Domain:** NEON Postgres DDL migrations, Cloudflare Worker secrets management
**Confidence:** HIGH

---

## Summary

Phase 11 is a pure database migration phase with no new application logic. It adds two columns to the live NEON database (`cost_ex DOUBLE PRECISION` on `dead_stock`, and `plan_tier TEXT NOT NULL DEFAULT 'free'` plus `stripe_price_id TEXT` on `subscriptions`), migrates any existing `status = 'paid'` rows to `plan_tier = 'pro'`, synchronises `schema.sql` in the repo to match, and adds two new Worker secret placeholders to `.dev.vars.example`. No Worker code is deployed; no frontend changes. The entire phase is a single plan.

The schema.sql file was read directly from the working tree. [VERIFIED: file read] The current `subscriptions` table has no `plan_tier` column and no `stripe_price_id` column. The `dead_stock` table has no `cost_ex` column. These are the only gaps between the v1.0 schema and what v1.1 downstream phases require.

**Primary recommendation:** Write and run one idempotent migration SQL block using `ADD COLUMN IF NOT EXISTS`; update schema.sql to match; add STRIPE_PRICE_ID_PRO and STRIPE_PRICE_ID_ENTERPRISE placeholders to `.dev.vars.example`; append both new secrets to the wrangler.jsonc comment block so future operators know to run `wrangler secret put`.

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| NEON SQL console / psql | PostgreSQL 18.1 (local) | Run migration DDL against NEON | Direct DDL execution — no ORM migration framework |
| `@neondatabase/serverless` | ^1.0.2 [VERIFIED: package.json] | NEON HTTP driver used in Worker code | Already in use across all routes |

### No migration framework needed

This project uses hand-written SQL migrations applied directly through the NEON console or via `psql` with the `DATABASE_URL`. There is no Flyway, Liquibase, or Drizzle migration runner. [VERIFIED: codebase — `apps/worker/src/db/migrations/001-add-store-number.sql` is a raw SQL file; no migration runner is configured]

The precedent from Phase 3 (which added `store_number` to `stores`) is to:
1. Write a numbered migration SQL file under `apps/worker/src/db/migrations/`
2. Run it manually against NEON
3. Update `schema.sql` to reflect the new canonical DDL

**Installation:** No new packages required for Phase 11.

---

## Architecture Patterns

### Recommended Project Structure

```
apps/worker/src/db/
├── schema.sql                         # canonical DDL — updated to match NEON after migration
├── migrations/
│   ├── 001-add-store-number.sql       # Phase 3 precedent
│   └── 002-v1.1-schema.sql            # Phase 11 — new migration file
```

### Pattern 1: Idempotent `ADD COLUMN IF NOT EXISTS`

**What:** PostgreSQL `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is safe to re-run; it silently no-ops if the column already exists. [VERIFIED: PostgreSQL 9.6+ supports `IF NOT EXISTS` on `ADD COLUMN`]

**When to use:** Any time a migration may be run more than once (CI, re-run after partial failure, onboarding a second developer).

```sql
-- Source: PostgreSQL ALTER TABLE documentation; IF NOT EXISTS supported since PG 9.6
ALTER TABLE dead_stock
  ADD COLUMN IF NOT EXISTS cost_ex DOUBLE PRECISION;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free';

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
```

### Pattern 2: Data migration inside a DO block or plain UPDATE

**What:** `UPDATE subscriptions SET plan_tier = 'pro' WHERE status = 'paid'` — converts existing paid subscribers to the `pro` tier before v1.1 code reads `plan_tier`.

**When to use:** Must be run AFTER the `ADD COLUMN` DDL, in the same migration session.

```sql
-- Source: SQL standard; safe because plan_tier DEFAULT 'free' means all rows are already 'free'
-- unless they had status='paid'
UPDATE subscriptions
  SET plan_tier = 'pro'
  WHERE status = 'paid';
```

**Important:** Run this in the same session / migration script as the `ADD COLUMN` to guarantee no gap where the column exists but paid rows are still labelled `plan_tier = 'free'`.

### Pattern 3: schema.sql as canonical DDL mirror

**What:** `schema.sql` is the source of truth for a fresh-install of the database. After every migration, the corresponding `CREATE TABLE` or column list in `schema.sql` is updated so a new developer can run `schema.sql` from scratch and get the current schema without also running every migration file.

The Phase 3 precedent confirms this pattern: `001-add-store-number.sql` alters the live table and `schema.sql` was updated to include `store_number TEXT` in the `CREATE TABLE stores` block. [VERIFIED: file read of schema.sql line 23]

### Pattern 4: `.dev.vars.example` as secrets inventory

**What:** `.dev.vars.example` is the committed reference for local environment variables. It lists every secret the Worker needs with `=xxx` placeholder values. New secrets must be added here so developers know what to fill in.

The wrangler.jsonc comment block listing `wrangler secret put` commands for each secret is the production-secrets counterpart — it must also be updated.

### Anti-Patterns to Avoid

- **`NOT NULL` without `DEFAULT` on an existing table:** Adding a `NOT NULL` column with no default to a table that already has rows will fail with `ERROR: column "x" of relation "y" contains null values`. `plan_tier` requires `NOT NULL DEFAULT 'free'` so the migration succeeds even if subscription rows already exist.
- **Running DDL after deploying application code:** If v1.1 Worker code is deployed before this migration runs, every request that touches `cost_ex` or `plan_tier` will throw `column "cost_ex" does not exist`. The roadmap explicitly states Phase 11 must complete before any other v1.1 Worker code is deployed.
- **Using TEXT for numeric aggregation columns:** `cost_ex` must be `DOUBLE PRECISION`. A TEXT column would accept string values without error on insert, but `SUM(cost_ex)` would return null or throw a type error depending on the context. [VERIFIED: REQUIREMENTS.md COST-02 specifies `SUM(Cost Ex × SOH)`]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration runner | Custom script to apply SQL files in order | psql -f or NEON SQL editor | No migration framework installed; precedent is manual execution |
| Schema diff tool | Compare schema.sql to live NEON | `\d tablename` in psql or NEON console | Simple two-column diff; manual check is sufficient for 2 columns |
| Rollback automation | Automated `DROP COLUMN IF EXISTS` rollback | Manual rollback SQL if needed | Nullable columns with defaults are safe to leave; no data is at risk if migration is re-run |

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `subscriptions` table in live NEON — rows with `status = 'paid'` need `plan_tier = 'pro'` | Data migration: `UPDATE subscriptions SET plan_tier = 'pro' WHERE status = 'paid'` |
| Live service config | NEON live database — column additions require DDL execution | DDL via NEON console or psql |
| OS-registered state | None — no scheduled tasks reference `plan_tier` or `cost_ex` | None |
| Secrets/env vars | `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` — new secrets referenced by Phase 15 code; not yet in `.dev.vars.example`, not yet registered as Wrangler secrets | Add placeholders to `.dev.vars.example`; add `wrangler secret put` entries to wrangler.jsonc comment; actual secret values are a manual pre-flight step before Phase 15 |
| Build artifacts | None — Phase 11 has no TypeScript changes, no compiled output | None |

**Existing `.dev.vars.example` contents confirmed:** [VERIFIED: file read] Currently has `STRIPE_PRICE_ID=price_xxx` (singular). Phase 11 adds `STRIPE_PRICE_ID_PRO=price_xxx` and `STRIPE_PRICE_ID_ENTERPRISE=price_xxx`. The old `STRIPE_PRICE_ID` remains for backward compat with Phase 5 billing route until Phase 15 replaces it.

---

## Common Pitfalls

### Pitfall 1: `NOT NULL` column with no DEFAULT on non-empty table
**What goes wrong:** `ALTER TABLE subscriptions ADD COLUMN plan_tier TEXT NOT NULL` fails with `ERROR: column contains null values` if any subscription rows exist.
**Why it happens:** Postgres cannot satisfy the NOT NULL constraint on existing rows that have no value for the new column.
**How to avoid:** Always include `DEFAULT 'free'` in the `ADD COLUMN` statement for `plan_tier`. [VERIFIED: PostgreSQL docs — ADD COLUMN with NOT NULL requires DEFAULT for existing rows]
**Warning signs:** Migration aborts immediately with a Postgres error message about null values.

### Pitfall 2: `cost_ex` declared as TEXT
**What goes wrong:** `SUM(cost_ex)` returns null or raises a cast error; aggregation queries in Phase 12 and 14 silently return wrong types.
**Why it happens:** SheetJS parses spreadsheet cells as strings by default; if the INSERT coerces to TEXT, numeric SQL operations fail at query time, not insert time.
**How to avoid:** Declare `cost_ex DOUBLE PRECISION`. The Worker parser will cast to a JS number before inserting; NEON will reject non-numeric values at insert time. [ASSUMED: SheetJS coercion behaviour — confirmed via prior phase research that parser casts rou/soh to numbers before insert]
**Warning signs:** `SELECT SUM(cost_ex)` returns `null` even when rows have non-null string values.

### Pitfall 3: Deploying v1.1 Worker code before migration runs
**What goes wrong:** First request to `/match`, `/upload`, or `/usage` that references `cost_ex` or `plan_tier` errors with `column "plan_tier" does not exist`.
**Why it happens:** Postgres raises an error immediately if a query references a column that does not exist in the table definition.
**How to avoid:** Phase 11 must be completed and verified (via `\d dead_stock` and `\d subscriptions`) before any v1.1 Worker code is deployed or wrangler dev restarts with new routes.
**Warning signs:** Worker logs show `[neon] error: column "plan_tier" of relation "subscriptions" does not exist`.

### Pitfall 4: Partial migration leaving paid rows with `plan_tier = 'free'`
**What goes wrong:** `ADD COLUMN` succeeds but the `UPDATE` to set `plan_tier = 'pro'` is not run. Phase 15 billing code reads `plan_tier` for limit enforcement — a paid subscriber would be treated as free.
**Why it happens:** The two statements are run separately and the second is accidentally skipped.
**How to avoid:** Include both DDL and the UPDATE in the same migration script. Verify with `SELECT status, plan_tier FROM subscriptions` after migration.
**Warning signs:** `SELECT status, plan_tier FROM subscriptions` shows rows with `status = 'paid'` and `plan_tier = 'free'`.

### Pitfall 5: Forgetting to update `schema.sql` after live migration
**What goes wrong:** A new developer (or re-deploy from scratch) runs `schema.sql` and gets a schema missing `cost_ex` and `plan_tier`. Phase 12 and 15 code fails on first query.
**Why it happens:** The migration SQL file is run against NEON but `schema.sql` is not updated as a follow-on task.
**How to avoid:** The plan task must explicitly include editing `schema.sql` to add the two columns to their respective `CREATE TABLE` blocks. This is the Phase 3 precedent.
**Warning signs:** `schema.sql` `CREATE TABLE dead_stock` has no `cost_ex` column; `CREATE TABLE subscriptions` has no `plan_tier` column.

---

## Code Examples

Verified patterns from the codebase and PostgreSQL documentation:

### Complete migration SQL (safe to re-run)

```sql
-- Source: PostgreSQL ALTER TABLE docs + Phase 3 precedent in 001-add-store-number.sql
-- Phase 11 migration: v1.1 schema additions

-- 1. Add cost_ex to dead_stock
ALTER TABLE dead_stock
  ADD COLUMN IF NOT EXISTS cost_ex DOUBLE PRECISION;

-- 2. Add plan_tier to subscriptions (NOT NULL with default to handle existing rows)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free';

-- 3. Add stripe_price_id to subscriptions (nullable — set at checkout time)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- 4. Migrate existing paid rows to pro tier
UPDATE subscriptions
  SET plan_tier = 'pro'
  WHERE status = 'paid';
```

### schema.sql `dead_stock` table after migration

```sql
-- Source: apps/worker/src/db/schema.sql (current) + Phase 11 addition
CREATE TABLE IF NOT EXISTS dead_stock (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  description TEXT,
  soh         DOUBLE PRECISION,
  cost_ex     DOUBLE PRECISION,             -- added Phase 11: unit cost excl. GST (nullable)
  is_ranged   BOOLEAN NOT NULL DEFAULT false,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### schema.sql `subscriptions` table after migration

```sql
-- Source: apps/worker/src/db/schema.sql (current) + Phase 11 additions
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  stripe_price_id         TEXT,             -- added Phase 11: price ID for upgrade/downgrade
  status                  TEXT NOT NULL DEFAULT 'free',
  plan_tier               TEXT NOT NULL DEFAULT 'free',  -- added Phase 11: 'free'|'pro'|'enterprise'
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `.dev.vars.example` additions

```bash
# Phase 11: Stripe price IDs for Pro and Enterprise tiers (required by Phase 15)
# Create in Stripe Dashboard → Products, then store via:
#   wrangler secret put STRIPE_PRICE_ID_PRO
#   wrangler secret put STRIPE_PRICE_ID_ENTERPRISE
STRIPE_PRICE_ID_PRO=price_xxx
STRIPE_PRICE_ID_ENTERPRISE=price_xxx
```

### Verification queries after migration

```sql
-- Confirm cost_ex column exists on dead_stock
\d dead_stock
-- Expected: cost_ex | double precision | (nullable)

-- Confirm plan_tier and stripe_price_id exist on subscriptions
\d subscriptions
-- Expected: plan_tier | text | not null | 'free'
-- Expected: stripe_price_id | text | (nullable)

-- Confirm no paid rows remain with plan_tier = 'free'
SELECT status, plan_tier FROM subscriptions;
-- Expected: any status='paid' rows have plan_tier='pro'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `\d` check only | `IF NOT EXISTS` guard + manual check | Phase 3 established pattern | Migration is safe to re-run without error |
| Single `STRIPE_PRICE_ID` | Three price ID env vars (existing + PRO + ENTERPRISE) | Phase 11 | Requires `.dev.vars.example` update and new wrangler secret entries |

**Deprecated/outdated:**

- `status = 'paid'` as the paid-plan indicator: In v1.0, `billing.ts` and `match.ts` used `status !== 'paid'` to gate free-tier logic. Phase 15 will replace this with `plan_tier` reads. Phase 11 just adds the column; the v1.0 `status` column remains unchanged. Both columns coexist until Phase 15 cuts over.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SheetJS coerces spreadsheet numeric cells to JS numbers before the Worker inserts cost_ex | Pitfall 2 | If SheetJS returns strings, the insert may cast to DOUBLE PRECISION fine anyway (Postgres casts '12.50' to DOUBLE PRECISION), but the code explicitly checking for numeric types in the parser would need to handle cost_ex the same way as rou/soh |
| A2 | No paid subscription rows exist in the live NEON database (the app is pre-launch / test-only) | Runtime State Inventory | If paid rows exist in production, the UPDATE migration is required and must not be skipped |

**If A2 is true (no paid rows):** The UPDATE is a no-op but still correct to run. If A2 is false, the UPDATE is critical.

---

## Open Questions

1. **Does the live NEON instance have any `status = 'paid'` subscription rows?**
   - What we know: The app is in early development; Stripe test-mode webhooks may have created paid rows during Phase 5 testing.
   - What's unclear: Whether the developer ran Stripe test checkouts against the production NEON database or only against a local/test database.
   - Recommendation: Run `SELECT COUNT(*) FROM subscriptions WHERE status = 'paid'` before migration to know whether the UPDATE will touch any rows. Either way, run it — it is a no-op if zero rows match.

2. **Should `stripe_price_id` be nullable or have a default?**
   - What we know: The UAT spec says `\d subscriptions` shows `stripe_price_id TEXT` (no NOT NULL, no default). Existing rows have no price ID. It is only set at checkout or webhook time.
   - What's unclear: Nothing — nullable with no default is correct.
   - Recommendation: `ADD COLUMN IF NOT EXISTS stripe_price_id TEXT` (nullable, no default). [VERIFIED: UAT spec in ROADMAP.md Phase 11]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| psql CLI | Running migration SQL from terminal | Yes | PostgreSQL 18.1 [VERIFIED: psql --version] | NEON SQL console (browser) |
| NEON SQL console | Running migration against live DB | Yes (browser) | — | — |
| DATABASE_URL | Connecting psql to NEON | Yes [VERIFIED: .dev.vars present] | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None. Both execution paths (psql CLI or NEON SQL console) are available.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (via `@cloudflare/vitest-pool-workers`) |
| Config file | `apps/worker/vitest.config.ts` |
| Quick run command | `cd apps/worker && npm test` |
| Full suite command | `cd apps/worker && npm test` |

### Phase Requirements → Test Map

Phase 11 has no REQ-IDs and no application code changes. The only testable output is the database schema state, which is verified manually via `\d` queries as specified in the UAT section of ROADMAP.md.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (none) | `cost_ex` column exists on `dead_stock` | manual — `\d dead_stock` in psql | N/A | N/A |
| (none) | `plan_tier` column exists on `subscriptions` | manual — `\d subscriptions` in psql | N/A | N/A |
| (none) | No `status='paid'` rows with `plan_tier='free'` | manual — SELECT query | N/A | N/A |
| (none) | schema.sql matches live NEON schema | manual — visual diff | N/A | N/A |
| (none) | `.dev.vars.example` has both new price ID entries | automated — grep or file read | N/A | N/A |

### Sampling Rate

- **Per task commit:** Existing test suite continues to pass: `cd apps/worker && npm test`
- **Per wave merge:** Same
- **Phase gate:** UAT checklist verified manually before `/gsd-verify-work`

### Wave 0 Gaps

None — no new test files are needed. The existing test suite must remain green after schema.sql edits (tests mock the DB and don't read schema.sql at runtime). No framework installs required.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | RLS policies in schema.sql must be preserved — no GRANT changes needed for the two new columns (existing table-level GRANTs cover all columns) |
| V5 Input Validation | no | Migration SQL only — no user input |
| V6 Cryptography | no | n/a |

### Known Threat Patterns for DDL Migrations

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Migration run as `neondb_owner` (BYPASSRLS) | Elevation of Privilege | Run DDL as `neondb_owner` only for schema changes; all application queries continue to use `pharmiq_app` role (BYPASSRLS=false). Schema.sql header comment documents this requirement. [VERIFIED: schema.sql lines 3-4] |
| Exposing real Stripe price IDs in committed files | Information Disclosure | `.dev.vars` is gitignored; `.dev.vars.example` uses `price_xxx` placeholders only. Real values via `wrangler secret put`. |

---

## Sources

### Primary (HIGH confidence)

- `apps/worker/src/db/schema.sql` — current table definitions read directly
- `apps/worker/src/db/migrations/001-add-store-number.sql` — precedent for migration pattern
- `apps/worker/.dev.vars.example` — current secrets inventory
- `apps/worker/src/routes/billing.ts` and `webhook.ts` — current `status` column usage
- `apps/worker/src/types.ts` — current `Env` interface (missing new price ID keys)
- `.planning/ROADMAP.md` Phase 11 section — UAT spec and pitfalls
- PostgreSQL `ADD COLUMN IF NOT EXISTS` — standard since PostgreSQL 9.6

### Secondary (MEDIUM confidence)

- NEON `@neondatabase/serverless` ^1.0.2 confirmed via `package.json` [VERIFIED]
- psql 18.1 available locally [VERIFIED: psql --version]

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; migration approach verified from Phase 3 precedent
- Architecture: HIGH — DDL patterns verified from codebase and PostgreSQL docs
- Pitfalls: HIGH — all pitfalls derived from direct codebase reading and Phase 11 roadmap spec

**Research date:** 2026-04-16
**Valid until:** 2026-07-16 (schema stable; NEON API unlikely to change)
