---
phase: 06-brand-ui-and-export
verified: 2026-04-12T05:45:00Z
status: gaps_found
score: 9/10 must-haves verified
gaps:
  - truth: "npm run build exits 0 with no TypeScript errors"
    status: failed
    reason: "@react-pdf/renderer is declared in package.json and package-lock.json but not installed in node_modules. Rollup cannot resolve the dynamic import chain: MatchPage.tsx -> dynamic import('../components/TransferReportPDF') -> static import from '@react-pdf/renderer'. The node_modules/.package-lock.json is dated March 29 (original install); the outer package-lock.json was updated April 12 when npm install was run, but node_modules was never synchronized. The dev server worked (Vite dev mode does not pre-bundle dynamic imports the same way), which is why human verification passed, but production build fails."
    artifacts:
      - path: "apps/web/src/components/TransferReportPDF.tsx"
        issue: "Static import 'import { Document, Page, View, Text, StyleSheet } from @react-pdf/renderer' at line 6 — package not present in node_modules"
      - path: "apps/web/src/pages/MatchPage.tsx"
        issue: "Dynamic import('@react-pdf/renderer') at line 98 cannot be resolved by Rollup because @react-pdf is not installed"
    missing:
      - "Run 'cd apps/web && npm install' to install @react-pdf/renderer@4.4.1 and its dependencies into node_modules, then confirm 'npm run build' exits 0"
---

# Phase 6: Brand, UI and Export Verification Report

**Phase Goal:** The app looks and feels like part of the PharmIQ product family and users can export match results as a PDF
**Verified:** 2026-04-12T05:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can toggle dark mode using the Sun/Moon button in the header | ✓ VERIFIED | AppShell.tsx lines 11-25: `isDark` state + `handleThemeToggle` adds/removes `dark` class on `document.documentElement`. Sun/Moon icons from lucide-react are conditionally rendered in header. |
| 2 | Dark mode preference persists across browser sessions via localStorage | ✓ VERIFIED | AppShell.tsx line 12: state initialized from `localStorage.getItem('theme') === 'dark'`. `handleThemeToggle` calls `localStorage.setItem('theme', ...)`. |
| 3 | No white flash (FOUC) occurs when loading the app in dark mode | ✓ VERIFIED | index.html lines 4-9: inline `<script>` as very first `<head>` child reads `localStorage.getItem('theme')` and adds `dark` class before any stylesheet or React loads. |
| 4 | All surfaces flip to dark palette when .dark class is on html | ✓ VERIFIED | index.css lines 31-40: `:root.dark {}` block overrides all 7 surface/text/border tokens. All component files use `var(--color-*)` references with zero hardcoded neutral hex remaining. |
| 5 | Browser tab shows 'PharmIQ — Dead-Stock Optimizer' with an em-dash separator | ✓ VERIFIED | index.html line 16: `<title>PharmIQ &#8212; Dead-Stock Optimizer</title>` — HTML entity `&#8212;` is the em-dash. |
| 6 | Favicon shows a teal SVG mark instead of the Vite placeholder | ✓ VERIFIED | `apps/web/public/favicon.svg` exists with hexagon frame (`<polygon>`) and 3 ascending bar chart `<rect>` elements using `#0F766E` and `#14B8A6`. `index.html` link href points to `/favicon.svg`. |
| 7 | Dashboard shows empty state and populated state based on stores | ✓ VERIFIED | Dashboard.tsx: uses `useStores()` hook (fetches from `/api/stores`), branches on `hasStores` — empty state shows "Welcome to PharmIQ" + Upload CTA, populated state shows "Ready to run a match" + Run Match CTA. No stubs. |
| 8 | User can click 'Export PDF' and receive a downloadable PDF | ✓ VERIFIED | MatchPage.tsx lines 93-111: `handleExportPdf` async function uses dynamic `import('@react-pdf/renderer')` + `import('../components/TransferReportPDF')`, calls `pdf(<TransferReportPDF .../>).toBlob()`, creates object URL, triggers download. Human verification confirmed download works in dev mode. |
| 9 | Export PDF button is amber and disabled when no results exist | ✓ VERIFIED | MatchPage.tsx lines 245-258: `disabled={pdfLoading \|\| results.length === 0}`. CSS classes: `bg-[#D97706]/40 cursor-not-allowed` when empty, `bg-[#D97706]` when results exist. |
| 10 | npm run build exits 0 with no TypeScript errors | ✗ FAILED | Build fails with: `[vite]: Rollup failed to resolve import "@react-pdf/renderer" from MatchPage.tsx`. Package declared in package.json (^4.4.1) and package-lock.json (resolved entry exists) but not present in node_modules. node_modules/.package-lock.json dated March 29 — never updated after April 12 npm install. |

**Score:** 9/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/index.css` | @custom-variant dark + :root.dark CSS variable overrides | ✓ VERIFIED | Contains `@custom-variant dark (&:where(.dark, .dark *))` at line 3 (before `:root {}`), `:root.dark` block with 7 token overrides including `--color-surface: #0F172A` and `--color-text-primary: #F8FAFC`. |
| `apps/web/index.html` | FOUC prevention script, updated title, favicon link to /favicon.svg | ✓ VERIFIED | FOUC script is first `<head>` child, title uses `&#8212;` em-dash entity, favicon href is `/favicon.svg`. |
| `apps/web/src/components/AppShell.tsx` | Dark mode toggle button + handleThemeToggle | ✓ VERIFIED | Imports `Sun, Moon` from lucide-react, `isDark` state with lazy initializer, `handleThemeToggle` function manipulates classList + localStorage. Toggle button with aria-label in header. |
| `apps/web/public/favicon.svg` | PharmIQ teal SVG mark containing #0F766E | ✓ VERIFIED | Exists. Contains `<polygon>` hexagon frame with `stroke="#0F766E"` and 3 `<rect>` bars using `#0F766E` and `#14B8A6`. |
| `apps/web/src/pages/Dashboard.tsx` | Two-state landing screen (empty vs populated) | ✓ VERIFIED | Imports `useStores`, branches on `hasStores`. Both states use `var(--color-*)` references with no hardcoded hex. |
| `apps/web/src/components/TransferReportPDF.tsx` | @react-pdf/renderer Document component with header and 8-column table | ✓ VERIFIED | Exists. Exports `TransferReportPDF`. Imports `Document, Page, View, Text, StyleSheet`. Size="A4", orientation="landscape". All 8 column headers present (SKU, Description, Source Store, Destination, Qty, Dest ROU, Months Cover, Sell-Through). Uses `r.bestMatch.store` (best-match only per spec). No `Font.register`. |
| `apps/web/src/pages/MatchPage.tsx` | handleExportPdf using dynamic import + pdf().toBlob() | ✓ VERIFIED | Contains `handleExportPdf` async function with `Promise.all([import('@react-pdf/renderer'), import('../components/TransferReportPDF')])`. Calls `pdf(...).toBlob()`. No static import or PDFDownloadLink (correctly replaced per React 19 fix). |
| `apps/web/package.json` | @react-pdf/renderer dependency | ✓ VERIFIED | `"@react-pdf/renderer": "^4.4.1"` present in dependencies. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `apps/web/index.html` (inline script) | `document.documentElement.classList` | `localStorage.getItem('theme') === 'dark'` | ✓ WIRED | index.html lines 4-9 contain exactly this pattern: `localStorage.getItem('theme')` → conditional `classList.add('dark')`. |
| `apps/web/src/components/AppShell.tsx` | `document.documentElement.classList + localStorage` | `handleThemeToggle` | ✓ WIRED | `classList.add('dark')` / `classList.remove('dark')` and `localStorage.setItem` both present inside `handleThemeToggle`. |
| `apps/web/src/index.css` | All component surface/text/border tokens | `var(--color-*)` CSS variable references | ✓ WIRED | Zero hardcoded neutral hex values remain in component files (confirmed via grep — only exempt semantic/brand colors `#D97706`, `#EF4444`, `#0F766E`, etc. remain). |
| `apps/web/src/pages/MatchPage.tsx` | `apps/web/src/components/TransferReportPDF.tsx` | Dynamic `import('../components/TransferReportPDF')` inside `handleExportPdf` | ✓ WIRED (code) / ✗ BROKEN (build) | The code wiring is correct — dynamic import is present. However, Rollup cannot resolve `@react-pdf/renderer` (missing from node_modules), so the build fails. Runtime wiring is functional in dev mode. |
| `apps/web/src/pages/MatchPage.tsx` | `@clerk/react useOrganization` | `useOrganization().organization?.name` | ✓ WIRED | `useOrganization` imported from `@clerk/react`, called at line 30, `orgName` falls back to `'PharmIQ'`. |
| `apps/web/src/components/TransferReportPDF.tsx` | `apps/web/src/hooks/useMatchRun.ts MatchResult type` | `import type { MatchResult } from '../hooks/useMatchRun'` | ✓ WIRED | Import present at line 7 of TransferReportPDF.tsx. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `Dashboard.tsx` | `stores` (from `useStores()`) | `useStores` hook → `fetchApi('/api/stores')` API call | Yes — fetches from authenticated Worker API backed by NEON Postgres | ✓ FLOWING |
| `MatchPage.tsx` | `results` (from `useMatchRun()`) | `useMatchRun` hook → `runMatch()` → API call | Yes — results populated by match algorithm API | ✓ FLOWING |
| `TransferReportPDF.tsx` | `results` prop | Passed from `handleExportPdf` — same `results` array from `useMatchRun` | Yes — same real data as on-screen table | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run build` exits 0 | `cd apps/web && npm run build` | `[vite]: Rollup failed to resolve import "@react-pdf/renderer"` | ✗ FAIL |
| index.css contains `@custom-variant dark` | `grep "@custom-variant dark" apps/web/src/index.css` | Match found at line 3 | ✓ PASS |
| index.css contains `:root.dark` block | `grep ":root.dark" apps/web/src/index.css` | Match found at line 31 | ✓ PASS |
| FOUC script in index.html | `grep "localStorage.getItem" apps/web/index.html` | Match found at line 6 | ✓ PASS |
| favicon.svg contains teal color | `grep "#0F766E" apps/web/public/favicon.svg` | Match found in polygon + rect elements | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|-------------|-------------|--------|---------|
| BRAND-01 | 06-01-PLAN.md | UI implements PharmIQ brand guide — teal #0F766E primary, amber #D97706 accent, navy #0F172A dark base, Space Grotesk (headings) + Inter (body) | ✓ SATISFIED | CSS variables defined in `:root {}` block. All components use `var(--color-teal)`, `var(--color-navy)`. index.css body rule sets Inter, headings rule sets Space Grotesk. Zero hardcoded neutral hex in component files. |
| BRAND-02 | 06-01-PLAN.md | Dark mode toggle with localStorage persistence | ✓ SATISFIED | AppShell has toggle button. `handleThemeToggle` persists to localStorage. FOUC inline script applies theme before React renders. |
| RESULTS-02 | 06-02-PLAN.md | User can export match results as a PDF (client-side via @react-pdf/renderer) | ✓ SATISFIED (functionally) / ✗ BUILD BROKEN | Code is correct and human verification confirmed PDF export works in dev mode. Build fails because @react-pdf is not installed in node_modules — requires `npm install` to resolve. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/components/TransferReportPDF.tsx` | 6 | `import { ... } from '@react-pdf/renderer'` — static import of package not installed in node_modules | Blocker | Rollup cannot resolve this import chain, causing production build failure |
| `apps/web/src/pages/MatchPage.tsx` | 98 | `import('@react-pdf/renderer')` — dynamic import of package not installed in node_modules | Blocker | Rollup resolves dynamic imports during build, fails when package is missing |

Note on TransferReportPDF.tsx hardcoded hex values (#F8FAFC, #CBD5E1, #E2E8F0, #0F172A, #475569, etc.): These are intentional — the PDF renderer uses its own rendering pipeline independent of CSS variables. Hardcoded hex in PDF StyleSheet objects is correct and not a stub.

### Human Verification Required

All observable UI behaviors were confirmed by the developer during the human-verify checkpoint in both plans. The following items remain for human verification on the next build:

#### 1. Production Build Success

**Test:** Run `cd apps/web && npm install && npm run build`
**Expected:** Build exits 0, dist/ folder is populated, chunk size warning for @react-pdf (~1946 kB) is acceptable
**Why human:** Build environment may differ; npm install success/failure depends on network access to npm registry

#### 2. PDF Export End-to-End (Post Build-Fix)

**Test:** After build succeeds, serve `dist/` and click Export PDF with results loaded
**Expected:** PDF downloads as `pharmiq-transfer-report-YYYY-MM-DD.pdf`, landscape A4, PharmIQ header, 8-column table with best-match data
**Why human:** PDF content (layout, fonts, column alignment) cannot be verified programmatically without running the browser renderer

### Gaps Summary

**One gap blocks full goal achievement:**

The `@react-pdf/renderer` package is listed in `apps/web/package.json` (`"@react-pdf/renderer": "^4.4.1"`) and its entry exists in `apps/web/package-lock.json` (resolved to v4.4.1 from npm registry), but the package files are absent from `apps/web/node_modules/`. The node_modules inner lock file (`node_modules/.package-lock.json`) is dated March 29, predating the April 12 npm install. This indicates `npm install` was invoked (updating the outer lock file) but the actual package extraction into node_modules did not complete in the current environment.

**Root cause:** `npm install` was run in a different shell/environment session or the node_modules was not persisted after install. The Vite dev server (used for human verification) can resolve dynamic imports lazily without Rollup's full resolution check, so the dev server worked correctly. Production builds via Vite/Rollup fail because Rollup resolves all dynamic import chains at build time.

**Fix:** `cd apps/web && npm install` — this will install `@react-pdf/renderer` and its dependency tree into node_modules, after which `npm run build` should exit 0.

All other phase deliverables — dark mode CSS infrastructure, toggle button, FOUC prevention, favicon, em-dash title, Dashboard two-state screen, TransferReportPDF component, imperative pdf().toBlob() export pattern — are fully implemented, substantive, and wired correctly.

---

_Verified: 2026-04-12T05:45:00Z_
_Verifier: Claude (gsd-verifier)_
