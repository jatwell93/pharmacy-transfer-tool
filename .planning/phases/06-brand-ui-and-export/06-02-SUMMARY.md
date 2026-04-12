---
phase: 06-brand-ui-and-export
plan: 02
subsystem: frontend/pdf-export
tags: [pdf, react-pdf, export, ux, brand]
dependency_graph:
  requires: []
  provides: [pdf-export-button, transfer-report-pdf]
  affects: [apps/web/src/pages/MatchPage.tsx]
tech_stack:
  added: ["@react-pdf/renderer@4.4.1"]
  patterns: [PDFDownloadLink, useMemo-document, system-fonts-pdf]
key_files:
  created:
    - apps/web/src/components/TransferReportPDF.tsx
  modified:
    - apps/web/package.json
    - apps/web/package-lock.json
    - apps/web/src/pages/MatchPage.tsx
decisions:
  - "System fonts (Helvetica) used in PDF — no Font.register with gstatic.com URLs (avoids CSP/CORS issues on Cloudflare Pages)"
  - "pdfDocument wrapped in useMemo keyed on [results, orgName] — prevents PDF re-generation on unrelated renders like months-cover slider changes"
  - "PDFDownloadLink render-prop loading variable renamed to pdfLoading — avoids shadowing the outer loading from useMatchRun()"
  - "Chunk size warning (~1946 kB) accepted — @react-pdf/renderer embeds full PDF engine; code-splitting deferred to a future optimisation phase"
metrics:
  duration_seconds: 840
  completed_date: "2026-04-12T03:03:10Z"
  tasks_completed: 2
  tasks_total: 3
  files_created: 1
  files_modified: 3
---

# Phase 6 Plan 2: PDF Export Summary

## One-liner

Client-side PDF export via `@react-pdf/renderer` — landscape A4, PharmIQ header, 8-column table, amber download button wired into MatchPage with `PDFDownloadLink`.

## What Was Built

### Task 1: Install @react-pdf/renderer and create TransferReportPDF component

- Installed `@react-pdf/renderer@4.4.1` into `apps/web/package.json`
- Created `apps/web/src/components/TransferReportPDF.tsx` — a typed React component consuming `MatchResult[]` and `orgName: string`
- PDF layout: landscape A4, 32px padding, Helvetica system font throughout
- Header row: "PharmIQ — Dead-Stock Transfer Report" in teal `#0F766E`, org name + generated date subtitle, transfer count on the right
- 8-column table with column flex ratios: SKU(1.2), Description(2), Source Store(1.2), Destination(1.2), Qty(0.7), Dest ROU(0.7), Months Cover(0.9), Sell-Through(0.9)
- Alternating row background (white / `#F8FAFC`) for readability
- Sticky footer with "PharmIQ Stock Transfer · pharmiq.com.au" and `Page N of M` page numbers
- Uses `bestMatch` only — one row per dead-stock SKU (D-06 compliance)
- No `Font.register` — Helvetica system fonts only (Pitfall 2 avoidance)

**Commit:** `2eeac0a`

### Task 2: Wire Export PDF button into MatchPage with PDFDownloadLink

- Added three imports to `MatchPage.tsx`: `PDFDownloadLink` from `@react-pdf/renderer`, `useOrganization` from `@clerk/react`, `TransferReportPDF` from `../components/TransferReportPDF`
- Added `useOrganization()` call; `orgName` falls back to `'PharmIQ'` when `organization` is null
- Wrapped `<TransferReportPDF>` in `useMemo([results, orgName])` as `pdfDocument`
- Replaced bare `<h1>` header div with `flex items-center justify-between` header containing:
  - Left: "Match Results" h1 (Space Grotesk, unchanged)
  - Right: `PDFDownloadLink` with amber Export PDF button
- Button states:
  - Disabled + muted amber (`#D97706/40`) when `results.length === 0` or `pdfLoading`
  - Enabled full amber (`#D97706`) with hover `#B45309` when results exist
  - `cursor-not-allowed` when disabled
- Filename: `pharmiq-transfer-report-YYYY-MM-DD.pdf` (today's date at click time)
- `aria-label="Export match results as PDF"` for accessibility

**Commit:** `fae6ba0`

### Task 3: Human Verification (checkpoint — pending)

Human verification of PDF export functionality in running dev server is pending.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — PDF document receives live `results` from `useMatchRun()` and `orgName` from Clerk. No hardcoded placeholder data.

## Threat Flags

No new security surface introduced beyond what the plan's threat model covers. PDF is generated client-side in-memory only; no server storage. All data originates from the authenticated API.

## Self-Check: PASSED

- FOUND: apps/web/src/components/TransferReportPDF.tsx
- FOUND: apps/web/package.json (contains @react-pdf/renderer)
- FOUND: apps/web/src/pages/MatchPage.tsx (contains PDFDownloadLink)
- Commit 2eeac0a: verified in git log
- Commit fae6ba0: verified in git log
- npm run build: exits 0 (chunk size warning only — not an error)
