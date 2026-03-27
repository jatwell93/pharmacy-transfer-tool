# Architecture Patterns

**Domain:** File-processing SaaS — pharmacy dead-stock matching
**Researched:** 2026-03-28
**Overall confidence:** HIGH (all major claims verified against official docs or first-party sources)

---

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND  (Cloudflare Pages)                                   │
│  React + Vite + TailwindCSS + @clerk/react                      │
│  - Upload UI (multi-store, per-store re-upload)                 │
│  - Match run trigger + results table                            │
│  - Auth gate via Clerk <SignedIn> wrappers                      │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTPS + Bearer token (Clerk JWT)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│  API LAYER  (Cloudflare Workers, Workers Paid plan)             │
│  Hono framework — typed routing, built-in middleware chain      │
│                                                                 │
│  Middleware stack (applied globally):                           │
│    1. CORS middleware                                           │
│    2. @hono/clerk-auth → verifies JWT, injects auth ctx         │
│    3. Auth guard → rejects missing/invalid tokens               │
│    4. Org guard → rejects requests with no active orgId         │
│                                                                 │
│  Routes:                                                        │
│    POST /api/stores/:storeId/rou      — upload ROU file         │
│    POST /api/stores/:storeId/deadstock — upload dead-stock file │
│    GET  /api/stores                   — list org's stores       │
│    POST /api/match-runs               — trigger match           │
│    GET  /api/match-runs/:id           — fetch results           │
│    GET  /api/match-runs               — list runs for org       │
│    DELETE /api/stores/:storeId/rou    — remove store data       │
└────────────────┬──────────────────────────┬─────────────────────┘
                 │                          │
    ┌────────────▼──────────┐   ┌───────────▼──────────────┐
    │  NEON Postgres        │   │  Cloudflare R2            │
    │  (via Hyperdrive)     │   │  (raw file archive only)  │
    │                       │   │                           │
    │  - organisations      │   │  NOT required for v1.     │
    │  - stores             │   │  Use only if audit trail  │
    │  - rou_data           │   │  or re-parse is needed    │
    │  - deadstock_uploads  │   │  in a later phase.        │
    │  - match_runs         │   └───────────────────────────┘
    │  - match_results      │
    │  - usage_meters       │
    └───────────────────────┘
```

---

## System Design

### Framework: Hono (not vanilla Workers)

Use Hono. Do not use vanilla Workers request routing.

**Why:** Hono provides typed route definitions, a composable middleware chain, built-in `parseBody()` for multipart file uploads, and an official `@hono/clerk-auth` middleware that handles Clerk JWT verification with a single line. It runs natively on Cloudflare Workers with zero overhead — it is the fastest router in the Workers ecosystem (402,820 ops/sec). Vanilla Workers require manual routing logic that becomes unmaintainable at any realistic API surface size.

**Hono is the Cloudflare-recommended framework.** It appears first-party in Cloudflare's own documentation at `developers.cloudflare.com/workers/framework-guides`.

```typescript
// src/index.ts (entry point for the Worker)
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { clerkMiddleware, getAuth } from '@hono/clerk-auth'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({ origin: ['https://pharmiq-transfer.pages.dev'] }))
app.use('*', clerkMiddleware())

app.use('/api/*', async (c, next) => {
  const auth = getAuth(c)
  if (!auth?.userId) return c.json({ error: 'Unauthorized' }, 401)
  if (!auth?.orgId) return c.json({ error: 'No active organisation' }, 403)
  await next()
})

export default app
```

**Confidence:** HIGH — verified against Cloudflare official docs and Hono official docs.

---

### Clerk Auth Pattern

**Package:** `@hono/clerk-auth` (official Hono middleware, listed in Hono's third-party middleware docs and Clerk's own changelog).

**Environment variables required in `wrangler.jsonc`:**
```
CLERK_SECRET_KEY      = sk_live_...
CLERK_PUBLISHABLE_KEY = pk_live_...
```

**Auth object fields available after `clerkMiddleware()`:**

| Field | Type | Notes |
|-------|------|-------|
| `userId` | string | Clerk user ID; always present if authenticated |
| `orgId` | string \| undefined | Active org ID; only present if user has switched to an org |
| `orgRole` | string \| undefined | `"org:admin"` or `"org:member"` |

**Extracting orgId in a route handler:**
```typescript
app.post('/api/match-runs', async (c) => {
  const { userId, orgId } = getAuth(c)
  // orgId is the Clerk organization ID — use as org_id FK in all queries
})
```

**Critical security requirement:** Always pass `authorizedParties` to `verifyToken` to reject tokens issued for other domains. The `@hono/clerk-auth` middleware handles this when `CLERK_SECRET_KEY` is set correctly.

**Confidence:** HIGH — verified against Clerk official docs and `@hono/clerk-auth` GitHub README.

---

### NEON Connection from Workers

**Recommended approach: Cloudflare Hyperdrive + node-postgres (`pg`)**

Hyperdrive is Cloudflare's connection pooling proxy. It sits between your Worker and NEON and maintains warm TCP connections globally, eliminating per-request connection setup latency (which is the dominant cost of Postgres from serverless).

**Do NOT use:** `@neondatabase/serverless` when Hyperdrive is in play. The official NEON docs state: "When using Hyperdrive with Neon, use native PostgreSQL drivers like node-postgres or Postgres.js instead of the Neon serverless driver."

**Setup in `wrangler.jsonc`:**
```jsonc
{
  "compatibility_flags": ["nodejs_compat"],
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<hyperdrive-config-id>",
      "localConnectionString": "postgres://USER:PASS@HOST:PORT/DBNAME"
    }
  ]
}
```

**Connection pattern in a route handler:**
```typescript
import { Client } from 'pg'

app.post('/api/match-runs', async (c) => {
  const client = new Client({ connectionString: c.env.HYPERDRIVE.connectionString })
  await client.connect()
  try {
    const result = await client.query('SELECT ...', [params])
    return c.json(result.rows)
  } finally {
    c.executionCtx.waitUntil(client.end()) // non-blocking cleanup
  }
})
```

**When Hyperdrive is not yet set up (development or free tier):** Use `@neondatabase/serverless` over HTTP. HTTP mode is stateless, per-request, and requires no connection teardown. It is limited to non-interactive transactions (no `BEGIN`/`COMMIT` with interleaved reads), which is acceptable for this application's query patterns.

**Confidence:** HIGH — verified against Cloudflare Hyperdrive docs and NEON official guide for Cloudflare Workers.

---

### File Upload Strategy

**Verdict: Parse in Worker memory directly. Do not use R2 for v1.**

**Why not R2 for v1:**
- FRED export files (ROU + dead stock reports per store) are small. A single-store export is typically a few hundred rows — well under 1 MB even as XLSX.
- Storing raw uploads in R2 adds an R2 bucket binding, upload logic, and retrieval logic for no benefit at v1 scale.
- R2 becomes relevant only if you need audit trail / re-parse capability (deferred to v2 per PROJECT.md).

**Why in-memory parsing works:**
- Workers Paid plan allows 128 MB memory per isolate and up to 30 seconds CPU time (extensible to 5 minutes).
- A 500-row XLSX parsed with SheetJS consumes roughly 2–5 MB of memory and under 50 ms CPU — well within limits.
- The 128 MB cap is a risk only if a user uploads a very large file. Enforce a 5 MB client-side size limit on the frontend upload input and a server-side content-length check in the Worker middleware.

**File parsing pattern:**
```typescript
import * as XLSX from 'xlsx'

app.post('/api/stores/:storeId/rou', async (c) => {
  const body = await c.req.parseBody()           // Hono built-in multipart parser
  const file = body['file'] as File
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)             // SheetJS reads ArrayBuffer directly
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet)   // returns array of row objects
  // normalize headers → upsert to rou_data table
})
```

**SheetJS handles both CSV and XLSX transparently** via `XLSX.read()`. The existing header aliasing logic from the Django app can be ported directly as a TypeScript function.

**Confidence:** HIGH — SheetJS has official Cloudflare Workers documentation demonstrating this exact pattern. Workers memory limit verified against Cloudflare official limits page.

---

## Data Flow

### Full Pipeline: Upload to Match Results

```
1. USER UPLOADS ROU FILE (per store)
   Frontend → multipart POST /api/stores/:storeId/rou
   Worker: parse JWT → extract orgId
   Worker: parseBody() → file.arrayBuffer() → XLSX.read()
   Worker: normalize headers (header aliasing from existing logic)
   Worker: UPSERT into rou_data (org_id, store_id, sku, rou, is_ranged, description)
           ON CONFLICT (org_id, store_id, sku) DO UPDATE
   Worker: return { storeId, rowsImported }

2. USER UPLOADS DEAD STOCK FILE (per store)
   Frontend → multipart POST /api/stores/:storeId/deadstock
   Worker: same parse chain
   Worker: INSERT into deadstock_uploads (org_id, store_id, sku, soh, description)
           Replace entire store's dead-stock data on each upload
           (UPSERT pattern: delete store's rows then bulk insert in a transaction)
   Worker: return { storeId, rowsImported }

3. STORES LIST (derived, not hard-coded)
   Frontend → GET /api/stores
   Worker: SELECT DISTINCT store_id, store_name FROM rou_data WHERE org_id = ?
   Worker: return { stores: [{ id, name }] }

4. TRIGGER MATCH RUN
   Frontend → POST /api/match-runs { months_cover: 3 }
   Worker: check usage_meters (enforce 1 run/month on free tier)
           → 429 if over limit
   Worker: run matching algorithm in-memory:
           a. SELECT all rou_data WHERE org_id = ?
           b. SELECT all deadstock_uploads WHERE org_id = ?
           c. For each dead-stock SKU:
              - Find rou_data rows for same SKU at OTHER stores with ROU > 0
              - Apply sell-through filter: ROU >= SOH / 12
              - Apply months-cover cap: max_transfer = (months_cover × ROU) − receiving_store_SOH
              - Rank by is_ranged DESC, ROU DESC
           d. Collect all matches
   Worker: INSERT match_run record, INSERT match_results rows (bulk)
   Worker: INCREMENT usage_meters.runs_this_month
   Worker: return { matchRunId, matchCount }

5. FETCH RESULTS
   Frontend → GET /api/match-runs/:id
   Worker: SELECT match_results WHERE match_run_id = ? AND org_id = ?
   Worker: return paginated match results

6. EXPORT
   Frontend: Client-side CSV/Excel/PDF generation from fetched results
             (no Worker involvement — keeps CPU budget free)
```

**Note on matching algorithm execution:** The matching algorithm runs entirely in Worker memory. Dataset size for a typical pharmacy group (5–15 stores, 2,000–8,000 SKUs per store) means loading ~20,000–120,000 ROU rows into memory per match run. This is feasible at the paid CPU tier (30s default, 5 min max). If dataset size grows beyond ~500,000 rows, move the matching to a Postgres query with window functions (SQL-native approach eliminates in-memory limit concerns).

---

## Database Schema

### Design Principle: Shared Schema, org_id Scoping

Use shared schema (all orgs in the same tables, every row carries `org_id`). Do not use database-per-tenant for v1.

**Why:** NEON recommends database-per-tenant for large SaaS, but this product starts with a small number of pharmacy groups. Database-per-tenant requires dynamic provisioning via the NEON Management API and adds significant operational complexity. Shared schema with `org_id` on every table is correct for v1. Migrating to database-per-tenant is possible later if compliance requirements demand it.

**Multi-tenancy enforcement:** Every table that holds pharmacy data has `org_id NOT NULL` as a foreign key. All queries in the Worker include `WHERE org_id = $orgId` with the value sourced from the verified Clerk JWT — not from any user-supplied request parameter.

---

### Tables

#### `organisations`
```sql
CREATE TABLE organisations (
  id          TEXT PRIMARY KEY,        -- Clerk org ID (e.g. "org_abc123")
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'paid'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Auto-populate on first authenticated request (upsert via Clerk org webhook or lazy creation in middleware).

---

#### `stores`
```sql
CREATE TABLE stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE INDEX stores_org_idx ON stores (org_id);
```
Store records are created automatically when a file is uploaded for a store name that does not yet exist for that org. The store name comes from the filename or a user-supplied field — not hard-coded.

---

#### `rou_data`
Holds the most recent ROU (Rate of Usage) export per store. Replaces per-upload.

```sql
CREATE TABLE rou_data (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sku          TEXT NOT NULL,
  description  TEXT,
  rou          NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_ranged    BOOLEAN NOT NULL DEFAULT false,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, store_id, sku)
);
CREATE INDEX rou_data_org_sku_idx ON rou_data (org_id, sku);
CREATE INDEX rou_data_store_idx   ON rou_data (store_id);
```
The `UNIQUE (org_id, store_id, sku)` constraint enables `INSERT ... ON CONFLICT DO UPDATE` (upsert), replacing the Django delete-and-replace pattern with a safer atomic upsert.

---

#### `deadstock_uploads`
Holds the most recent dead-stock export per store. Replace-on-upload.

```sql
CREATE TABLE deadstock_uploads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sku          TEXT NOT NULL,
  description  TEXT,
  soh          NUMERIC(10,4) NOT NULL DEFAULT 0,
  cost         NUMERIC(10,4),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, store_id, sku)
);
CREATE INDEX deadstock_org_sku_idx ON deadstock_uploads (org_id, sku);
```
Replace strategy: `DELETE FROM deadstock_uploads WHERE org_id = $1 AND store_id = $2` then bulk insert, wrapped in a transaction. This avoids the Django footgun (non-transactional delete-then-insert).

---

#### `match_runs`
One record per match execution.

```sql
CREATE TABLE match_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_by   TEXT NOT NULL,               -- Clerk userId
  months_cover NUMERIC(4,1) NOT NULL DEFAULT 3,
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'complete' | 'error'
  match_count  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX match_runs_org_idx ON match_runs (org_id, created_at DESC);
```

---

#### `match_results`
One row per transfer recommendation from a match run.

```sql
CREATE TABLE match_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_run_id    UUID NOT NULL REFERENCES match_runs(id) ON DELETE CASCADE,
  org_id          TEXT NOT NULL,              -- denormalized for fast query
  sku             TEXT NOT NULL,
  description     TEXT,
  source_store_id UUID NOT NULL REFERENCES stores(id),
  dest_store_id   UUID NOT NULL REFERENCES stores(id),
  soh             NUMERIC(10,4) NOT NULL,
  rou             NUMERIC(10,4) NOT NULL,
  max_transfer    NUMERIC(10,4) NOT NULL,
  sell_through    NUMERIC(10,4) NOT NULL,
  is_ranged       BOOLEAN NOT NULL DEFAULT false,
  cost            NUMERIC(10,4)
);
CREATE INDEX match_results_run_idx ON match_results (match_run_id);
CREATE INDEX match_results_org_idx ON match_results (org_id);
```

---

#### `usage_meters`
Enforces the freemium 1 match run/month limit. One row per org per calendar month.

```sql
CREATE TABLE usage_meters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  period_year     SMALLINT NOT NULL,   -- e.g. 2026
  period_month    SMALLINT NOT NULL,   -- 1–12
  runs_used       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (org_id, period_year, period_month)
);
```

**Enforcement query in Worker (before match run):**
```sql
INSERT INTO usage_meters (org_id, period_year, period_month, runs_used)
VALUES ($1, $2, $3, 1)
ON CONFLICT (org_id, period_year, period_month)
DO UPDATE SET runs_used = usage_meters.runs_used + 1
RETURNING runs_used;
```
If `runs_used > 1` on free tier, return 429 and roll back the increment:
```sql
UPDATE usage_meters
SET runs_used = runs_used - 1
WHERE org_id = $1 AND period_year = $2 AND period_month = $3;
```
Alternatively, check first then increment (two queries with a short race window, acceptable for low-volume free tier).

---

### Schema Summary

| Table | Scoped by org_id | Multi-tenant risk | Notes |
|-------|-----------------|-------------------|-------|
| organisations | IS the org | — | Created on first login |
| stores | org_id FK | org data leak | Derived from uploads |
| rou_data | org_id FK + query | Cross-org read | INDEX required |
| deadstock_uploads | org_id FK + query | Cross-org read | Replace-on-upload |
| match_runs | org_id FK + query | Cross-org read | Archive of all runs |
| match_results | org_id denormalized | Cross-org read | Bulk insert per run |
| usage_meters | org_id FK | Over-billing | Upsert-increment |

---

## Component Boundaries

### What Talks to What

```
COMPONENT              COMMUNICATES WITH        DIRECTION
─────────────────────────────────────────────────────────
React frontend         Clerk (auth)             → Clerk hosted UI
React frontend         Worker API               → HTTPS + JWT Bearer
Worker API             Clerk (token verify)     → @hono/clerk-auth verifies locally
                                                  (no Clerk API call per request)
Worker API             NEON (via Hyperdrive)    → pg Client over Hyperdrive proxy
Worker API             R2 (v2 only)             → Workers R2 binding (not v1)
Clerk                  Webhooks → Worker        → org.created / user.created events
                                                  (optional: auto-create org rows)
```

### Boundaries Never Crossed

- Frontend never touches NEON directly.
- Worker never calls Clerk's REST API for JWT verification — all JWT checks are local using the `CLERK_SECRET_KEY` to verify the signature offline.
- `org_id` is never accepted from the request body or query params. It is always read from the verified JWT claims via `getAuth(c).orgId`. This is the primary multi-tenancy security control.

---

## Monorepo Structure

```
pharmacy-transfer-tool/
├── apps/
│   ├── web/                    # Cloudflare Pages (React + Vite)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── api/                    # Cloudflare Worker (Hono)
│       ├── src/
│       │   ├── index.ts         # Hono app + middleware
│       │   ├── routes/
│       │   │   ├── stores.ts
│       │   │   ├── uploads.ts
│       │   │   └── match-runs.ts
│       │   ├── lib/
│       │   │   ├── db.ts        # pg Client factory
│       │   │   ├── matcher.ts   # matching algorithm (ported from Django)
│       │   │   └── parser.ts    # XLSX/CSV parse + header aliasing
│       │   └── types.ts
│       ├── package.json
│       └── wrangler.jsonc
├── packages/
│   └── shared/                  # Shared TS types (optional)
│       └── src/types.ts
├── package.json                 # workspace root
└── turbo.json                   # or pnpm-workspace.yaml
```

**Cloudflare Pages monorepo:** Cloudflare Pages has native monorepo support. Set the build root directory to `apps/web` and the build command to `pnpm build` (or equivalent). The Worker in `apps/api` deploys separately via `wrangler deploy`.

---

## Build Order

The following order reflects dependency chains — earlier items must exist before later items can be built or tested.

### Phase 1: Foundation (Infrastructure before code)
1. NEON project + database provisioned
2. Schema migrations run (all tables above, in dependency order: orgs → stores → rou_data → deadstock_uploads → match_runs → match_results → usage_meters)
3. Clerk application created, organisations feature enabled
4. Cloudflare Workers Paid plan enabled (required for 30s CPU limit; free plan gives 10ms which will fail on file parsing)
5. Hyperdrive config created in Cloudflare dashboard, linked to NEON
6. Worker skeleton with Hono + `@hono/clerk-auth` + Hyperdrive binding deployed (health check endpoint)
7. Pages project created, linked to `apps/web`

**Gate:** Worker returns `{ status: "ok", orgId: "..." }` for an authenticated request before proceeding.

### Phase 2: File Upload Pipeline
1. `POST /api/stores/:storeId/rou` — multipart parse, SheetJS, header aliasing, upsert to `rou_data`
2. `POST /api/stores/:storeId/deadstock` — same pattern, upsert to `deadstock_uploads`
3. `GET /api/stores` — derived store list from uploaded data
4. Frontend upload UI: store name input + file picker, submit to API, status feedback
5. Multi-store upload workflow: upload N stores independently, see upload status per store

**Gate:** Can upload 3-store ROU and dead-stock files, see stores listed dynamically (not hard-coded).

### Phase 3: Matching Algorithm
1. Port matching algorithm from Django `find_transfer_matches` to TypeScript `matcher.ts`
2. Add months-cover cap logic (new feature — not in existing Django code)
3. Fix `is_ranged` parsing brittleness (accepts `"checked"`, `"yes"`, `"true"`, `"1"`, `true`)
4. Add NaN/ROU validation (reject silently-zeroed values, surface data quality warnings)
5. `POST /api/match-runs` — reads all org data, runs matcher, writes results
6. `GET /api/match-runs/:id` — fetch results with store names joined
7. Frontend: trigger run button, results virtualized table

**Gate:** Match run on known test data produces results that match hand-verified expectations.

### Phase 4: Freemium Enforcement
1. `usage_meters` table and upsert-increment pattern
2. `organisations.plan` field and plan-check middleware
3. Free tier: reject match run if `runs_used >= 1` for current month
4. Frontend: usage indicator ("1 of 1 free run used"), upgrade prompt

**Gate:** Free-tier org blocked after 1 run; paid org runs without restriction.

### Phase 5: Results Export
1. CSV export (client-side, `papaparse` or manual string build)
2. Excel export (client-side, `xlsx` write mode)
3. PDF export (client-side, `jspdf` + `jspdf-autotable` — bundled, not CDN)

**Gate:** All three export formats produce files that open correctly.

### Phase 6: Polish + Brand
1. PharmIQ design system (teal/amber/navy, Space Grotesk)
2. Dark mode toggle (localStorage persistence)
3. Error states, loading states, empty states
4. Responsive layout

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Accepting org_id from the Request
**What goes wrong:** Frontend or client sends `org_id` in request body; Worker trusts it.
**Why bad:** Any authenticated user can impersonate any organisation by changing one field.
**Instead:** Always read `orgId` from `getAuth(c).orgId` (the verified JWT claim). Never from `c.req.json()` or query params.

### Anti-Pattern 2: Non-Transactional Delete-then-Insert
**What goes wrong:** DELETE all dead-stock rows for a store, then INSERT new rows. If the Worker crashes mid-insert, the store has no data.
**Why bad:** This is the existing Django footgun (`Sale.objects.all().delete()`).
**Instead:** Wrap DELETE + INSERT in a single `BEGIN` / `COMMIT` transaction using `pg`. If the transaction fails, the old data remains intact.

### Anti-Pattern 3: Running Matching in the Free Plan
**What goes wrong:** Workers Free plan has a 10 ms CPU limit. Parsing a 500-row XLSX + running the matching algorithm uses 50–200 ms of CPU.
**Why bad:** Every match run returns a 1102 CPU exceeded error.
**Instead:** The Workers Paid plan is required. It costs $5/month base and provides 30s default CPU time (extendable to 5 min). This is a non-negotiable infrastructure requirement.

### Anti-Pattern 4: Using `@neondatabase/serverless` with Hyperdrive
**What goes wrong:** The NEON serverless driver bypasses Hyperdrive's connection pool via its own HTTP/WebSocket transport.
**Why bad:** Defeats the purpose of Hyperdrive; higher latency than native `pg` through Hyperdrive.
**Instead:** Use `pg` (node-postgres) when Hyperdrive is configured. Reserve `@neondatabase/serverless` for local dev without Hyperdrive.

### Anti-Pattern 5: Hard-Coding the Store List
**What goes wrong:** Store names are defined in source code (`['Balwyn', 'Carnegie', 'Sunshine', 'Trentham']`).
**Why bad:** Adding a store requires a code change and redeployment. This is the exact problem called out in PROJECT.md.
**Instead:** Stores are derived from uploaded data. `GET /api/stores` queries `DISTINCT store_id` from `rou_data` for the org.

### Anti-Pattern 6: Storing Large Files Fully in Worker Memory
**What goes wrong:** A user uploads a 50 MB file, the Worker loads it fully into a buffer.
**Why bad:** Workers have a 128 MB memory limit per isolate; large files plus the JS heap can exceed it.
**Instead:** Enforce a 5 MB file size limit (client-side `file.size` check + server-side `Content-Length` header check). FRED exports for even large pharmacy groups rarely exceed 2 MB.

---

## Scalability Considerations

| Concern | At 10 orgs | At 500 orgs | At 5,000 orgs |
|---------|------------|-------------|---------------|
| DB connections | Hyperdrive pool handles easily | Hyperdrive pool handles easily | Consider NEON connection pooler (PgBouncer) in addition |
| In-memory matching | Fine (<10k rows/org) | Monitor memory; add row count guard | Move matching to SQL (window functions) |
| Usage metering | Simple upsert-increment | Simple upsert-increment | Same pattern, add index on (org_id, period) |
| Multi-tenancy | org_id WHERE clause | org_id WHERE clause + RLS | Add RLS policies as second layer |
| File parsing | In-memory fine | In-memory fine | Consider streaming for very large files |

**NEON RLS as a second layer (medium-term):** Once you have more than ~50 active organizations, add PostgreSQL Row Level Security policies as a defense-in-depth measure. The application-level `WHERE org_id = $orgId` filter remains the primary enforcement; RLS provides a safety net against bugs that accidentally omit the WHERE clause.

---

## Sources

- Cloudflare Hono framework guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
- Hono official docs for Cloudflare Workers: https://hono.dev/docs/getting-started/cloudflare-workers
- @hono/clerk-auth package: https://github.com/honojs/middleware/tree/main/packages/clerk-auth
- Clerk Auth object reference (orgId, userId): https://clerk.com/docs/reference/backend/types/auth-object
- NEON guide for Cloudflare Workers: https://neon.com/docs/guides/cloudflare-workers
- NEON serverless driver docs: https://neon.com/docs/serverless/serverless-driver
- Cloudflare Hyperdrive + NEON: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/
- Cloudflare Workers limits (CPU, memory, request body): https://developers.cloudflare.com/workers/platform/limits/
- SheetJS Cloudflare Workers example: https://git.sheetjs.com/sheetjs/docs.sheetjs.com/src/commit/7f64cfa3c41bbf8c438c20e33a0f122ea1f7cd49/docz/docs/03-demos/30-cloud/14-cloudflare.md
- Hono file upload example: https://hono.dev/examples/file-upload
- PostgreSQL RLS multi-tenant pattern: https://www.thenile.dev/blog/multi-tenant-rls
- NEON multi-tenancy guide: https://neon.com/docs/guides/multitenancy
- Cloudflare Pages monorepo support: https://developers.cloudflare.com/pages/configuration/monorepos/
- Production API on Cloudflare Workers with Hono (2026): https://dev.to/young_gao/building-a-production-api-gateway-on-cloudflare-workers-with-hono-2lhg
- Verifying Clerk JWTs in Cloudflare Workers: https://www.subaud.io/verifying-clerk-jwts-in-cloudflare-workers/

---

*Architecture research: 2026-03-28*
