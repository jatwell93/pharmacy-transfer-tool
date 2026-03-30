---
phase: 03-file-upload-pipeline
plan: 04
subsystem: testing
tags: [vitest, hono, cloudflare-workers, postgres, mocking]

# Dependency graph
requires:
  - phase: 03-file-upload-pipeline
    provides: upload route with org FK upsert added in commit cc6f3c2 (Task 1 of 03-03)
provides:
  - All 9 upload route tests passing with correct 4/5-call withOrgContext mock sequences
  - GET /stores handler with try/catch error wrapping (JSON 500 on DB failure)
affects: [04-matching-engine, 05-billing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mockResolvedValueOnce chained calls mirror actual withOrgContext call order in route handler"
    - "GET handlers wrap body in try/catch returning c.json({ error }, 500) — consistent with POST handlers"

key-files:
  created: []
  modified:
    - apps/worker/src/__tests__/upload.test.ts
    - apps/worker/src/routes/upload.ts

key-decisions:
  - "Mock sequences must be updated whenever route handler adds or reorders withOrgContext calls — comment the call order in each test"

patterns-established:
  - "Pattern: Every withOrgContext call in a route handler must have a corresponding mockResolvedValueOnce in its test — document the sequence order with a comment"
  - "Pattern: All Hono route handlers (GET and POST) wrap their body in try/catch returning JSON 500 on unhandled errors"

requirements-completed: [UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04, UPLOAD-05, UPLOAD-06]

# Metrics
duration: 4min
completed: 2026-03-30
---

# Phase 3 Plan 4: Upload Test Mock Desync Fix Summary

**Fixed upload test mock desync by adding org upsert as first withOrgContext call in POST tests (5-call ROU sequence, 4-call dead-stock sequence) and added try/catch to GET /stores handler**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-30T11:10:30Z
- **Completed:** 2026-03-30T11:14:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed ROU upload test: added org upsert mock as first of 5 chained mockResolvedValueOnce calls, correctly testing the new-store path
- Fixed dead-stock upload test: added org upsert mock as first of 4 chained calls, correctly testing the existing-store path
- Added clarifying "call sequence" comments to all 5 POST mock setups and all 3 GET /stores tests
- Added try/catch wrapper to GET /stores handler in upload.ts — unhandled DB errors now return JSON { error } with status 500 instead of crashing the Worker
- All 62 worker tests pass (18 parser + 9 upload + others); TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix withOrgContext mock sequences in upload.test.ts** - `53bb055` (fix)
2. **Task 2: Add try/catch to GET /stores handler in upload.ts** - `040847f` (fix)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified
- `apps/worker/src/__tests__/upload.test.ts` - Added org upsert as first mock in both POST happy-path tests; added call-sequence comments to GET tests
- `apps/worker/src/routes/upload.ts` - Wrapped GET /stores handler body in try/catch with JSON 500 error response

## Decisions Made
- Mock sequence comments added to all happy-path tests (not just the fixed ones) to prevent future desync — when a developer adds a new withOrgContext call to the route, they can see the documented sequence and know to add a new mock

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Root cause was precisely as identified in the plan: commit cc6f3c2 had added an org FK upsert as the first withOrgContext call without updating the test mocks. The fix was straightforward once the actual call sequence was mapped against the mock setup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All upload route tests pass (0 failures across 62 tests)
- Upload pipeline is fully tested and ready for Phase 4 (matching engine) to build on
- GET /stores now has defensive error handling consistent with POST /upload

---
*Phase: 03-file-upload-pipeline*
*Completed: 2026-03-30*
