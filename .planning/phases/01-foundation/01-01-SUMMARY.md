---
phase: 01-foundation
plan: 01
subsystem: api
tags: [hono, clerk, neon, postgres, rls, workers, vitest, auth, jwt]

# Dependency graph
requires: []
provides:
  - Hono Worker entry point with CORS and two-stage Clerk auth middleware chain
  - clerkAuth middleware with authorizedParties for azp JWT claim validation (prevents production 401s)
  - requireOrg middleware returning 401 for missing JWT, 403 for missing orgId
  - GET /api/health smoke-test route returning verified orgId
  - withOrgContext NEON DB client with RLS context injection via set_config in transaction
  - Full v1 NEON schema SQL: 6 tables with RLS policies, indexes, and pharmiq_app role
  - Vitest test suite running in Workers runtime with 4 passing auth tests
affects: [01-02, 01-03, 02-logic-audit, 03-upload, 04-algorithm, 05-billing]

# Tech tracking
tech-stack:
  added:
    - hono@4.12.9 (Hono Worker framework)
    - "@hono/clerk-auth@3.1.0" (Clerk JWT middleware for Hono)
    - "@clerk/backend@3.2.3" (Clerk server-side SDK)
    - "@neondatabase/serverless@1.0.2" (NEON HTTP driver)
    - wrangler@4.63.0 (Cloudflare Workers CLI)
    - "@cloudflare/vitest-pool-workers@0.13.5" (Workers runtime test pool)
    - vitest@4.1.2 (test framework)
  patterns:
    - Two-stage auth middleware (clerkAuth verifies JWT with azp -> requireOrg checks orgId)
    - NEON HTTP synchronous transaction callback pattern for RLS context injection
    - vi.mock('@hono/clerk-auth') passthrough for unit testing auth middleware

key-files:
  created:
    - apps/worker/src/index.ts
    - apps/worker/src/middleware/auth.ts
    - apps/worker/src/routes/health.ts
    - apps/worker/src/db/client.ts
    - apps/worker/src/db/schema.sql
    - apps/worker/src/types.ts
    - apps/worker/vitest.config.ts
    - apps/worker/src/__tests__/auth.test.ts
    - apps/worker/src/__tests__/health.test.ts
    - apps/worker/.dev.vars.example
    - apps/worker/package.json
    - apps/worker/tsconfig.json
    - apps/worker/wrangler.jsonc
    - apps/worker/worker-configuration.d.ts
  modified: []

key-decisions:
  - "Use cloudflarePool from @cloudflare/vitest-pool-workers@0.13.5 instead of defineWorkersConfig (removed in v0.13.x)"
  - "Add type:module to package.json so ESM-only @cloudflare/vitest-pool-workers loads correctly"
  - "NEON transaction callback must be synchronous — withOrgContext API uses fn(tx) returning NeonQueryInTransaction, not async Promise"
  - "authorizedParties set from ALLOWED_ORIGIN env var — critical to prevent Invalid azp error in production (RESEARCH Pitfall 6)"

patterns-established:
  - "Pattern 1: All /api/* routes go through clerkAuth then requireOrg — auth is centralized, never opt-in per route"
  - "Pattern 2: withOrgContext wraps every DB call to inject RLS context — org isolation enforced at DB layer"
  - "Pattern 3: NEON synchronous transaction pattern: sql.transaction(tx => [tx`SET ...`, fn(tx)]) — async callbacks are not supported"

requirements-completed: [AUTH-02, AUTH-03]

# Metrics
duration: 25min
completed: 2026-03-28
---

# Phase 01 Plan 01: Worker Scaffold Summary

**Hono Worker with two-stage Clerk auth (JWT azp validation + org check), NEON HTTP client with RLS set_config injection, full 6-table schema with RLS policies, and 4 passing Vitest tests running in Workers runtime**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-28T15:15:00Z
- **Completed:** 2026-03-28T15:40:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Hono Worker entry point with CORS and two-stage Clerk auth chain verified by tests
- withOrgContext NEON DB client correctly injects org_id into RLS set_config via synchronous transaction
- Full v1 schema SQL for all 6 tables (orgs, stores, rou_data, dead_stock, usage_meters, subscriptions) with RLS policies, indexes, and pharmiq_app role
- 4 auth tests pass in the actual Workers runtime via @cloudflare/vitest-pool-workers

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Worker with auth middleware, NEON client, and schema** - `b6bc3bc` (feat)
2. **Task 2: Auth middleware and health route tests** - `39a6b65` (test)

## Files Created/Modified

- `apps/worker/src/index.ts` - Hono entry with CORS + two-stage auth chain on /api/*
- `apps/worker/src/middleware/auth.ts` - clerkAuth (authorizedParties) + requireOrg (401/403)
- `apps/worker/src/routes/health.ts` - GET /health returning verified orgId
- `apps/worker/src/db/client.ts` - withOrgContext NEON client with RLS set_config
- `apps/worker/src/db/schema.sql` - 6-table schema with RLS policies and indexes
- `apps/worker/src/types.ts` - Env and Variables interfaces
- `apps/worker/vitest.config.ts` - cloudflarePool config pointing at wrangler.jsonc
- `apps/worker/src/__tests__/auth.test.ts` - 3 auth tests (401/403/200)
- `apps/worker/src/__tests__/health.test.ts` - health route integration test
- `apps/worker/.dev.vars.example` - env var template with azp comment
- `apps/worker/package.json` - dependencies + "type": "module"
- `apps/worker/tsconfig.json` - ESNext bundler mode
- `apps/worker/wrangler.jsonc` - Worker config with nodejs_compat_v2
- `apps/worker/worker-configuration.d.ts` - generated Cloudflare types

## Decisions Made

- Used `cloudflarePool` from `@cloudflare/vitest-pool-workers@0.13.5` (not `defineWorkersConfig` which was removed in v0.13.x)
- Added `"type": "module"` to `package.json` — required for ESM-only `@cloudflare/vitest-pool-workers` to load in vitest config
- `withOrgContext` API redesigned to accept a synchronous callback returning `NeonQueryInTransaction` (NEON HTTP transactions cannot use async callbacks — the callback must return a synchronous array of tagged template queries)
- `authorizedParties` drawn from `ALLOWED_ORIGIN` env var — prevents `Invalid azp` 401 errors in production when Clerk validates the JWT's `azp` claim

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed NEON transaction API incompatibility in db/client.ts**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** The plan's `withOrgContext` used an async callback `fn: (sql) => Promise<T>` passed to `sql.transaction()`. The NEON HTTP driver's `transaction()` only accepts a synchronous callback returning `NeonQueryInTransaction[]` — async callbacks cause TypeScript errors and runtime failure.
- **Fix:** Redesigned `withOrgContext` to accept a synchronous query builder `fn: (tx) => NeonQueryInTransaction` and use `sql.transaction(tx => [tx\`SET...\`, fn(tx)])`. Results index [1] is the caller's query result.
- **Files modified:** `apps/worker/src/db/client.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** b6bc3bc (Task 1 commit)

**2. [Rule 3 - Blocking] Added "type": "module" to package.json**
- **Found during:** Task 2 (first test run attempt)
- **Issue:** `@cloudflare/vitest-pool-workers` is ESM-only. Without `"type": "module"` in `package.json`, vitest tries to CJS-require it and fails with "This package is ESM only but it was tried to load by require".
- **Fix:** Added `"type": "module"` to `apps/worker/package.json`.
- **Files modified:** `apps/worker/package.json`
- **Verification:** `npm test -- --run` exits 0 with 4 passing tests
- **Committed in:** 39a6b65 (Task 2 commit)

**3. [Rule 1 - Bug] Used cloudflarePool instead of defineWorkersConfig in vitest.config.ts**
- **Found during:** Task 2 (writing vitest config)
- **Issue:** Plan specified `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config`, but this function does not exist in v0.13.5. The package exports `cloudflarePool` for the pool-based configuration approach used in Vitest v4.
- **Fix:** Used `cloudflarePool({ wrangler: { configPath: './wrangler.jsonc' } })` as the `pool` value in `defineConfig`.
- **Files modified:** `apps/worker/vitest.config.ts`
- **Verification:** Tests load and run successfully in Workers runtime
- **Committed in:** 39a6b65 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 type-incompatibility bug, 1 blocking ESM config, 1 removed API)
**Impact on plan:** All auto-fixes necessary for correctness and test execution. No scope creep. The DB client API change is narrower than planned (synchronous callback vs async) — future callers must pass a synchronous tagged template expression to withOrgContext.

## Issues Encountered

- NEON `@neondatabase/serverless` v1.0.2 HTTP driver transaction API only supports synchronous callbacks — the plan's async callback design is architecturally incompatible. Fixed by redesigning the callback signature to match NEON's non-interactive transaction model.

## User Setup Required

None — no external service configuration required for this plan. `.dev.vars.example` documents the environment variables needed but no dashboard setup is required at this stage.

## Next Phase Readiness

- Worker foundation complete: auth middleware tested, DB client ready, schema SQL on disk
- All downstream phases (01-02 web app, 01-03 schema deploy, and feature phases) can depend on this auth contract
- Before deploying to production: run `wrangler secret put` for all 4 env vars listed in `.dev.vars.example`
- Schema must be applied to NEON database before any API endpoint can execute DB queries

## Self-Check: PASSED

All files verified present on disk. All commit hashes verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-28*
