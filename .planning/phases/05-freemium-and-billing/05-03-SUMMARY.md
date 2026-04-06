---
phase: 05-freemium-and-billing
plan: 03
subsystem: web-freemium-ux
tags: [billing, freemium, usage-metering, stripe, react, hooks, paywall]
dependency_graph:
  requires:
    - 05-01 (GET /api/usage endpoint returning { count, limit, plan })
    - 05-02 (POST /api/billing/create-checkout returning { url })
    - 04-matching-algorithm (MatchPage exists and functional)
    - 01-foundation (useFetch hook with Clerk auth, AppShell, NavItem)
  provides:
    - useUsage hook (GET /api/usage -> { count, limit, plan })
    - MatchPage freemium UX (usage counter, lock button, upgrade modal)
    - BillingPage (/billing route, plan info, upgrade CTA)
    - Enabled Billing nav item
  affects:
    - apps/web/src/hooks/useUsage.ts (new file)
    - apps/web/src/pages/MatchPage.tsx (usage counter, lock button, modal)
    - apps/web/src/components/AppShell.tsx (Billing nav enabled)
    - apps/web/src/App.tsx (/billing route added)
    - apps/web/src/pages/BillingPage.tsx (new file)
tech_stack:
  added: []
  patterns:
    - useCallback with stable useFetch ref to prevent render loops (established Phase 3 pattern)
    - useEffect 429-error detection pattern for modal trigger
    - window.location.href redirect for Stripe Checkout (not deprecated stripe.redirectToCheckout)
    - Derived isAtLimit boolean from usage.plan and usage.count/limit
key_files:
  created:
    - apps/web/src/hooks/useUsage.ts
    - apps/web/src/pages/BillingPage.tsx
  modified:
    - apps/web/src/pages/MatchPage.tsx
    - apps/web/src/components/AppShell.tsx
    - apps/web/src/App.tsx
decisions:
  - window.location.href used for Stripe redirect (not stripe.redirectToCheckout — deprecated September 2025)
  - refreshUsage called unconditionally after runMatch (harmless on error, necessary on success for D-09)
  - useEffect pattern for 429 detection keeps handleRunMatch clean and avoids re-throwing from useMatchRun
  - isAtLimit derived from usage state so button and counter stay in sync without duplication
  - No subscription management UI on BillingPage (D-12 scope boundary)
metrics:
  duration_seconds: 480
  completed_date: "2026-04-06T01:25:13Z"
  tasks_completed: 3
  files_changed: 5
---

# Phase 5 Plan 3: Frontend Freemium UX Summary

**One-liner:** useUsage hook fetching GET /api/usage, MatchPage paywall with amber lock button and upgrade modal wired to POST /api/billing/create-checkout via window.location.href, and new BillingPage at /billing showing plan name, usage stats for free orgs, and upgrade CTA.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create useUsage hook | 038f25e | apps/web/src/hooks/useUsage.ts |
| 2 | Add usage counter, disabled button, upgrade modal, handleUpgrade to MatchPage | 9df113c | apps/web/src/pages/MatchPage.tsx |
| 3 | Enable Billing nav, add /billing route, create BillingPage | e6c243f | apps/web/src/components/AppShell.tsx, apps/web/src/App.tsx, apps/web/src/pages/BillingPage.tsx |

## What Was Built

### useUsage Hook (Task 1, BILLING-02 frontend)

New `apps/web/src/hooks/useUsage.ts`:

- `UsageData` interface with `count: number`, `limit: number`, `plan: 'free' | 'paid'`
- `useUsage()` hook that fetches GET /api/usage on mount
- `refresh` callback exposed so MatchPage can re-fetch after a successful match run (D-09)
- Follows established useFetch ref pattern from Phase 3 to prevent render loops caused by Clerk session refresh recreating fetchApi

### MatchPage Freemium Paywall (Task 2, BILLING-03)

Updated `apps/web/src/pages/MatchPage.tsx` with:

**Imports added:**
- `Lock` from lucide-react
- `useUsage` from hooks/useUsage
- `useFetch` from hooks/useFetch

**State and derived values:**
- `showUpgradeModal: boolean` — controls upgrade modal visibility
- `isAtLimit: boolean` — derived as `usage?.plan === 'free' && usage.count >= usage.limit`

**Usage counter in control bar:**
- Visible only when `usage && usage.plan === 'free'` (hidden for paid orgs per D-08)
- Text: `"{count} of {limit} free run{s} used this month"`

**Adaptive Run Match button:**
- Normal state: teal `#0F766E` with "Run Match" label
- At-limit state: amber `#D97706` with Lock icon and "Upgrade to run again" label
- At-limit clicks open upgrade modal directly (no redundant API call)

**handleRunMatch modifications:**
- Early return with `setShowUpgradeModal(true)` when `isAtLimit`
- Calls `refreshUsage()` after `await runMatch(...)` — unconditional, harmless on error, updates counter on success (D-09)

**handleUpgrade:**
- POSTs to `/api/billing/create-checkout`
- Redirects via `window.location.href = url` (not deprecated `stripe.redirectToCheckout`)

**useEffect for 429 detection:**
- Watches `error` state from `useMatchRun`
- Opens upgrade modal when error includes `'Monthly match run limit reached'`

**Upgrade modal overlay:**
- Fixed overlay with `z-50`, backdrop click to dismiss
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- "Upgrade Now" CTA calls `handleUpgrade`
- "Maybe later" dismisses modal

### BillingPage + Routing (Task 3, BILLING-03, D-10, D-11)

**AppShell.tsx:** Billing NavItem changed from `disabled={true}` to `disabled={false}` with `href="/billing"`.

**App.tsx:** `/billing` route added with `ProtectedRoute requireOrg={true}` before the `*` catch-all route.

**BillingPage.tsx:** New page at `apps/web/src/pages/BillingPage.tsx`:
- Uses `useUsage` for plan data, `useFetch` for checkout creation
- Loading state: "Loading billing info..."
- Free org: plan name "Free Plan", runs counter `{count} of {limit}`, amber "Upgrade to PharmIQ Pro" CTA, "Unlimited match runs. Cancel anytime." footnote
- Paid org: plan name "PharmIQ Pro", "Paid plan — unlimited runs" message (no CTA)
- Error state: "Could not load billing info."
- No Customer Portal or subscription management UI (D-12 scope boundary respected)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired to real API endpoints:
- `useUsage` calls GET /api/usage (implemented in Plan 01)
- `handleUpgrade` / `BillingPage` upgrade CTA call POST /api/billing/create-checkout (implemented in Plan 02)
- Redirect to Stripe Checkout session URL is live (not mocked)

## Threat Surface Scan

All files modified in this plan are covered by the plan's threat model:

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-5-09 | Accepted — client-side paywall is UX only; POST /match returns 429 regardless of client state |
| T-5-10 | Implemented — `window.location.href = url` redirects to server-returned URL (never client-constructed); server creates session via Stripe SDK with org_id in metadata |
| T-5-11 | Implemented — GET /api/usage is authenticated via Clerk JWT; orgId from JWT only |
| T-5-12 | Accepted — Stripe rate-limits; each session is idempotent |

No new network endpoints, auth paths, file access patterns, or schema changes outside the threat model were introduced.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/web/src/hooks/useUsage.ts | FOUND |
| apps/web/src/pages/MatchPage.tsx | FOUND |
| apps/web/src/components/AppShell.tsx | FOUND |
| apps/web/src/App.tsx | FOUND |
| apps/web/src/pages/BillingPage.tsx | FOUND |
| Commit 038f25e (Task 1) | FOUND |
| Commit 9df113c (Task 2) | FOUND |
| Commit e6c243f (Task 3) | FOUND |
| TypeScript compiles cleanly | VERIFIED |
