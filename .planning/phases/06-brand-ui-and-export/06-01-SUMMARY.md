---
phase: 06-brand-ui-and-export
plan: 01
subsystem: ui
tags: [dark-mode, css-variables, tailwind, lucide-react, favicon, dashboard]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: AppShell component, NavItem, page routes, Clerk auth integration
  - phase: 03-file-upload-pipeline
    provides: useStores hook + Store interface for Dashboard populated state
provides:
  - Dark mode CSS variable infrastructure (@custom-variant dark + :root.dark token overrides)
  - Dark mode toggle button in AppShell header with localStorage persistence
  - FOUC prevention inline script in index.html
  - PharmIQ teal SVG favicon replacing Vite placeholder
  - Browser title updated to "PharmIQ — Dead-Stock Optimizer" with em-dash
  - Dashboard landing screen with empty-state and populated-state views
  - All surface/text/border tokens using CSS var() references (zero hardcoded neutral hex)
affects:
  - 06-02-pdf-export (shares AppShell + CSS variable dark mode foundation)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@custom-variant dark Tailwind v4 pattern for CSS-class-driven dark mode"
    - "FOUC prevention inline script reads localStorage before React boots"
    - "handleThemeToggle pattern: toggles .dark class on document.documentElement + writes localStorage"
    - "CSS var() references in Tailwind arbitrary value classes: bg-[var(--color-surface)]"

key-files:
  created:
    - apps/web/public/favicon.svg
    - .planning/phases/06-brand-ui-and-export/06-01-SUMMARY.md
  modified:
    - apps/web/src/index.css
    - apps/web/index.html
    - apps/web/src/components/AppShell.tsx
    - apps/web/src/components/StoreCard.tsx
    - apps/web/src/components/FileStatusBadge.tsx
    - apps/web/src/components/NavItem.tsx
    - apps/web/src/components/UploadModal.tsx
    - apps/web/src/pages/MatchPage.tsx
    - apps/web/src/pages/UploadPage.tsx
    - apps/web/src/pages/BillingPage.tsx
    - apps/web/src/pages/Dashboard.tsx
    - apps/web/src/pages/OrgSetup.tsx
    - apps/web/src/pages/SignIn.tsx

key-decisions:
  - "FOUC prevention via inline script in <head> before <meta charset> — runs synchronously before any React render"
  - "Dark mode state initialized in AppShell via localStorage.getItem lazy initializer — no double-render"
  - "bg-[var(--color-surface)] Tailwind arbitrary var() syntax chosen over style={} inline props — keeps Tailwind utility ordering"
  - "NavItem, OrgSetup, SignIn refactored despite not being in plan task list — required for full dark mode coverage"
  - "Semantic/brand colors (#D97706, #EF4444, status colors) intentionally kept hardcoded — exempt per plan"
  - "UploadModal overlay background kept as rgba(15, 23, 42, 0.6) inline style — uses opacity, exempt per plan"

patterns-established:
  - "All surface/text/border tokens use var(--color-*) references — never hardcode neutral hex in components"
  - "Dark mode toggle lives in AppShell, reads/writes localStorage + DOM classList directly"
  - "Dashboard checks useStores() to show empty-state vs populated-state landing — no stubs"

requirements-completed:
  - BRAND-01
  - BRAND-02

# Metrics
duration: 25min
completed: 2026-04-12
---

# Phase 6 Plan 01: Brand UI Polish Summary

**CSS variable dark mode with localStorage FOUC prevention, Sun/Moon header toggle, teal SVG favicon, em-dash browser title, and Dashboard two-state landing replacing the placeholder screen**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-12T03:00:00Z
- **Completed:** 2026-04-12T03:11:23Z
- **Tasks:** 3 (+ 1 checkpoint — human verification: PASSED)
- **Files modified:** 13

## Accomplishments

- Full dark mode CSS infrastructure via `@custom-variant dark` + `:root.dark` token overrides in index.css — seven surface/text/border tokens flip; brand/teal colors remain unchanged
- Dark mode toggle button (Sun/Moon from lucide-react) added to AppShell header alongside UserButton; FOUC prevention inline script applied before React renders
- Dashboard replaced from placeholder with useStores-driven two-state screen: empty state ("Welcome to PharmIQ" + Upload CTA) and populated state ("Ready to run a match" + Run Match CTA)
- All 13 component/page files refactored from hardcoded hex to CSS var() references; semantic/brand colors retained as-is per plan

## Task Commits

Each task was committed atomically:

1. **Task 1: CSS variables dark mode — index.css and hex refactor** - `8cf52b6` (feat)
2. **Task 2: Dark mode toggle in AppShell header + FOUC prevention** - `d7f9408` (feat)
3. **Task 3: Favicon, Dashboard home screen redesign** - `f509e82` (feat)

## Human Verification

**Status: PASSED**

All verification checks confirmed by user:
- Browser tab shows "PharmIQ — Dead-Stock Optimizer" with em-dash
- Teal hex-chart SVG favicon visible in browser tab (not Vite placeholder)
- Dashboard empty state shows "Welcome to PharmIQ" + Upload CTA
- Dashboard populated state shows "Ready to run a match" + Run Match CTA
- Dark mode toggle (Moon/Sun button) flips all surfaces correctly
- FOUC prevention confirmed — hard reload in dark mode shows no white flash
- localStorage persistence confirmed — dark mode survives tab close/reopen

## Files Created/Modified

- `apps/web/src/index.css` — `@custom-variant dark` directive + `:root.dark {}` token overrides; MUST appear before `:root {}`
- `apps/web/index.html` — FOUC inline script, title update to em-dash form, favicon link to `/favicon.svg`
- `apps/web/src/components/AppShell.tsx` — `useState` + `isDark` + `handleThemeToggle`; Sun/Moon button in header
- `apps/web/src/components/StoreCard.tsx` — hex to var() for surface/border/text/teal tokens
- `apps/web/src/components/FileStatusBadge.tsx` — hex to var() for text tokens
- `apps/web/src/components/NavItem.tsx` — hex to var() for text-secondary and teal hover
- `apps/web/src/components/UploadModal.tsx` — hex to var() across all form fields, modal bg, labels, buttons
- `apps/web/src/pages/MatchPage.tsx` — hex to var() throughout control bar, table, store selector, upgrade modal
- `apps/web/src/pages/UploadPage.tsx` — hex to var() for headings, CTAs, empty state
- `apps/web/src/pages/BillingPage.tsx` — hex to var() for plan card, text, icons
- `apps/web/src/pages/Dashboard.tsx` — complete replacement with useStores two-state landing screen
- `apps/web/src/pages/OrgSetup.tsx` — hex to var() for surface/text tokens
- `apps/web/src/pages/SignIn.tsx` — hex to var() for surface/text tokens
- `apps/web/public/favicon.svg` — PharmIQ teal hexagon frame + ascending bar chart mark (new file)

## Decisions Made

- FOUC prevention uses inline `<script>` as very first `<head>` child (before `<meta charset>`) — runs synchronously before any stylesheet or script loads
- Dark mode state lazily initialized from `localStorage.getItem('theme')` in `useState()` — avoids double-render on mount
- `bg-[var(--color-surface)]` Tailwind arbitrary var() syntax used throughout — keeps Tailwind utility ordering, no inline style overrides for backgrounds
- NavItem, OrgSetup, and SignIn were refactored even though not listed in the plan's `<files>` — the plan says "ALL component and page files"; this was a Rule 2 extension for correctness

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended hex refactor to NavItem, OrgSetup, SignIn**
- **Found during:** Task 1 (hex grep scan)
- **Issue:** Plan's `<files>` list didn't include NavItem, OrgSetup, SignIn — but these files had surface/neutral hex values that would have remained broken in dark mode
- **Fix:** Applied the same var() substitution to all three files
- **Files modified:** `apps/web/src/components/NavItem.tsx`, `apps/web/src/pages/OrgSetup.tsx`, `apps/web/src/pages/SignIn.tsx`
- **Verification:** Build passes; grep confirms no remaining surface hex in these files
- **Committed in:** `8cf52b6` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical dark mode coverage)
**Impact on plan:** Extension was necessary for dark mode completeness. No scope creep — same operation applied to files the plan missed.

## Issues Encountered

None — build passed on all three task iterations without errors.

## Known Stubs

None — Dashboard uses `useStores()` real data hook. Both states render from live API data.

## Self-Check: PASSED

- Commits `8cf52b6`, `d7f9408`, `f509e82` exist on main branch
- Human verification checkpoint: PASSED
- All 3 auto tasks complete; 1 checkpoint confirmed

## Next Phase Readiness

- Dark mode infrastructure is complete; 06-02 (PDF export) can use `var(--color-*)` tokens in its UI additions
- All pages support dark mode via CSS variable inheritance; no per-page dark mode work needed in 06-02
- favicon.svg is deployed; browser title is set; no further brand gap work in this area

---
*Phase: 06-brand-ui-and-export*
*Completed: 2026-04-12*
