---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Insights & Listings
status: executing
stopped_at: "Phase 16 complete"
last_updated: "2026-05-13T00:00:00Z"
last_activity: 2026-05-13 — Phase 16 executed (dept + ranged backend stack + frontend table columns + parser tests)
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-13)

**Core value:** A pharmacy manager uploads all store reports and instantly sees exactly which stores should exchange dead stock — with a months-cover cap so receiving stores never become overstocked.
**Current focus:** Phase 16 complete — ready for Phase 17 (Table Filters + Responsive Layout)

## Current Position

Phase: 16 (complete)
Plan: 16-02
Status: Phase 16 executed — 2/2 plans complete
Last activity: 2026-05-13 — Phase 16 complete: department + ranged fields through full stack

Progress: [##--------] 25% — v1.2 executing

## v1.2 Phases

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 16 | Department + Ranged Column Parsing | TABLE-01, TABLE-02 | Complete |
| 17 | Table Filters + Responsive Layout | TABLE-03..07 | Not started |
| 18 | Ethical Exchange Export | EE-01..04 | Not started |
| 19 | Dead Stock Scorecard | SCORE-01..04 | Not started |

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 07 | 1 | - | - |
| 08 | 1 | - | - |
| 09 | 1 | - | - |
| 12 | 2 | - | - |
| 13 | 2 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01-foundation P01 | 25 | 2 tasks | 14 files |
| Phase 01-foundation P03 | 525004 | 1 tasks | 4 files |
| Phase 02-logic-audit P01 | 160 | 2 tasks | 2 files |
| Phase 02-logic-audit P02 | 135 | 2 tasks | 2 files |
| Phase 03-file-upload-pipeline P01 | 182 | 2 tasks | 4 files |
| Phase 03-file-upload-pipeline P02 | 402 | 2 tasks | 4 files |
| Phase 03-file-upload-pipeline P03 | 60 | 3 tasks | 11 files |
| Phase 03-file-upload-pipeline P04 | 4 | 2 tasks | 2 files |
| Phase 04-matching-algorithm P01 | 268 | 2 tasks | 3 files |
| Phase 04-matching-algorithm P02 | 247 | 2 tasks | 4 files |
| Phase 07-is-ranged-schema-fix P01 | 45 | 4 tasks | 7 files |
| Phase 10 P01 | 10 | 3 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Workers Paid plan is a hard manual prerequisite before Phase 1 can begin — upgrade account before writing any code
- Roadmap: Logic Audit (Phase 2) precedes the algorithm port (Phase 4) — correctness dependency, not optional
- Roadmap: Freemium billing (Phase 5) scoped as its own phase — Stripe integration is non-trivial
- Roadmap: `@neondatabase/serverless` HTTP driver chosen over Hyperdrive for v1 (simpler; swap at db.ts factory layer if latency becomes measurable)
- [Phase 01-foundation]: cloudflarePool used instead of defineWorkersConfig in @cloudflare/vitest-pool-workers@0.13.5 (removed API)
- [Phase 01-foundation]: NEON withOrgContext uses synchronous tx callback returning NeonQueryInTransaction — async callbacks not supported by NEON HTTP transaction API
- [Phase 01-foundation]: authorizedParties set from ALLOWED_ORIGIN env var to prevent Invalid azp errors in production (Clerk JWT azp claim validation)
- [Phase 01-foundation]: allowHeaders and allowMethods added to Worker CORS — required for preflight OPTIONS requests to pass with Authorization header
- [Phase 01-foundation]: clerkMiddleware requires explicit secretKey and publishableKey from c.env in Cloudflare Workers — process.env is unavailable, SDK cannot auto-discover credentials
- [Phase 02-logic-audit]: RouItem.soh added as optional field to support months-cover cap formula, resolving D-03 interface gap from RESEARCH.md Open Question 1
- [Phase 02-logic-audit]: DataQualityWarning mechanism chosen for NaN handling — allows caller to display quality info without aborting match run
- [Phase 02-logic-audit]: Sell-through filter uses inclusive boundary (>= not >) — destination at exact soh/12 boundary is included, matching Django behavior
- [Phase 02-logic-audit]: destSOH defaults to 0 via nullish coalescing when RouItem.soh absent — conservative cap fills to cover target when no destination SOH data
- [Phase 03-file-upload-pipeline]: SheetJS installed from CDN tarball (xlsx-0.20.3) for XLSX parsing in Workers environment
- [Phase 03-file-upload-pipeline]: NaN chosen over 0 for non-numeric rou/soh values to preserve data quality signal for matcher
- [Phase 03-file-upload-pipeline]: File size check done on file.size before arrayBuffer() per RESEARCH Pitfall 3 — prevents Workers memory overflow
- [Phase 03-file-upload-pipeline]: DELETE + UNNEST INSERT pattern used for store data replace — two sequential withOrgContext calls due to synchronous callback constraint
- [Phase 03-file-upload-pipeline]: 413 tests use actual 6 MB File content (not Object.defineProperty mock) — Workers pool environment requires real file size for .size property
- [Phase 03-file-upload-pipeline]: useFetch stabilised with ref pattern to prevent infinite render loop caused by Clerk session refreshes recreating fetchApi on every render
- [Phase 03-file-upload-pipeline]: authorizedParties expanded to include localhost:5173 and localhost:5174 — Vite allocates either port depending on availability
- [Phase 03-file-upload-pipeline]: Org FK upsert added before store insert in upload route — ensures org row exists in NEON before FK constraint is checked on first upload
- [Phase 03-file-upload-pipeline]: 03-03 worktree branch merged to main before verification — upload.ts and index.ts route mount were on a diverged worktree branch
- [Phase 03-file-upload-pipeline]: Mock sequences must be updated whenever route handler adds or reorders withOrgContext calls — comment the call order in each test
- [Phase 04-matching-algorithm]: rou_data query omits is_ranged (column does not exist); RouItem.isRanged set to false for all rou_data rows
- [Phase 04-matching-algorithm]: Warning deduplication uses sku+field composite key Set to prevent duplicate warnings across multi-store match runs
- [Phase 04-matching-algorithm]: overflowY via inline style (not Tailwind class) to combine with calc() maxHeight
- [Phase 04-matching-algorithm]: Flat items array with pre-computed top/height for virtualization — no library dependency
- [Phase 07-is-ranged-schema-fix]: isRanged read from r.is_ranged in match.ts RouItem construction — not hardcoded false (INT-01 fix)
- [Phase 07-is-ranged-schema-fix]: RANGED_TRUTHY Set reused in parseRouFile — mirrors parseDeadStockFile pattern; no duplication
- [Phase 07-is-ranged-schema-fix]: UNNEST boolean array pattern (unnest(boolean[])) used for ROU INSERT is_ranged column — reused from dead_stock INSERT
- [Phase 07-is-ranged-schema-fix]: Ranged-first sort test uses soh:10 (not soh:100) — soh:100 yields minRequiredRou>8, excluding both destination stores via sell-through filter
- [Phase 10]: subscriptions.status DEFAULT changed from 'inactive' to 'free' — aligns with orgs.plan='free' default and billing route logic
- [Phase 10]: schema.sql stores table gains store_number TEXT (nullable) — no migration needed as this is the canonical DDL
- [Phase 16]: Department HEADER_ALIASES uses exact-match strings: ["Department", "Dept", "Dept.", "Drug Dept", "Product Department"] — case-sensitive
- [Phase 16]: department TEXT column on dead_stock is nullable (no DEFAULT) — null from pre-migration rows coerced to "" in match route
- [Phase 16]: MIGRATION APPLIED 2026-05-13: ALTER TABLE dead_stock ADD COLUMN IF NOT EXISTS department TEXT; (run as neondb_owner)

### Roadmap Evolution

- Phase 10 added: fix schema.sql + .dev.vars.example + webhook.test.ts failure + subscriptions.status DEFAULT naming
- v1.2 Phases 16–19 added: department/ranged parsing, table filters, EE export, scorecard

### Pending Todos

- (none — NP-1 and NP-2 resolved 2026-05-13)

### Blockers/Concerns

- Manual action required: Cloudflare Workers account must be upgraded to the Paid plan before Phase 1 execution. Free plan's 10 ms CPU limit prevents CSV/XLSX parsing from running.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260513-q01 | Phase 14 gap closure — D-13, D-14, test mock regression | 2026-05-13 | (see below) | [260513-q01-phase14-gap-closure](./quick/260513-q01-phase14-gap-closure/) |

## Session Continuity

Last session: 2026-05-13
Stopped at: Phase 16 complete — ready for Phase 17 (Table Filters + Responsive Layout)
Resume file: None
