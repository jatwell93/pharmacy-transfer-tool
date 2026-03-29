---
phase: 03-file-upload-pipeline
plan: "03"
subsystem: web/upload-ui
tags: [upload, ui, react, tailwind, modal, store-card, useStores, clerk, react-router]
dependency_graph:
  requires: [03-02 (POST /api/upload, GET /api/stores endpoints)]
  provides: [UploadPage, StoreCard, UploadModal, FileStatusBadge, useStores hook, /upload route, Upload nav enabled]
  affects: [apps/web/src/App.tsx, apps/web/src/components/AppShell.tsx, apps/web/src/components/NavItem.tsx]
tech_stack:
  added: []
  patterns: [react-router-link-nav, useFetch-multipart-upload, modal-focus-trap, controlled-file-inputs, replace-confirmation-banner]
key_files:
  created:
    - apps/web/src/hooks/useStores.ts
    - apps/web/src/components/FileStatusBadge.tsx
    - apps/web/src/components/StoreCard.tsx
    - apps/web/src/components/UploadModal.tsx
    - apps/web/src/pages/UploadPage.tsx
  modified:
    - apps/web/src/components/NavItem.tsx
    - apps/web/src/components/AppShell.tsx
    - apps/web/src/App.tsx
decisions:
  - NavItem updated to use react-router Link for SPA navigation (replaces <a> tag for enabled items)
  - UploadModal does not set Content-Type header on FormData POST — browser auto-sets multipart boundary
  - Focus trap implemented via Tab keydown listener querying focusable elements dynamically to handle disabled states during upload
  - Replace-confirmation uses inline amber banner (not a separate dialog) — Upload Files button is the confirmation action
metrics:
  duration_seconds: 227
  completed_date: "2026-03-29"
  tasks_completed: 2
  files_created: 5
  files_modified: 3
---

# Phase 03 Plan 03: Upload Page UI Summary

Upload page UI built with card grid (per-store ROU/dead-stock status), UploadModal with file pickers, replace-confirmation warning, help tooltips, focus trap, and loading state — all wired to the Plan 02 API endpoints, with Upload nav item enabled via react-router Link.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useStores hook, FileStatusBadge, StoreCard, UploadModal | fe6a41f | apps/web/src/hooks/useStores.ts, apps/web/src/components/FileStatusBadge.tsx, apps/web/src/components/StoreCard.tsx, apps/web/src/components/UploadModal.tsx |
| 2 | Wire UploadPage, update routing, enable Upload nav | fe7822f | apps/web/src/pages/UploadPage.tsx, apps/web/src/App.tsx, apps/web/src/components/AppShell.tsx, apps/web/src/components/NavItem.tsx |

## What Was Built

### apps/web/src/hooks/useStores.ts

Custom hook that fetches the store list via `GET /api/stores`:
- Exports `Store` interface with all API fields (`id`, `name`, `storeNumber`, `createdAt`, `rouUploadedAt`, `dsUploadedAt`)
- Returns `{ stores, loading, error, refresh }` — refresh is a `useCallback`-memoized function for post-upload refreshes
- Uses `useFetch` for authenticated requests (Clerk JWT header auto-added)

### apps/web/src/components/FileStatusBadge.tsx

Two-state visual component:
- Uploaded: green dot (`bg-[#10B981]`) + en-AU formatted date string (`"29 Mar 2026, 14:32"`)
- Not uploaded: em dash + "not uploaded" in muted text (`text-[#94A3B8]`)
- Label prefix shown in semibold (`"ROU:"` or `"Dead:"`)

### apps/web/src/components/StoreCard.tsx

Per-store card component:
- Store name displayed as `"{Name} ({Number})"` or plain `"{Name}"` when no store number
- Amber incomplete indicator (`bg-[#D97706]` + "Missing files") visible only when exactly one file uploaded
- Two `FileStatusBadge` rows (ROU + Dead)
- "Upload files" button — teal text, full 44px touch target, calls `onUploadClick(store)`

### apps/web/src/components/UploadModal.tsx

Full-featured modal dialog:
- Two modes: new-store (store name/number editable) and existing-store (fields read-only, pre-filled)
- Modal title: "Add Store" (new) or "Upload Files — {Store Name}" (existing)
- File pickers with `.csv,.xlsx` accept filter, help tooltip (ⓘ) with FRED export instructions
- Replace-confirmation amber banner (`border-[#D97706] bg-[#FEF3C7]`) when re-uploading an already-uploaded file type
- Inline error zones below each file picker (`role="alert"`) for 413 and parse errors
- Loading state: spinner + "Uploading...", all fields disabled, modal not closable
- Escape key and overlay click dismiss (blocked during upload)
- Focus trap via Tab keydown listener — cycles within dialog only
- Upload handler POSTs FormData to `/api/upload` without Content-Type header (browser sets multipart boundary)
- Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="modal-title"`, all buttons have `aria-label`

### apps/web/src/pages/UploadPage.tsx

Page component using all the upload pieces:
- Header row: "Upload Stores" h1 + "Add Store" primary CTA button
- Loading state: centered `<Loader2>` spinner while stores fetch
- Error state: centered red error message
- Empty state ("No stores yet"): heading, body copy, "Add Store" CTA button centered
- Store card grid: `grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4`
- `<UploadModal>` wired with `onUploadComplete={refresh}` for post-upload card refresh

### apps/web/src/components/NavItem.tsx

Updated to use react-router `<Link>` for SPA navigation:
- Enabled items (disabled={false}) render `<Link to={href}>` — no full page reload
- Disabled items still render `<a>` with `aria-disabled="true"` and "Coming soon" title

### apps/web/src/components/AppShell.tsx

Upload NavItem enabled:
- Changed from `disabled={true}` to `disabled={false}` with `href="/upload"`
- All other nav items (Match, Billing, Settings) remain `disabled={true}`

### apps/web/src/App.tsx

Added `/upload` route:
- `<Route path="/upload" element={<ProtectedRoute requireOrg={true}><UploadPage /></ProtectedRoute>} />`
- Route placed before the catch-all `<Navigate to="/" replace />`

## Verification Results

```
cd apps/web && npx tsc --noEmit → exits 0 (TSC: PASSED)
cd apps/worker && npm test -- --run → 53 passed (53), no regressions
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all components are fully wired. The upload pipeline is end-to-end functional pending human verification in Task 3 (checkpoint).

## Self-Check: PASSED

- apps/web/src/hooks/useStores.ts exists: FOUND
- apps/web/src/components/FileStatusBadge.tsx exists: FOUND
- apps/web/src/components/StoreCard.tsx exists: FOUND
- apps/web/src/components/UploadModal.tsx exists: FOUND
- apps/web/src/pages/UploadPage.tsx exists: FOUND
- apps/web/src/components/NavItem.tsx contains Link from react-router: FOUND
- apps/web/src/components/AppShell.tsx contains disabled={false} href="/upload": FOUND
- apps/web/src/App.tsx contains path="/upload": FOUND
- Commit fe6a41f: FOUND
- Commit fe7822f: FOUND
