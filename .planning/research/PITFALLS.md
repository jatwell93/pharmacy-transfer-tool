# Domain Pitfalls: PharmIQ Stock Transfer

**Domain:** Pharmacy dead-stock matching SaaS — file-processing and multi-tenant data on Cloudflare Workers + NEON + Clerk
**Researched:** 2026-03-28
**Confidence:** HIGH (all critical pitfalls sourced from official Cloudflare, NEON, and Clerk documentation)

---

## Critical Pitfalls

Mistakes that cause rewrites, silent data leaks, or production outages.

---

### Pitfall C1: Buffering the Entire File in the Worker — OOM Kill

**What goes wrong:** A Worker reads `await request.arrayBuffer()` or `request.text()` on the incoming CSV/XLSX before any processing. FRED Office XLSX exports for a multi-store group can be several megabytes. SheetJS loads the full workbook into a JS heap object model on top of the raw buffer. Combined buffer + parsed model can easily push past the 128 MB per-isolate limit, killing the Worker mid-request and returning a 500 to the client with no useful error message.

**Why it happens:** Developers copy patterns from Node.js server code where memory is not capped at 128 MB. The limit is per-isolate, not per-request — but under load a single isolate handles concurrent requests, so two simultaneous uploads can push memory usage to 256 MB effectively.

**Consequences:** Silent Worker death, no upload confirmation, no partial state — user retries and doubles the problem.

**Prevention:**
- Use R2 multipart upload rather than passing the raw file through the Worker body. The client uploads directly to R2 (via a pre-signed URL issued by the Worker), and the Worker only processes row-by-row streaming reads from R2 after the file lands.
- For CSV: use a streaming parser (PapaParse's `step` callback mode, or `csv-parse` with Node Streams) rather than `parse(fullText)`.
- For XLSX: SheetJS does NOT support true streaming reads for `.xlsx` (only for SpreadsheetML2003 / `.xlsb` streaming write). The FRED XLSX exports should be capped in upload validation at 25 MB. Above that, reject with a user-facing error recommending CSV export instead.
- Set an explicit 25 MB upload size guard in the Worker before any parsing begins.

**Detection warning signs:**
- Worker returns 500 with no body (not a 4xx, not a JSON error).
- `wrangler tail` shows `Worker exceeded memory limit`.
- Errors appear only on large uploads, not small test files.

**Phase:** Phase 1 (file upload infrastructure). Non-negotiable before any production upload endpoint ships.

---

### Pitfall C2: CPU Time Exhaustion on Free Plan — Row-by-Row Processing

**What goes wrong:** The free Cloudflare Workers plan has a **10 ms CPU limit per request** (as of March 2026). Synchronous CSV parsing, header detection loops, and the matching algorithm (N stores × M SKUs) are all pure CPU work. A 500-row ROU file across 6 stores will exceed 10 ms of CPU in a naive implementation.

**Why it happens:** The old Django code ran synchronously in a thread where CPU time was unbounded. Workers measure actual CPU time — I/O await time (database queries, fetch calls) does not count, but all JavaScript execution does.

**Key fact:** The Workers Paid plan (Standard) allows up to **30 seconds of CPU by default**, configurable to **5 minutes (300,000 ms)** via `cpu_ms` in `wrangler.toml`. This change was released March 2025. For this project, the Paid plan is required for any non-trivial file parsing.

**Consequences:** `Worker exceeded CPU time limit` error — request fails, no data saved, user sees 500.

**Prevention:**
- Move to the **Workers Paid plan** before shipping file processing. Set `cpu_ms = 10000` (10 seconds) in `wrangler.toml` as a starting point — adequate for CSV parsing of realistic FRED exports.
- Offload the **matching algorithm** (the N×M cross-store scan) to a separate Worker invocation triggered after all files are uploaded, or use Cloudflare Workflows for multi-step orchestration.
- Avoid `df.iterrows()` equivalents in JS — use array methods (`map`, `filter`, `reduce`) over objects rather than per-row property access loops.
- The header-detection scan (`find_header_row`) must short-circuit after the first 20 rows — FRED exports put headers in rows 1–3.

**Detection warning signs:**
- `Worker exceeded CPU time limit` in `wrangler tail`.
- Works fine locally (`wrangler dev`) but fails in production (dev has no CPU limit).
- Failures correlate with file size, not network conditions.

**Phase:** Phase 1 (infrastructure setup) — set `cpu_ms` and plan tier before writing any parsing code.

---

### Pitfall C3: Using Standard TCP Connections to NEON from Workers

**What goes wrong:** A developer installs `pg` (node-postgres) and points it at the NEON connection string without Hyperdrive. Each Worker invocation creates a new TCP connection, which requires a TLS handshake (100–300 ms round trips). Under load, every Worker spawns its own connections — NEON's `max_connections` (typically 100–400 on small compute sizes) gets exhausted and new requests get `sorry, too many clients already`.

**Why it happens:** `pg` is the familiar Postgres driver. The error only appears under concurrent load, not during single-request development testing.

**Consequences:** Database connection exhaustion. All new requests return 500. Existing connections are not affected immediately but the system appears down to new users.

**Prevention (choose one):**

Option A — **Neon serverless driver** (`@neondatabase/serverless`): Connects over HTTP or WebSocket instead of TCP. No persistent connections. Zero connection state leftover between requests. Use this for the initial build.

```typescript
import { neon } from '@neondatabase/serverless';
const sql = neon(env.DATABASE_URL);
const rows = await sql`SELECT * FROM uploads WHERE org_id = ${orgId}`;
```

Option B — **Cloudflare Hyperdrive**: Cloudflare maintains a global pool of warm Postgres connections. Workers connect to the nearest Hyperdrive node over a fast internal path. Use `pg` normally — Hyperdrive handles pooling. Adds $0.60/million rows but removes all cold-start connection overhead. Recommended when query volume grows.

**Never do:** `new Pool({ connectionString, max: 10 })` at module scope in a Worker. The Pool persists across requests in the same isolate but there is no guaranteed isolate reuse — you will create unbounded pools.

**Detection warning signs:**
- `sorry, too many clients already` in NEON logs.
- Errors appear only under concurrent load (2+ simultaneous uploads).
- NEON dashboard shows connections spiking to `max_connections` then dropping after Workers time out.

**Phase:** Phase 1 (database setup). Use the serverless driver from day one — switching later requires touching every DB call.

---

### Pitfall C4: NEON Connection Pooler Breaks SET search_path and Prepared Statements

**What goes wrong:** NEON's built-in pooler (PgBouncer) operates in **transaction mode only**. Any SQL feature that relies on a persistent session context is silently broken:
- `SET search_path TO myschema` — context lost after the transaction; next query uses the default schema.
- SQL-level `PREPARE / EXECUTE` — not supported in transaction mode.
- `LISTEN / NOTIFY` — dropped.
- Temporary tables — not preserved across transactions.
- `WITH HOLD` cursors — not supported.

**Why it happens:** Developers connecting via the pooled connection string (`-pooler.` in the hostname) assume it behaves like a direct connection. Everything works during development (single user, single connection), but `SET` context loss appears as "table not found" errors in production.

**Consequences:** Schema routing breaks if you use schemas for tenant isolation. ORM-level `SET` calls (e.g., Drizzle's `SET search_path`) silently stop working.

**Prevention:**
- Fully qualify all table names (`public.uploads`, not just `uploads`).
- Do not use SQL-level `PREPARE/EXECUTE` — use driver-level prepared statements instead (these work fine with PgBouncer).
- For multi-tenant RLS (if adopted), pass tenant context via `SET LOCAL app.current_org_id = $1` **within the same transaction** — `SET LOCAL` is scoped to the transaction and is safe in transaction mode.
- Use the direct (non-pooled) connection string for schema migrations and `pg_dump` — these require session mode.

**Detection warning signs:**
- `relation "uploads" does not exist` errors after migrating to pooled connection string.
- Auth context lost mid-session (RLS claims not propagating).
- Migrations run fine from CLI but queries fail in production.

**Phase:** Phase 1 (database setup). Document the two connection strings (pooled vs direct) in environment variable naming conventions from the start.

---

### Pitfall C5: Clerk orgId Is Null When User Has No Active Organization

**What goes wrong:** The Clerk JWT `o` (organization) claim is **only present when the user has an active organization selected**. If the user signs in without selecting an org, or if the front-end never calls `setActive({ organization: org.id })`, the `orgId` field on the auth object is `null`. A Worker that does `const { orgId } = auth; db.query('... WHERE org_id = $1', [orgId])` will insert/query with `org_id = NULL` — matching every row or inserting into a NULL-scoped bucket.

**Why it happens:** Clerk documentation focuses on the happy path. The GitHub issue `clerk/javascript#1351` ("Org ID in auth object is undefined, even though user is member of org") shows this bites real teams. The `org` claim is intentionally omitted (not null) when inactive — a missing key reads as `undefined` in JS, which is `=== null` in loose comparisons.

**Consequences:**
- Data inserted under `org_id = NULL` is effectively global — visible to all tenants doing `WHERE org_id = $1` with NULL inputs (because `NULL = NULL` is false in SQL, so those rows are invisible too, creating data loss).
- Catastrophic cross-tenant data access if your WHERE clause uses `= $1` and someone passes NULL.

**Prevention:**
- In every authenticated Worker route, validate `orgId` is a non-null string **before** any database operation. Return HTTP 403 if missing.

```typescript
const { orgId, userId } = auth;
if (!orgId) {
  return new Response(JSON.stringify({ error: 'No active organization' }), { status: 403 });
}
```

- On the React front-end, gate the upload UI behind `organization.id` being non-null. Show an org-picker if the user has no active org.
- Never use `org_id IS NULL` as a valid tenant identifier in your schema.

**Detection warning signs:**
- Uploads appear to succeed but no data visible when re-fetching.
- `org_id` column in NEON shows `NULL` rows.
- Works for the first user you test but fails when a second org's user is added.

**Phase:** Phase 2 (auth integration). Add the `orgId` guard as a middleware helper, not inline in each route.

---

### Pitfall C6: Missing org_id in WHERE Clauses — Cross-Tenant Data Leakage

**What goes wrong:** A developer writes `SELECT * FROM store_uploads WHERE upload_id = $1` to fetch an upload by ID, forgetting to add `AND org_id = $2`. Any authenticated user who guesses or enumerates upload IDs can read another pharmacy group's dead-stock data. With sequential integer IDs, enumeration is trivial.

**Why it happens:** The existing Django codebase has zero tenancy — all queries are unscoped. Porting queries to the new stack without adding `org_id` is the path of least resistance, especially under time pressure.

**Consequences:** Complete cross-tenant data leak. For a pharmacy application, this exposes commercially sensitive stock levels and pricing to competitors. Regulatory exposure under Australian Privacy Act.

**Prevention:**
- Enforce `org_id` at the **PostgreSQL schema level** using Row Level Security (RLS). Even if application code forgets the clause, RLS blocks the query.

```sql
-- Enable RLS on every tenant-scoped table
ALTER TABLE store_uploads ENABLE ROW LEVEL SECURITY;
FORCE ROW LEVEL SECURITY; -- table owner cannot bypass

-- Policy: only see rows for the current org
CREATE POLICY tenant_isolation ON store_uploads
  USING (org_id = current_setting('app.current_org_id'));
```

- Set the context before every query:

```typescript
await sql`SET LOCAL app.current_org_id = ${orgId}`;
```

- Use `FORCE ROW LEVEL SECURITY` — without `FORCE`, the table owner role bypasses policies silently. This is the most common RLS mistake.
- Use UUIDs (not sequential integers) for all public-facing IDs. UUIDs are not enumerable.
- Write integration tests that explicitly attempt cross-tenant access and assert 0 rows returned.

**Detection warning signs:**
- Any query that takes only `id` as a parameter and returns a single row (no `org_id` in WHERE).
- Zero rows returned for a known-good ID — may indicate someone else's `org_id` was accidentally set in context.
- RLS configured but `FORCE` not set — table owner queries bypass it silently.

**Phase:** Phase 2 (auth + tenancy). RLS policies should be in the initial schema migration, not added later.

---

### Pitfall C7: Race Condition on Freemium Usage Counter

**What goes wrong:** The free tier allows 1 match run per month per org. A naive implementation reads the counter, checks it, then increments it in two separate queries. If two simultaneous requests arrive (e.g., a user double-clicks "Run Match"), both read `count = 0`, both pass the check, both run the match, and both increment — leaving the counter at 2 after two "free" runs, or at 1 after two full runs (only one counted).

Workers KV is **eventually consistent** with last-write-wins semantics. Storing the counter in KV and doing a read-check-write is not atomic. Under concurrent load, increments are silently lost.

**Why it happens:** Standard "check then act" logic is not atomic in distributed systems. The problem is invisible during single-user testing.

**Consequences:** Free users get unlimited match runs; paid upgrade conversion is lost; billing model is undermined.

**Prevention — use PostgreSQL atomic check-and-increment:**

```sql
-- Atomic: increment only if under limit, return new count
UPDATE org_usage
SET match_runs_this_month = match_runs_this_month + 1
WHERE org_id = $1
  AND billing_period = date_trunc('month', now())
  AND match_runs_this_month < $2  -- $2 = limit (1 for free, 999999 for paid)
RETURNING match_runs_this_month;
```

If the UPDATE returns 0 rows, the limit is already reached — reject. If it returns a row, the increment was applied atomically. `UPDATE` acquires a row-level write lock, making this safe under concurrent requests.

**Do NOT use KV for counters.** KV is last-write-wins and is not suitable for atomic increment operations (confirmed in Cloudflare's own documentation). Use KV only for read-heavy, rarely-changed data.

If Durable Objects are acceptable complexity, a single DO per org can serialize counter updates with strong consistency — but the Postgres `UPDATE ... RETURNING` pattern is simpler and sufficient for this use case.

**Detection warning signs:**
- Counter value inconsistent with actual run count when checked in NEON dashboard.
- Free users able to run match more than once per billing period.
- Count appears correct under sequential testing but drifts under load testing with concurrent requests.

**Phase:** Phase 3 (billing/freemium). Implement the atomic SQL pattern from day one, not after finding the race in QA.

---

## Stack-Specific Gotchas

Mistakes that are specific to this technology combination and not obvious from general web development experience.

---

### Gotcha S1: JWKS Fetched on Every Request — Clerk Cold Starts and Rate Limiting

**What goes wrong:** Clerk JWTs are verified by checking the signature against the JWKS (JSON Web Key Set) from `https://[your-clerk-domain]/.well-known/jwks.json`. A naive implementation fetches the JWKS on every incoming request. At scale, this:
1. Adds 100–300 ms of latency per request (external HTTPS fetch).
2. Can trigger Clerk's rate limiting on the JWKS endpoint.
3. Can return a stale or rotating key if the cache is not keyed by `kid` (key ID).

**Prevention:**
- Use `@clerk/backend` SDK's `authenticateRequest()` — it handles JWKS caching internally, keying by `kid` claim in the JWT header.
- If implementing manually, cache the JWKS in Cloudflare KV with a TTL of 1 hour. When a JWT arrives with an unknown `kid`, refetch from Clerk and update the cache (this handles key rotation gracefully).
- Never cache the raw key string — cache the full JWKS and match by `kid` to avoid using a rotated/expired key from stale cache.

**Detection warning signs:**
- Auth endpoints measurably slower than non-auth endpoints under `wrangler tail`.
- Occasional 401s on valid tokens during Clerk key rotation (6-week cycle by default).
- Clerk dashboard shows unexpectedly high JWKS endpoint traffic.

**Phase:** Phase 2 (auth integration). Use `@clerk/backend` rather than rolling manual JWT verification.

---

### Gotcha S2: Worker Request Body Consumed Once — Cannot Read Twice

**What goes wrong:** In Workers, `request.body` is a `ReadableStream` that can only be consumed once. Code that does `const text = await request.text()` followed by `const formData = await request.formData()` throws a `TypeError: body used already` on the second call. This is a common mistake when porting Express middleware patterns to Workers.

**Prevention:**
- Parse the body exactly once, at the start of the handler. Extract all needed data in that single parse.
- For multipart uploads, call `await request.formData()` once and extract all fields and files from the `FormData` object before passing anything downstream.
- If body content is needed in multiple places, convert to a buffer first and create new `Request` objects wrapping it if necessary.

**Detection warning signs:**
- `TypeError: body used already` in Worker logs.
- Upload handler works in isolation but fails when auth middleware also tries to read headers or body.

**Phase:** Phase 1 (file upload handler architecture).

---

### Gotcha S3: Cloudflare Account Plan Controls Upload Body Limit, Not Workers Plan

**What goes wrong:** The Workers Paid plan (Standard) does NOT raise the request body size limit. The limit is controlled by the **Cloudflare account plan**:
- Free / Pro: 100 MB
- Business: 200 MB
- Enterprise: 500 MB (adjustable)

A FRED Office XLSX export for a pharmacy group with 8–10 stores, including multiple ROU and dead-stock files, could realistically be 10–40 MB total. Individual files are unlikely to exceed 100 MB, but the limit is worth knowing.

**Prevention:**
- Use pre-signed R2 upload URLs for files. The client uploads directly to R2, bypassing the Worker body limit entirely. The Worker only receives a notification (small JSON payload) after the upload completes.
- Enforce a server-side file size guard (e.g., 25 MB per file) before parsing — consistent with what FRED exports realistically produce.

**Detection warning signs:**
- `413 Request entity too large` returned by Cloudflare's edge (not the Worker) for large uploads.
- The error occurs before the Worker code runs — no Worker logs will appear.

**Phase:** Phase 1 (file upload infrastructure). Decide pre-signed URL vs direct-through-Worker early; changing later requires front-end changes.

---

### Gotcha S4: NEON Scale-to-Zero Cold Start on Free / Hobby Branch

**What goes wrong:** NEON's free tier and non-production branches scale the compute to zero after a period of inactivity. The first query after scale-to-zero requires waking the compute (typically 500 ms–2 seconds). This cold start is visible to users as a slow first request and can cause timeouts in CI environments.

**Prevention:**
- Disable scale-to-zero on the production branch (available on paid NEON plans).
- Use the **pooled connection string** (`-pooler.neon.tech` in hostname) — PgBouncer maintains warm connections, masking cold starts for the database layer.
- In CI/CD, add a warm-up query before running integration tests: `SELECT 1`.

**Detection warning signs:**
- First request after any idle period is 2–3 seconds; subsequent requests are <100 ms.
- Integration tests fail intermittently with connection timeout on the first test only.

**Phase:** Phase 1 (database infrastructure). Configure scale-to-zero policy before any load testing.

---

### Gotcha S5: wrangler dev Does Not Enforce CPU or Memory Limits

**What goes wrong:** `wrangler dev` runs Workers locally without enforcing the 10 ms (free plan) or 30 s (paid plan) CPU time limits, and without the 128 MB memory cap. Code that passes all local tests fails in production with `Worker exceeded CPU time limit` or `Worker exceeded memory limit`.

**Prevention:**
- Always test file parsing with realistic FRED export files, not toy CSVs.
- Use `wrangler deploy --dry-run` to check bundle size.
- Add a performance timing wrapper around parsing code during development: log how long `Date.now()` spans are for parsing operations. If CPU work (excluding I/O) exceeds 5 seconds on a local machine, it will be proportionally worse on a Worker's vCPU.
- Test with `wrangler tail` after deploying to a staging environment with real files before enabling for production users.

**Phase:** Phase 1 (ongoing). Establish a testing discipline with real FRED exports early.

---

## Data Pitfalls

Parsing and data quality mistakes specific to FRED Office export formats.

---

### Pitfall D1: UTF-8 BOM Corrupts the First Column Header

**What goes wrong:** FRED Office exports CSV files encoded as **UTF-8 with BOM** (byte order mark: `\xEF\xBB\xBF` = `\uFEFF` at the start of the file). The BOM is invisible in text editors that handle it but appears as a garbage prefix on the first column name. PapaParse (without the `skipEmptyLines` + BOM stripping option) returns the first column header as `"\uFEFFItem Code"` instead of `"Item Code"`. Header normalization that expects exact string `"Item Code"` silently fails — the column is treated as unknown and the entire file is unrecognized.

**Why it happens:** Windows software (FRED Office runs on Windows) writes UTF-8 BOM by default. Most CSV parsers on the Node/browser side do not strip BOM automatically unless explicitly configured.

**Consequences:** Silent failure — all rows parsed as "unknown columns", 0 SKUs imported, no error surfaced to user.

**Prevention:**
- Strip the BOM before parsing:
  ```typescript
  function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  }
  ```
- Or use `csv-parse` with `{ bom: true }` option — it handles BOM automatically.
- PapaParse GitHub issue #840 documents this exact failure mode. Do not rely on PapaParse to handle it without explicit stripping.
- Add a test fixture that is a UTF-8 BOM-encoded FRED export.

**Detection warning signs:**
- `"Item Code"` column not recognized but file parses structurally without error.
- First column header contains `\uFEFF` or `ï»¿` (BOM decoded incorrectly as Latin-1).
- Works when file is opened and re-saved by the developer's Mac tool but fails for original FRED exports.

**Phase:** Phase 1 (CSV parsing). Fix before any FRED file is accepted.

---

### Pitfall D2: Windows Line Endings Cause Off-by-One Row Parsing

**What goes wrong:** FRED Office exports use **CRLF (`\r\n`) line endings**. CSV parsers configured for `\n` only will treat the trailing `\r` as part of the last field value in each row — `"SOH\r"` instead of `"SOH"`. This breaks header matching, numeric parsing (` parseFloat("123\r") ` returns NaN), and any string comparison.

**Consequences:** ROU and SOH values silently become NaN, masked by the existing `or 0.0` pattern — all stock quantities appear as zero, match results are empty.

**Prevention:**
- Use a CSV parser that handles CRLF natively (PapaParse and `csv-parse` both do, by default).
- If implementing a custom line splitter, normalize line endings before parsing: `text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')`.
- Add CRLF test fixtures.

**Phase:** Phase 1 (CSV parsing).

---

### Pitfall D3: Blank Header Rows and Title Rows in FRED XLSX Exports

**What goes wrong:** FRED Office XLSX exports frequently include 1–3 rows of report title/metadata before the actual column header row. The existing code implements `find_header_row` to scan for the first row containing recognizable column names. However, SheetJS's `sheet_to_json()` with `{ header: 1 }` returns ALL rows including blanks — if the scan loop does not correctly identify the header row index, data rows are shifted up and parsed as headers (or headers are skipped entirely).

Specific SheetJS behaviour: `sheet_to_json` by default skips blank rows (rows where all cells are empty). However, rows with a single space or hidden formatting are NOT considered blank and are included. A report title row with merged cells will produce a row with only one populated cell — not blank — and can fool a naive "first non-empty row = header" heuristic.

**Prevention:**
- Implement `find_header_row` with a **column name match** heuristic, not just "non-empty row". A header row must contain at least two recognized canonical column names (e.g., `item code` and `rou` or `soh`).
- Add an early exit after scanning 20 rows — if the header is not found in 20 rows, return a user-facing error (not a silent 0-row import).
- Test with actual FRED exports that have title rows, not synthesized CSVs.

**Detection warning signs:**
- All parsed rows have unexpected column names (the title row was mistaken for headers).
- Import succeeds (no error) but 0 SKUs are added to the database.
- Numeric parsing produces all-NaN for numeric columns.

**Phase:** Phase 1 (CSV/XLSX parsing).

---

### Pitfall D4: is_ranged Parsing Accepts Only "checked" — Silently Misclassifies Items

**What goes wrong:** The existing Django code sets `is_ranged = True` only when the Ranged column value is exactly `"checked"` (lowercase). FRED Office may export this field as `"Yes"`, `"TRUE"`, `"1"`, `"Y"`, or a checkbox value depending on export format version and regional settings. All non-`"checked"` truthy values silently map to `is_ranged = False`, demoting ranged items in match ranking.

**Consequences:** Correct transfer recommendations are ranked lower or excluded, reducing the tool's value proposition.

**Prevention:**
```typescript
const RANGED_TRUTHY = new Set(['checked', 'yes', 'true', '1', 'y', 'on']);
const isRanged = RANGED_TRUTHY.has(String(rawValue).trim().toLowerCase());
```
- Test with FRED exports from multiple pharmacy clients — field encoding varies by FRED version.

**Phase:** Phase 1 (data normalization), and verified in Phase 2 (logic audit).

---

### Pitfall D5: NaN Masking Hides Data Quality Problems

**What goes wrong:** The pattern `pd.to_numeric(..., errors='coerce') or 0.0` (and its JS equivalent `parseFloat(val) || 0`) silently replaces bad/missing numeric values with 0. A pharmacy product with a missing ROU value gets treated as having zero usage — it will never match as a valid recipient store, causing missed transfer opportunities. There is no signal to the user that their data file has quality issues.

**Consequences:** Silent degradation of match quality. Pharmacists trust the output and miss legitimate transfers.

**Prevention:**
- Use explicit `isNaN` checks and collect "data quality warnings" as a structured list:
  ```typescript
  if (isNaN(rou) || rou < 0) {
    warnings.push({ row: rowIndex, field: 'ROU', value: rawRou, message: 'Could not parse ROU — row skipped' });
    continue; // skip the row, don't silently substitute 0
  }
  ```
- Return the warning list alongside the upload result so the UI can surface it.
- Treat `ROU = 0` as valid (zero sales rate) but treat `ROU = NaN` as a data error.

**Phase:** Phase 1 (data parsing), with UI surface in Phase 2 (upload UX).

---

### Pitfall D6: Destructive Upload Without Transaction Safety

**What goes wrong:** The existing code does `DELETE all rows for store X, then INSERT new rows`. If the INSERT fails partway through (parsing error, connection drop, CPU limit exceeded), the database is left with 0 rows for that store. The next match run produces incorrect results without any error. This is the exact bug documented in CONCERNS.md — `Sale.objects.all().delete()` with no `transaction.atomic()`.

**Consequences:** Invisible data loss. Match runs appear to succeed but exclude one store's inventory entirely.

**Prevention:**
- Wrap every upload in a **database transaction**: begin transaction, delete old rows for `(org_id, store_id)`, insert new rows, commit. If any step fails, the rollback restores the previous state.
- Use **upsert** (`INSERT ... ON CONFLICT DO UPDATE`) rather than delete+insert where possible — this reduces the window of inconsistency to zero.
- Return the previous row count and new row count in the upload response so the user can verify the import was complete.

**Phase:** Phase 1 (upload endpoint). This is one of the three critical bugs from the existing codebase — do not port it.

---

### Pitfall D7: Hard-Coded Store List Breaks Dynamic Multi-Store Groups

**What goes wrong:** The existing front-end hard-codes `['Balwyn', 'Carnegie', 'Sunshine', 'Trentham']`. PharmIQ's target market is pharmacy groups of varying sizes — 2 stores to 20+. A new client with different store names gets the existing hardcoded list, which produces incorrect filtering and match displays.

**Consequences:** The tool is unusable for any pharmacy group that is not the original test client.

**Prevention:**
- Store list is **derived from uploaded data** — the set of distinct store names seen in uploads for `org_id`.
- The back-end exposes `GET /api/stores` returning `{ stores: string[] }` scoped to the authenticated org.
- Front-end fetches and renders this list dynamically. No store names in source code.

**Phase:** Phase 2 (data model + API). Must be addressed before onboarding any second pharmacy client.

---

## Prevention Checklist

Use this checklist at the start of each phase to verify prior pitfalls have been addressed.

### Phase 1 — File Upload Infrastructure

- [ ] Worker plan set to Paid; `cpu_ms` configured in `wrangler.toml` (prevents C2)
- [ ] Neon serverless driver (`@neondatabase/serverless`) used — no raw `pg` TCP pool (prevents C3)
- [ ] Pooled vs direct connection strings documented and used correctly (prevents C4)
- [ ] File upload goes to R2 via pre-signed URL, not buffered through Worker body (prevents C1, S3)
- [ ] BOM stripping applied before any CSV parsing (prevents D1)
- [ ] CRLF normalization applied before splitting rows (prevents D2)
- [ ] `find_header_row` uses column name matching, not row-non-empty, with 20-row limit (prevents D3)
- [ ] `is_ranged` truthy set covers `checked`, `yes`, `true`, `1`, `y` (prevents D4)
- [ ] NaN detected and surfaced as user-visible warning, not silently zeroed (prevents D5)
- [ ] Every upload wrapped in a database transaction (prevents D6)
- [ ] Worker body read exactly once per request (prevents S2)

### Phase 2 — Auth and Tenancy

- [ ] `@clerk/backend` SDK used for JWT verification with JWKS caching (prevents S1)
- [ ] `orgId` null guard in every authenticated route — 403 if missing (prevents C5)
- [ ] RLS enabled with `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables (prevents C6)
- [ ] `SET LOCAL app.current_org_id` used within transactions for RLS context (prevents C4/C6)
- [ ] All table IDs use UUIDs, not sequential integers (prevents C6 enumeration)
- [ ] Store list derived from uploaded data, not hard-coded (prevents D7)
- [ ] Cross-tenant access integration test: assert 0 rows returned for wrong org (prevents C6)

### Phase 3 — Freemium Billing

- [ ] Usage counter implemented as `UPDATE ... WHERE count < limit RETURNING count` (prevents C7)
- [ ] Counter NOT stored in KV (prevents C7 KV race condition)
- [ ] Billing period reset tested for month boundary edge case (prevents C7)
- [ ] Free tier gate enforced in Worker, not only in front-end (prevents C7 bypass)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| File upload endpoint | C1: OOM on large XLSX | Use R2 pre-signed URLs; reject XLSX > 25 MB |
| CSV/XLSX parsing logic | D1, D2, D3 BOM/CRLF/blank rows | Test with real FRED exports, not synthetic CSVs |
| Database schema design | C4: pooler incompatibilities | Fully qualify all table names; avoid `SET` at session scope |
| Database schema design | C6: missing tenant scoping | Apply RLS with FORCE before any data is written |
| Auth middleware | C5: orgId null | Validate orgId before every DB write; 403 if absent |
| Auth middleware | S1: JWKS per-request | Use `@clerk/backend` SDK, not manual JWT verification |
| Freemium gate | C7: counter race | Postgres `UPDATE ... RETURNING` atomic pattern |
| Matching algorithm | C2: CPU limit | Offload to separate Worker or Workflows; profile CPU cost |
| Multi-store onboarding | D7: hard-coded stores | Derive store list from uploads; no stores in source |

---

## Sources

**Cloudflare Workers limits (CPU, memory, request body):**
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/changelog/post/2025-03-25-higher-cpu-limits/

**NEON connection methods and pooler limitations:**
- https://neon.com/docs/connect/choose-connection
- https://neon.com/docs/connect/connection-pooling
- https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/

**Clerk JWT and multi-tenancy:**
- https://clerk.com/docs/guides/sessions/session-tokens
- https://github.com/clerk/javascript/issues/1351

**R2 limits and multipart upload:**
- https://developers.cloudflare.com/r2/platform/limits/
- https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/

**Multi-tenant RLS:**
- https://www.permit.io/blog/postgres-rls-implementation-guide
- https://www.thenile.dev/blog/multi-tenant-rls

**KV eventual consistency (counter unsuitability):**
- https://developers.cloudflare.com/kv/concepts/how-kv-works/
- https://community.cloudflare.com/t/support-increment-decrement-operations-atomic-counters-in-workers-kv/136192

**Durable Objects counter reliability:**
- https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/

**PostgreSQL atomic UPDATE:**
- https://blog.pjam.me/posts/atomic-operations-in-sql/
- https://brandur.org/postgres-atomicity

**BOM in CSV parsers:**
- https://github.com/mholt/PapaParse/issues/840
- https://github.com/mholt/PapaParse/issues/372
- https://csv.js.org/parse/options/bom/

**SheetJS blank row and header handling:**
- https://github.com/SheetJS/sheetjs/issues/1078
- https://github.com/SheetJS/sheetjs/issues/215

**SheetJS memory limits:**
- https://github.com/SheetJS/sheetjs/issues/1136
- https://docs.sheetjs.com/docs/demos/bigdata/stream/
