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
  - apps/worker/.gitignore excluding .dev.vars and build artifacts
  - Local dev env files (.dev.vars and .env) with placeholder credentials (gitignored)
  - Verified wiring: useFetch sends Bearer token to ALLOWED_ORIGIN-gated Worker; both projects build and tests pass
affects: [01-04, 02-logic-audit, 03-upload, 04-algorithm, 05-billing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CORS origin callback uses c.env.ALLOWED_ORIGIN (same value used for azp authorizedParties)
    - .dev.vars gitignored via explicit .gitignore in apps/worker/ — placeholder file committed as example only

key-files:
  created:
    - apps/worker/.gitignore
    - apps/worker/.dev.vars (gitignored — placeholder credentials for local dev)
    - apps/web/.env (gitignored — placeholder credentials for local dev)
  modified:
    - apps/worker/src/index.ts

key-decisions:
  - "allowHeaders and allowMethods added to cors() so preflight OPTIONS requests from the browser succeed — required for Authorization header in cross-origin requests"
  - ".dev.vars gitignored rather than being a committed file — placeholder lives in .dev.vars.example"

patterns-established:
  - "CORS and azp authorizedParties share the same ALLOWED_ORIGIN env var — single source of truth for the trusted origin"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

# Metrics
duration: ~10min
completed: 2026-03-28
---

# Phase 01 Plan 03: Integration Wire Summary

**CORS preflight wiring with allowHeaders/allowMethods, worker .gitignore, and local dev env files — Worker tests 4/4 pass, web build clean; awaiting human auth flow verification**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-28T15:44:00Z
- **Completed:** 2026-03-28T15:46:30Z (Task 1 only — Task 2 is human-verify checkpoint)
- **Tasks:** 1 of 2 (Task 2 is a human-verify checkpoint, not automated)
- **Files modified:** 2 (index.ts modified; .gitignore created)

## Accomplishments

- Worker CORS expanded with `allowHeaders: ['Authorization', 'Content-Type']` and `allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']` — preflight requests for authenticated cross-origin calls now pass
- `apps/worker/.gitignore` created to exclude `.dev.vars` (local dev secrets) and standard artifacts from git
- `apps/worker/.dev.vars` created with placeholder values (gitignored) — ready for real credentials
- `apps/web/.env` created with placeholder values (gitignored) — ready for real VITE_CLERK_PUBLISHABLE_KEY and VITE_WORKER_URL
- Worker tests: 4/4 pass; web Vite build: exits 0

## Task Commits

1. **Task 1: Wire CORS allowHeaders/allowMethods, add worker .gitignore and dev env files** - `e40c79c` (feat)

Task 2 is a `checkpoint:human-verify` — no commit expected until after human approval.

## Files Created/Modified

- `apps/worker/src/index.ts` - Added `allowHeaders` and `allowMethods` to cors() middleware
- `apps/worker/.gitignore` - Excludes .dev.vars, dist/, node_modules/, editor files
- `apps/worker/.dev.vars` - Placeholder local dev credentials (gitignored)
- `apps/web/.env` - Placeholder VITE_CLERK_PUBLISHABLE_KEY and VITE_WORKER_URL (gitignored)

## Decisions Made

- Added `allowHeaders` and `allowMethods` to cors() explicitly: the previous minimal `cors({ origin: ... })` omitted these, meaning preflight OPTIONS requests for the `Authorization` header would fail. Modern browsers send a preflight before any request with a custom header like Authorization.
- `.dev.vars` is gitignored via `apps/worker/.gitignore` rather than being committed with placeholder values, to prevent the gitignore from being bypassed on platforms that commit `.env`-like files.

## Deviations from Plan

None - plan executed exactly as written. The CORS update, gitignore, and env file creation were all specified in Task 1's action block.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration before Task 2 verification is possible.**

| Variable | Where to get it | Required for |
|---|---|---|
| `CLERK_SECRET_KEY` | Clerk Dashboard > API Keys | Worker JWT verification |
| `CLERK_PUBLISHABLE_KEY` | Clerk Dashboard > API Keys | Worker Clerk initialization |
| `DATABASE_URL` | NEON Console > Connection Details | DB queries (not needed for health endpoint) |
| `ALLOWED_ORIGIN` | Set to http://localhost:5173 for local dev | CORS and azp validation |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard > API Keys | SPA Clerk auth |
| `VITE_WORKER_URL` | Set to http://localhost:8787 for local dev | useFetch API calls |

**One-time Clerk setup required:**
1. Create Clerk application "PharmIQ Stock Transfer" with Organizations enabled
2. Enable Google + Microsoft sign-in
3. Create JWT template "stocktransfer-worker" with `{ "org_id": "{{org.id}}" }` claims

**One-time NEON setup required:**
1. Create NEON project
2. Run `apps/worker/src/db/schema.sql` in SQL Editor
3. Create `pharmiq_app` role with password

## Next Phase Readiness

- Integration wiring is complete on the code side — both Worker CORS and Web useFetch hook are correctly configured
- The plan is paused at Task 2 (human-verify checkpoint) — Phase 1 is not officially complete until the 10-step manual auth flow verification passes
- Once approved, Phase 2 (logic audit) and Phase 3 (upload) can proceed in parallel

---
*Phase: 01-foundation*
*Completed: 2026-03-28 (pending Task 2 human verification)*
