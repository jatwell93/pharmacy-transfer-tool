---
plan: 15-02
phase: 15-3-tier-billing
status: checkpoint
started: 2026-04-22
completed: 2026-04-22
self_check: PASSED
---

## What Was Built

3-tier billing frontend for PharmIQ Stock Transfer. Two atomic commits covering Tasks 1 and 2. Stopped at Task 3 (human-verify checkpoint) awaiting visual confirmation in browser.

One-liner: BillingPage redesigned with 3 pricing cards (Free/Pro/Enterprise), synchronous checkout-session confirmation (no polling), usage row with color indicators, and MatchPage upgrade modal updated with tier-specific copy from the Worker's upgrade_to error field.

## Key Files

### key-files

created:
  - apps/web/src/__tests__/BillingPage.test.tsx
  - apps/web/src/__tests__/UpgradeModal.test.tsx
  - apps/web/src/__tests__/setup.ts
  - apps/web/vitest.config.ts

modified:
  - apps/web/src/hooks/useUsage.ts
  - apps/web/src/hooks/useMatchRun.ts
  - apps/web/src/pages/BillingPage.tsx
  - apps/web/src/pages/MatchPage.tsx

## Task Outcomes

### Task 1: Update hooks and redesign BillingPage (commit c5b023e)

- `useUsage.ts`: replaced `plan: 'free' | 'paid'` with `plan_tier: 'free' | 'pro' | 'enterprise'` and added `store_count: number` to match new Worker API shape
- `useMatchRun.ts`: added `upgradeTo` state; error path parses full response body and captures `body.upgrade_to`; resets `upgradeTo` to null on success; exposed in return type
- `BillingPage.tsx`: full redesign — `TIER_DISPLAY` constant for 3 cards (Free $0, Pro $10/mo AUD, Enterprise $100/mo AUD); usage row with match-run and store-count color indicators (neutral / amber ≥80% / red at cap); current-plan teal border + "Current plan" badge; upgrade CTAs call `create-checkout` with correct `tier` param; synchronous `GET /api/billing/checkout-session/:sessionId` confirmation on `?checkout=success` (BILLING-09 — no polling); spinner + "Confirming your upgrade..." while in-flight; toast "You're now on PharmIQ Pro/Enterprise" on success; error state with Retry button on failure; "Manage subscription" portal link hidden for free users; `tierBeforeCheckout` ref as safety net
- `vitest.config.ts` + `setup.ts`: jsdom-based vitest config added for web app (Rule 3 deviation — no test infra existed)
- `BillingPage.test.tsx`: 5 behavioral tests — renders 3 cards, current plan badge + correct upgrade buttons, manage subscription visibility, usage row display, enterprise infinity symbols

### Task 2: Update MatchPage and create UpgradeModal tests (commit 6abaf1b)

- `MatchPage.tsx`: destructures `upgradeTo` from `useMatchRun`; `useEffect` on `upgradeTo` triggers modal (replaces brittle string check on error message, now handles both 429 run-limit and 403 store-limit errors); tier-specific modal copy — title, body, CTA button text per `upgrade_to` value; `handleUpgrade` passes correct `tier` to `create-checkout`; `isAtLimit` now checks `limit !== -1 && count >= limit` (works for Free and Pro; enterprise with `limit=-1` is never at limit); usage counter uses `plan_tier !== 'enterprise'` so Pro users also see counter; all `plan === 'free'` / `plan === 'paid'` references removed
- `UpgradeModal.test.tsx`: 4 behavioral tests — "Upgrade to Pro" title + $10/mo AUD body, "Upgrade to Enterprise" title + $100/mo AUD body, CTA button text per tier, "Maybe later" dismiss button

### Task 3: Visual and functional verification — PENDING

Stopped at checkpoint:human-verify. Human must confirm BillingPage and MatchPage in browser.

## Test Results

9 tests across 2 suites — all passed.

- `BillingPage.test.tsx` (5): renders 3 pricing cards, current plan badge, manage subscription visibility, usage row display, enterprise infinity symbols
- `UpgradeModal.test.tsx` (4): Upgrade to Pro copy, Upgrade to Enterprise copy, tier-specific CTA, Maybe later dismiss

TypeScript: `tsc --noEmit` exits 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed vitest and testing library dependencies**
- **Found during:** Task 1 (creating BillingPage.test.tsx)
- **Issue:** The web app had no test infrastructure — no vitest, no @testing-library/react, no jsdom, no vitest config. The plan's verification step `npx vitest run` would fail immediately.
- **Fix:** `npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom`; created `apps/web/vitest.config.ts` with jsdom environment; created `apps/web/src/__tests__/setup.ts` with `@testing-library/jest-dom` import
- **Files modified:** `apps/web/package.json`, `apps/web/package-lock.json`, `apps/web/vitest.config.ts`, `apps/web/src/__tests__/setup.ts`
- **Commit:** c5b023e

## Known Stubs

None. All pricing card copy, usage data, and upgrade flows are wired to real API hooks and constants.

## Threat Flags

No new threat surface introduced beyond what was documented in the plan's threat model. All billing API calls are authenticated via Clerk JWT through `useFetch`. Tier param is sourced from the `TIER_DISPLAY` constant (not user input). Session ID from URL is validated server-side by `GET /api/billing/checkout-session/:sessionId`.

## Self-Check

### Files created/modified exist:

- apps/web/src/hooks/useUsage.ts — FOUND
- apps/web/src/hooks/useMatchRun.ts — FOUND
- apps/web/src/pages/BillingPage.tsx — FOUND
- apps/web/src/pages/MatchPage.tsx — FOUND
- apps/web/src/__tests__/BillingPage.test.tsx — FOUND
- apps/web/src/__tests__/UpgradeModal.test.tsx — FOUND
- apps/web/src/__tests__/setup.ts — FOUND
- apps/web/vitest.config.ts — FOUND

### Commits exist:

- c5b023e — FOUND (feat(15-02): redesign BillingPage with 3-tier cards, hooks, and tests)
- 6abaf1b — FOUND (feat(15-02): update MatchPage upgrade modal with tier-specific copy and UpgradeModal tests)

## Self-Check: PASSED
