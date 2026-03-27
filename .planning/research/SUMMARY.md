# Project Research Summary

**Project:** PharmIQ Stock Transfer
**Domain:** Pharmacy dead-stock matching SaaS — B2B freemium, multi-tenant, file-processing on edge serverless
**Researched:** 2026-03-28
**Confidence:** HIGH

## Executive Summary

PharmIQ Stock Transfer is a B2B SaaS tool that solves a narrow, high-value workflow problem for pharmacy groups: matching dead stock at one store to the ROU (rate of usage) demand at other stores, then recommending inter-store transfer quantities capped by a user-set months-of-cover target. The product is a greenfield TypeScript rebuild of an existing Django + SQLite + React (CRA) application, migrating onto the same Cloudflare Workers + NEON Postgres + Clerk stack used by a companion use-by-dates tracker. The core data entry mechanism is manual CSV/XLSX export from FRED Office pharmacy software — there is no API integration path — which means robust, defensively-written file parsing is the single most critical technical problem in the build.

The recommended approach is Hono on Cloudflare Workers (Paid plan required — free plan's 10 ms CPU limit cannot run CSV parsing) with NEON Postgres accessed via the `@neondatabase/serverless` HTTP driver, Drizzle ORM for type-safe queries and migrations, and a React 19 + Vite + Tailwind + shadcn/ui frontend hosted on Cloudflare Pages. File parsing happens in Worker memory using PapaParse (CSV) and SheetJS via CDN tarball (XLSX). All exports are client-side. Multi-tenancy is enforced via Clerk `orgId` from JWT claims — never from request bodies — with `org_id` on every database table. The freemium usage counter (1 match run/month free) must use a Postgres atomic `UPDATE ... RETURNING` pattern, not Cloudflare KV, to avoid race conditions.

The key risks cluster in three areas. First, file parsing on the edge: FRED Office produces UTF-8 BOM CSVs with CRLF line endings and XLSX files with title rows before the header row — all of which will silently produce zero imports unless explicitly handled. Second, multi-tenancy correctness: the existing codebase has no tenancy at all, so every ported query must be audited for `org_id` scoping; the pitfall of `null` orgId from Clerk (user with no active org selected) can corrupt data if not guarded in middleware. Third, the matching algorithm's net allocation logic (allocating dead-stock units across multiple destination stores without double-counting) is the hardest business-logic problem and needs a written spec before implementation.

---

## Key Findings

### Recommended Stack

The stack is constrained to match the companion app's existing Cloudflare infrastructure. All technology choices are verified against official documentation (HIGH confidence throughout).

**Core technologies:**

- **Cloudflare Workers (Paid plan)** — API/backend runtime — edge-deployed V8 isolates; Paid plan required for 30s CPU time (file parsing exceeds free plan's 10 ms limit)
- **Hono 4.12.9** — HTTP framework on Workers — purpose-built for Workers, fastest router (402k ops/sec), first-class TypeScript, official `@hono/clerk-auth` middleware
- **NEON Postgres** — persistent multi-tenant data store — scale-to-zero serverless Postgres, matches companion app, free tier 0.5 GB
- **`@neondatabase/serverless` 1.0.2 (HTTP driver)** — Neon connection from Workers — HTTP over TCP avoids Workers' lack of native TCP; WebSocket Pool variant is unsafe in Workers (no persistent connections)
- **Drizzle ORM 0.45.2** — type-safe query builder and migrations — pure JS (Prisma's query binary incompatible with Workers), schema-as-code, first-class Neon HTTP support
- **Clerk + `@hono/clerk-auth` 3.1.0** — authentication — matches companion app; `@clerk/backend` verifies JWTs locally (no per-request JWKS fetch)
- **React 19 + Vite 8 + `@cloudflare/vite-plugin` 1.30.2** — frontend — replaces unmaintained CRA; Cloudflare Vite plugin GA April 2025; Cloudflare Pages hosting
- **PapaParse 5.5.3** — CSV parsing in Worker — pure JS, no Node deps, confirmed working in Workers
- **SheetJS 0.20.3 (CDN tarball only)** — XLSX parsing in Worker — npm package unmaintained/security-flagged; CDN tarball reads from ArrayBuffer natively
- **`@react-pdf/renderer` 4.3.2** — PDF export — client-side only; Worker-side PDF generation is fragile/unsupported
- **`@tanstack/react-table` 8.21.3** — virtualized results table — prevents DOM explosion on large match result sets
- **Zod 4.3.6** — shared validation — single schema source for Worker request validation and frontend form validation

**Critical version/configuration requirement:** `wrangler.jsonc` must set `"compatibility_flags": ["nodejs_compat"]` and `"compatibility_date": "2025-09-27"` for `@neondatabase/serverless` and SheetJS to work in the Workers runtime.

See `.planning/research/STACK.md` for full alternatives analysis, installation commands, and Workers constraints reference.

---

### Expected Features

The product has a well-defined, narrow feature scope. The existing codebase provides a tested baseline; the rebuild adds months-cover capping, dynamic store lists, and freemium enforcement as net-new requirements.

**Must have (table stakes for v1):**

- CSV/XLSX file upload per store — the only data entry path (no FRED API exists)
- Per-store upload status indicator — shows which stores have fresh vs. stale data
- Months-cover cap input — prevents overstocking receiving stores; core new feature absent from existing app
- Match run trigger (explicit button, not auto) — user controls when matching executes
- Match results table (virtualized) — source store, destination store, SKU, ROU, SOH, recommended transfer qty
- Sell-through filter — only recommend transfers where receiving store ROU >= SOH/12
- Dynamic store list — derived from uploaded data, not hard-coded (current hard-coding is a known regression)
- CSV export of match results — highest priority export; most actionable for operations workflow
- Organisation-scoped data — Clerk org_id on all tables; non-negotiable for hosted multi-tenant deployment
- Clerk authentication — matches companion app; same users and sessions
- Free tier enforcement (1 run/month) — Postgres atomic counter in Worker, not client-side
- Upgrade prompt on limit hit — modal on 429 response with clear Stripe Checkout CTA

**Should have (differentiators for v1/v2):**

- Ranged vs non-ranged product prioritisation — ranged items get priority allocation; existing parsing is brittle and must be fixed
- Net allocation across multiple sources — prevents double-committing dead-stock units to two destinations; hardest logic problem
- Data quality warnings — surface unparseable ROU/SOH values as visible warnings, not silent zeroes
- XLSX export — pharmacy managers prefer Excel; formatted with frozen header row
- Usage counter display — "1 of 1 free run used this month" persistent banner
- Months-cover visualisation in results — derived column showing cover weeks at receiving store
- Stale data warning — flag uploads older than 7 days before allowing a match run

**Defer to v2+:**

- Audit/history trail of past match runs — significant scope; not needed for free tier
- PDF export — useful but CSV and XLSX cover the operations workflow
- Column mapping UI — defer unless header aliasing breaks frequently in testing
- Multi-store comparison visualisation (charts)
- Direct FRED Office API integration — no public API exists; fragile
- Mobile app — match runs happen at a desk; responsive web is sufficient

See `.planning/research/FEATURES.md` for full anti-features list and feature dependency tree.

---

### Architecture Approach

The architecture is a Cloudflare-native monorepo: a Hono Worker API (`apps/api`) handling all business logic and data persistence, and a React + Vite SPA frontend (`apps/web`) hosted on Cloudflare Pages. The database is NEON Postgres with a shared schema (all orgs in the same tables, `org_id` on every row). File parsing runs in Worker memory — files are small enough (FRED exports rarely exceed 2 MB) that R2 storage is deferred to v2. The matching algorithm runs entirely in Worker memory against data fetched from NEON.

**Major components:**

1. **Cloudflare Pages (React + Vite SPA)** — upload UI, match run trigger, virtualized results table, client-side exports (CSV/XLSX/PDF); talks to Worker API via HTTPS + Clerk JWT Bearer token
2. **Cloudflare Worker (Hono API)** — middleware chain (CORS → Clerk JWT verify → orgId guard), upload routes (multipart parse → SheetJS → header aliasing → NEON upsert), match run route (load all org data → run algorithm → write results → increment usage meter), usage enforcement
3. **NEON Postgres** — 7-table shared schema (`organisations`, `stores`, `rou_data`, `deadstock_uploads`, `match_runs`, `match_results`, `usage_meters`); all queries include `WHERE org_id = $orgId` sourced from JWT; `UNIQUE` constraints enable safe upserts; UUID primary keys prevent ID enumeration
4. **Clerk** — user and organisation management; JWT issued by Clerk verified locally in Worker via `@clerk/backend` (no per-request JWKS fetch); `orgId` from JWT is the primary multi-tenancy key
5. **Cloudflare R2** — deferred to v2 for audit trail / file re-processing capability

**Security invariant:** `org_id` is never accepted from the request body or query params. It is always and only read from `getAuth(c).orgId` — the verified Clerk JWT claim.

See `.planning/research/ARCHITECTURE.md` for full schema DDL, data flow diagrams, and anti-patterns reference.

---

### Critical Pitfalls

The top 5 pitfalls by severity and likelihood of hitting them during development:

1. **Accepting `org_id` from the request body (C6 cross-tenant data leak)** — Any authenticated user could read or overwrite another pharmacy group's data by sending a crafted `org_id`. Always read `orgId` exclusively from `getAuth(c).orgId`; add RLS with `FORCE ROW LEVEL SECURITY` as a defence-in-depth layer; use UUIDs (not sequential integers) for all public-facing IDs; write an explicit cross-tenant integration test.

2. **Clerk `orgId` is `null` when user has no active organisation (C5)** — If the frontend never calls `setActive({ organization })`, or the user bypasses the org-selection flow, `orgId` is `undefined`. A Worker that passes `undefined` to `WHERE org_id = $1` creates `NULL`-scoped rows invisible to all queries — silent data loss. Guard every route with a 403 return before any DB operation if `!orgId`.

3. **UTF-8 BOM corrupting the first CSV column header (D1)** — FRED Office exports UTF-8 BOM (`\uFEFF`) as the first byte. PapaParse does not strip it automatically. The first column header becomes `"\uFEFFItem Code"` and the entire file fails to parse silently (0 SKUs imported, no error). Strip BOM before any parsing: `text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text`.

4. **Non-transactional delete-then-insert on upload (D6)** — The existing Django codebase does `DELETE all rows for store X` then `INSERT new rows` with no transaction wrapper. If the insert fails mid-way, the store has zero inventory in the database — the next match run silently excludes it. Use `BEGIN/COMMIT` wrapping the delete+insert, or use upsert (`INSERT ... ON CONFLICT DO UPDATE`) to reduce the inconsistency window to zero.

5. **Race condition on freemium usage counter (C7)** — Two simultaneous "Run Match" clicks both read `count = 0`, both pass the limit check, both execute — free tier is bypassed. Cloudflare KV is eventually consistent and makes this worse. Use a single atomic Postgres `UPDATE ... WHERE runs_used < limit RETURNING runs_used`; if the UPDATE returns 0 rows, the limit is hit — reject with 429.

See `.planning/research/PITFALLS.md` for the full prevention checklist, phase-specific warnings, and 14 additional pitfalls.

---

## Implications for Roadmap

Research across all four files points to a clear 6-phase build order driven by hard infrastructure and logical dependencies. Earlier phases are gate-blocked: nothing in Phase 2 can ship without Phase 1 being correct.

### Phase 1: Foundation and Infrastructure
**Rationale:** The Workers runtime constraints (CPU plan, DB driver choice, Worker body limits) must be locked in before writing any feature code. Getting these wrong requires rewrites. The auth and tenancy security model must be established before any data is stored.
**Delivers:** Working authenticated skeleton — a Hono Worker that returns `{ status: "ok", orgId: "..." }` for an authenticated request; NEON schema with all tables; Cloudflare Pages SPA scaffold with Clerk sign-in.
**Addresses:** Auth (Clerk), org-scoped data, dynamic store list (schema only)
**Avoids:** C2 (CPU plan), C3 (TCP connections), C4 (pooler incompatibilities), C5 (orgId null — middleware pattern established), C6 (RLS in initial schema migration, not added later), S2 (body-read-once Worker pattern established from the start)
**Research flag:** Well-documented patterns — skip phase research. Follow ARCHITECTURE.md Build Order Phase 1 checklist exactly.

### Phase 2: File Upload Pipeline
**Rationale:** File upload is the only data entry path. The matching algorithm cannot be built until store data can be ingested. The parsing layer is where the most FRED-specific pitfalls live.
**Delivers:** Ability to upload ROU and dead-stock CSV/XLSX files for multiple stores; files parsed and upserted to NEON; dynamic store list visible in UI; per-store upload status (timestamp, stale warning).
**Addresses:** CSV/XLSX upload, per-store upload status, stale data warning, dynamic store list fix, `is_ranged` parsing fix
**Avoids:** D1 (BOM stripping), D2 (CRLF normalisation), D3 (blank header rows), D4 (`is_ranged` truthy set), D5 (NaN masking → user-visible warnings), D6 (transactional upload), D7 (dynamic store list)
**Research flag:** BOM/CRLF/header-row handling are well-documented. SheetJS CDN tarball is MEDIUM confidence — test with real FRED exports early and be prepared to work around parsing edge cases.

### Phase 3: Matching Algorithm
**Rationale:** The core product value. Depends on Phase 2 data being reliably in the database. The months-cover cap and net allocation logic are net-new features not in the existing codebase — they need to be specced before coding.
**Delivers:** "Run Match" button that executes the algorithm against all org data; results stored in NEON; virtualized results table displaying matches with source/destination store, SKU, transfer qty, and months-cover derived column.
**Addresses:** Match run trigger, months-cover cap input, sell-through filter, ranged-product prioritisation, match results table, net allocation logic, data quality warnings in results
**Avoids:** C2 (CPU profiling — algorithm must fit in 30s on Paid plan), anti-pattern of accepting orgId from request body
**Research flag:** Net allocation algorithm needs a written spec before implementation. The greedy allocation logic across N sources × M destinations is domain-specific with no single reference implementation. Recommend writing and unit-testing the matcher in isolation before wiring to the API.

### Phase 4: Freemium Enforcement
**Rationale:** Must be built before any non-test users are onboarded. Free tier enforcement is backend-only and cannot be deferred safely.
**Delivers:** Free-tier gate (1 match run/month) enforced in Worker via atomic Postgres counter; 429 response with upgrade prompt modal; usage counter display banner; `organisations.plan` field for paid vs. free distinction.
**Addresses:** Free tier enforcement, upgrade prompt, usage counter display
**Avoids:** C7 (KV race condition — Postgres atomic UPDATE pattern used from the start)
**Research flag:** Standard pattern. No additional research needed beyond PITFALLS.md C7 and FEATURES.md usage metering notes.

### Phase 5: Results Export
**Rationale:** Exports are the delivery mechanism for match results. CSV is the highest-priority format (importable into POS systems, shareable by email). XLSX and PDF follow.
**Delivers:** Client-side CSV export (highest priority), client-side XLSX export (formatted with frozen header), client-side PDF export (via `@react-pdf/renderer`).
**Addresses:** CSV export, XLSX export, PDF export
**Avoids:** Anti-pattern of Worker-side PDF generation (fragile, avoid); SheetJS CDN tarball already in stack from Phase 2 — reuse for XLSX write mode
**Research flag:** CSV and XLSX are standard. PDF rendering with `@react-pdf/renderer` is MEDIUM confidence for complex table layouts — prototype the results table PDF early to validate the approach.

### Phase 6: Polish and Production Readiness
**Rationale:** Brand consistency, error states, and performance matter for B2B users who need to trust the tool. This phase addresses the non-functional requirements.
**Delivers:** PharmIQ design system applied (teal/amber/navy, Space Grotesk); dark mode; comprehensive error, loading, and empty states; responsive layout at 1280px+; cross-tenant integration test suite; production NEON branch with scale-to-zero disabled.
**Addresses:** Responsive web UI, error state UX, upgrade prompt polish
**Avoids:** S4 (NEON scale-to-zero cold start on production branch), S5 (wrangler dev hiding CPU/memory limits — establish staging environment testing with real FRED exports)
**Research flag:** Standard front-end polish patterns. No research needed.

---

### Phase Ordering Rationale

- **Infrastructure before features:** Workers CPU plan, DB driver, and auth middleware choices affect every subsequent phase. Getting them wrong after data exists is a rewrite, not a fix.
- **Parsing before matching:** The algorithm is useless without reliable data ingestion. The FRED-specific parsing pitfalls (BOM, CRLF, title rows, `is_ranged` variants) must be solved at Phase 2 before any matching logic is written.
- **Matching before billing:** The freemium gate blocks the algorithm — both must exist before real user testing, but the algorithm must be correct before the gate is meaningful.
- **Exports last:** Client-side exports have no server dependencies and can be built independently; they are not on the critical path.
- **Algorithm spec before Phase 3 coding:** Net allocation logic is the only area without a reference implementation. Write a spec (edge cases: one source, multiple destinations; partial allocation when source can't cover all destinations; ranged-item priority ordering) before writing TypeScript.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Matching Algorithm):** Net allocation logic across N sources / M destinations is domain-specific and underdocumented. Needs a written spec with worked examples before implementation. Consider a `/gsd:research-phase` to document the algorithm design.

Phases with standard patterns (skip research-phase):
- **Phase 1:** All patterns verified against official Cloudflare, NEON, and Clerk documentation.
- **Phase 2:** CSV/XLSX parsing patterns are well-established; FRED-specific quirks are documented in PITFALLS.md.
- **Phase 4:** Freemium Postgres counter pattern is standard; documented fully in PITFALLS.md C7.
- **Phase 5:** Client-side exports use libraries already in the stack; no new research needed.
- **Phase 6:** Standard front-end polish; no research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry and official Cloudflare/NEON/Clerk docs. One MEDIUM item: SheetJS CDN tarball installation is non-standard and vendor-locked to a CDN. |
| Features | HIGH (core), MEDIUM (net allocation) | Core matching/upload/export patterns confirmed by working codebase. Net allocation algorithm design is domain-specific and underdocumented — needs a spec. |
| Architecture | HIGH | All patterns verified against official docs. Minor tension between STACK.md (favours `@neondatabase/serverless` HTTP driver) and ARCHITECTURE.md (favours Hyperdrive + `pg`) — resolved below. |
| Pitfalls | HIGH | All critical pitfalls sourced from official documentation or confirmed GitHub issues. FRED-specific parsing pitfalls (BOM, CRLF, title rows) are real and documented. |

**Overall confidence:** HIGH

### Stack Driver Tension: HTTP Driver vs Hyperdrive

STACK.md recommends `@neondatabase/serverless` (HTTP driver) as simpler for this workload. ARCHITECTURE.md recommends Cloudflare Hyperdrive + `pg` for lower latency. **Resolution:** Start with `@neondatabase/serverless` HTTP driver for v1 (simpler, no Hyperdrive configuration dependency). Switch to Hyperdrive + `pg` if query latency becomes measurable under load. This is not a rewrite — it is a driver swap at the `db.ts` factory layer, isolated by Drizzle ORM.

### Gaps to Address

- **Net allocation algorithm spec:** The greedy/priority-queue algorithm for allocating dead-stock units across multiple destination stores is not documented in any research source. Write a spec with worked examples and edge cases before Phase 3 implementation. Validate against the existing Django `find_transfer_matches` function as a baseline.

- **Months-cover cap formula validation:** The formula `max_transfer = (months_cover × ROU) − receiving_store_SOH` is derived from domain logic in the existing app. Confirm with a domain expert (the pharmacy group operations manager) that this formula correctly handles edge cases: what if `receiving_store_SOH` is already greater than `months_cover × ROU`? (Answer should be: skip that store — max_transfer is negative, clamp to 0.) Add this as a unit test.

- **FRED export field name variations:** `is_ranged` truthy values are researched and a normalisation set is defined, but the full set of possible column name variants across FRED Office versions is not exhaustively documented. Plan for early testing with actual FRED exports from at least two pharmacy clients to catch any unlisted variants before launch.

- **Stripe integration scope:** FEATURES.md specifies a flat subscription (free → paid, simple Stripe Checkout link). The exact Stripe product/price IDs, webhook events, and plan-check mechanism (how `organisations.plan` is updated when payment succeeds) are not specced. This needs to be designed during Phase 4 planning. Stripe webhooks require a Worker endpoint and a `STRIPE_WEBHOOK_SECRET` — not complex, but not yet researched.

---

## Sources

### Primary (HIGH confidence)

- Cloudflare Workers limits and CPU opt-in: https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/changelog/post/2025-03-25-higher-cpu-limits/
- Neon + Cloudflare Workers guide: https://neon.com/docs/guides/cloudflare-workers
- Drizzle ORM + Neon: https://orm.drizzle.team/docs/connect-neon
- Cloudflare Hyperdrive + NEON: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/
- Hono on Cloudflare Workers: https://hono.dev/docs/getting-started/cloudflare-workers and https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
- @hono/clerk-auth: https://github.com/honojs/middleware/tree/main/packages/clerk-auth
- Clerk Auth object reference: https://clerk.com/docs/reference/backend/types/auth-object
- Cloudflare Vite plugin (GA April 2025): https://developers.cloudflare.com/changelog/post/2025-04-08-vite-plugin/
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- SheetJS Cloudflare Workers demo: https://git.sheetjs.com/sheetjs/docs.sheetjs.com/src/commit/7f64cfa3c41bbf8c438c20e33a0f122ea1f7cd49/docz/docs/03-demos/30-cloud/14-cloudflare.md
- KV eventual consistency (counter unsuitability): https://developers.cloudflare.com/kv/concepts/how-kv-works/
- PostgreSQL atomic UPDATE: https://brandur.org/postgres-atomicity
- Multi-tenant RLS: https://www.thenile.dev/blog/multi-tenant-rls

### Secondary (MEDIUM confidence)

- BOM in PapaParse (GitHub issue #840): https://github.com/mholt/PapaParse/issues/840
- Clerk orgId undefined GitHub issue: https://github.com/clerk/javascript/issues/1351
- SheetJS blank row handling: https://github.com/SheetJS/sheetjs/issues/1078
- Freemium upgrade prompt UX: https://www.appcues.com/blog/best-freemium-upgrade-prompts
- Usage tracking implementation: https://useautumn.com/how-to-implement-usage-tracking-and-limits
- Kalzumeus CSV/Excel upload UX: https://www.kalzumeus.com/2015/01/28/design-and-implementation-of-csvexcel-upload-for-saas/

### Tertiary (LOW confidence / needs validation during implementation)

- FRED Office export field name variants: no single authoritative source; inferred from existing Django codebase and general FRED documentation
- Net allocation algorithm design: derived from existing `find_transfer_matches` function logic; no external reference implementation

---
*Research completed: 2026-03-28*
*Ready for roadmap: yes*
