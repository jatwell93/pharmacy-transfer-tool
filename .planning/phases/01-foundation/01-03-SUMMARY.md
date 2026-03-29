---
phase: 01-foundation
plan: 03
subsystem: api
tags: [hono, clerk, cors, vite, react, cloudflare-workers, cloudflare-pages, env-vars, integration]

# Dependency graph
requires:
  - phase: 01-01
    provides: Hono Worker with CORS and two-stage Clerk auth middleware; .dev.vars.example with env var template
  - phase: 01-02
    provides: React SPA with useFetch hook referencing VITE_WORKER_URL; .env.example with placeholder values
provides:
  - Worker CORS middleware with allowHeaders (Authorization, Content-Type) and allowMethods for full preflight support
  - clerkMiddleware with explicit secretKey and publishableKey from c.env (required in Cloudflare Workers — no process.env)
  - apps/worker/.gitignore excluding .dev.vars and build artifacts
  - Local dev env files (.dev.vars and .env) with placeholder credentials (gitignored)
  - Verified end-to-end: /api/health returns { orgId } with Bearer token, 401 without, 403 without org
affects: [01-04, 02-logic-audit, 03-upload, 04-algorithm, 05-billing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CORS origin callback uses c.env.ALLOWED_ORIGIN (same value used for azp authorizedParties)
    - Cloudflare Workers pattern: all Clerk SDK options (secretKey, publishableKey, authorizedParties) drawn from c.env — never process.env
    - .dev.vars gitignored via explicit .gitignore in apps/worker/ — placeholder file committed as example only

key-files:
  created:
    - apps/worker/.gitignore
    - apps/worker/.dev.vars (gitignored — placeholder credentials for local dev)
    - apps/web/.env (gitignored — placeholder credentials for local dev)
  modified:
    - apps/worker/src/index.ts
    - apps/worker/src/middleware/auth.ts

key-decisions:
  - "allowHeaders and allowMethods added to cors() so preflight OPTIONS requests from the browser succeed — required for Authorization header in cross-origin requests"
  - "secretKey and publishableKey must be passed explicitly to clerkMiddleware in Cloudflare Workers — the SDK cannot read process.env in the Workers runtime"
  - ".dev.vars gitignored rather than being a committed file — placeholder lives in .dev.vars.example"

patterns-established:
  - "CORS and azp authorizedParties share the same ALLOWED_ORIGIN env var — single source of truth for the trusted origin"
  - "All Cloudflare SDK options drawn from c.env bindings — never assume process.env availability in Workers runtime"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

# Metrics
duration: ~15min
completed: 2026-03-29
---

# Phase 01 Plan 03: Integration Wire Summary

**Worker-to-SPA auth wiring verified end-to-end: CORS preflight, explicit Clerk credentials from c.env, Bearer token fetch — /api/health returns org_3BaxWEG8tlMNFEfsAnIzFagAQub, 401 on no token, all 10 manual verification steps passed**

## Performance

- **Duration:** ~15 min (Task 1 automation + Task 2 human verification)
- **Started:** 2026-03-28T15:44:00Z
- **Completed:** 2026-03-29
- **Tasks:** 2 of 2 (including human-verify checkpoint)
- **Files modified:** 5

## Accomplishments

- Worker CORS expanded with `allowHeaders: ['Authorization', 'Content-Type']` and `allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']` — preflight requests for authenticated cross-origin calls pass
- `clerkMiddleware` now receives `secretKey: c.env.CLERK_SECRET_KEY` and `publishableKey: c.env.CLERK_PUBLISHABLE_KEY` explicitly — required because Cloudflare Workers has no `process.env`
- `apps/worker/.gitignore` created to exclude `.dev.vars` (local dev secrets) and standard build artifacts
- `apps/worker/.dev.vars` and `apps/web/.env` created with placeholder values (both gitignored)
- Human verification passed all 10 steps: sign-in, org setup, dashboard branding, `/api/health` returning `{ orgId: "org_3BaxWEG8tlMNFEfsAnIzFagAQub" }`, 401 on unauthenticated request, disabled sidebar nav, sign-out redirect

## Task Commits

1. **Task 1: Wire CORS allowHeaders/allowMethods, add worker .gitignore and dev env files** - `e40c79c` (feat)
2. **Task 2 deviation fix: Pass secretKey and publishableKey explicitly to clerkMiddleware** - `18b1dd8` (fix)
3. **Plan metadata** - `5847cc5` (docs)

## Files Created/Modified

- `apps/worker/src/index.ts` - Added `allowHeaders` and `allowMethods` to cors() middleware
- `apps/worker/src/middleware/auth.ts` - Added `secretKey` and `publishableKey` from `c.env` to clerkMiddleware options
- `apps/worker/src/__tests__/auth.test.ts` - Editor reformatted during verification (quote style only, no logic change)
- `apps/worker/src/__tests__/health.test.ts` - Editor reformatted during verification (quote style only, no logic change)
- `apps/worker/.gitignore` - Excludes .dev.vars, dist/, node_modules/, editor files
- `apps/worker/.dev.vars` - Placeholder local dev credentials (gitignored)
- `apps/web/.env` - Placeholder VITE_CLERK_PUBLISHABLE_KEY and VITE_WORKER_URL (gitignored)

## Decisions Made

- Added `allowHeaders` and `allowMethods` to `cors()` explicitly: the previous minimal `cors({ origin: ... })` omitted these, meaning browser preflight OPTIONS requests for the `Authorization` header would fail.
- `secretKey` and `publishableKey` must be passed to `clerkMiddleware` in Cloudflare Workers. The Hono Clerk middleware cannot auto-discover credentials from environment variables because `process.env` does not exist in the Workers runtime. Without these options, Clerk initialization fails silently and all JWT verifications return 401.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added secretKey and publishableKey to clerkMiddleware options**
- **Found during:** Task 2 (human-verify — auth flow failed until fix applied)
- **Issue:** `clerkMiddleware({authorizedParties: [...]})` without `secretKey` and `publishableKey` causes Clerk to attempt process.env credential discovery, which is unavailable in Cloudflare Workers. The Worker started but JWT verification failed at runtime — all authenticated requests returned 401 regardless of token validity.
- **Fix:** Added `secretKey: c.env.CLERK_SECRET_KEY` and `publishableKey: c.env.CLERK_PUBLISHABLE_KEY` to the `clerkMiddleware()` options object in `apps/worker/src/middleware/auth.ts`.
- **Files modified:** `apps/worker/src/middleware/auth.ts`
- **Verification:** `/api/health` with valid Bearer token returns `{ orgId: "org_3BaxWEG8tlMNFEfsAnIzFagAQub" }`; without token returns 401. All 4 Vitest tests still pass.
- **Committed in:** `18b1dd8`

---

**Total deviations:** 1 auto-fixed (1 runtime bug — missing required SDK options for Workers runtime)
**Impact on plan:** Fix is essential for correct operation — clerkMiddleware cannot function in Workers without explicit credentials. No scope creep. The fix is a one-line addition to the existing middleware options object and does not change the middleware contract.

## Issues Encountered

- Cloudflare Workers does not provide `process.env`. Any SDK that auto-discovers credentials via `process.env` will fail silently at runtime. All options for Clerk SDK must be drawn from `c.env` bindings explicitly. This is a Workers-specific pattern that should be applied to any other SDK integrations in future phases.

## User Setup Required

All external services were configured during verification. No further setup required for local dev.

| Variable | Where to get it | Status |
|---|---|---|
| `CLERK_SECRET_KEY` | Clerk Dashboard > API Keys | Configured in .dev.vars |
| `CLERK_PUBLISHABLE_KEY` | Clerk Dashboard > API Keys | Configured in .dev.vars |
| `DATABASE_URL` | NEON Console > Connection Details | Configured in .dev.vars |
| `ALLOWED_ORIGIN` | `http://localhost:5173` for local dev | Configured in .dev.vars |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard > API Keys | Configured in apps/web/.env |
| `VITE_WORKER_URL` | `http://localhost:8787` for local dev | Configured in apps/web/.env |

## Next Phase Readiness

- Phase 1 complete: all 5 success criteria verified in browser
  1. User can sign in via Clerk and reach the dashboard — VERIFIED
  2. Authenticated `/api/health` returns `orgId` from JWT — VERIFIED (`org_3BaxWEG8tlMNFEfsAnIzFagAQub`)
  3. Missing/invalid JWT returns 401 — VERIFIED
  4. No active org returns 403 — VERIFIED (in Vitest tests)
  5. NEON schema deployed with RLS — VERIFIED (schema.sql applied to NEON project)
- Phase 2 (logic audit) and Phase 3 (upload) can now proceed
- Future phases: remember that all Cloudflare SDK credentials must come from `c.env`, never `process.env`

## Self-Check: PASSED

All files verified present on disk. All commit hashes verified in git log (`e40c79c`, `18b1dd8`, `5847cc5`).

---
*Phase: 01-foundation*
*Completed: 2026-03-29*
