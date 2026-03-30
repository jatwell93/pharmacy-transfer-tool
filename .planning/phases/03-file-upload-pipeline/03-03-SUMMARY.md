---
phase: 03-file-upload-pipeline
plan: "03"
subsystem: ui
tags: [upload, ui, react, tailwind, modal, store-card, useStores, clerk, react-router]
dependency_graph:
  requires: [03-02 (POST /api/upload, GET /api/stores endpoints)]
  provides: [UploadPage, StoreCard, UploadModal, FileStatusBadge, useStores hook, /upload route, Upload nav enabled]
  affects: [apps/web/src/App.tsx, apps/web/src/components/AppShell.tsx, apps/web/src/components/NavItem.tsx]
tech_stack:
  added: []
  patterns: [react-router-link-nav, useFetch-multipart-upload, modal-focus-trap, controlled-file-inputs, replace-confirmation-banner, useFetch-ref-stabilisation]
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
    - apps/web/src/hooks/useFetch.ts
    - apps/worker/src/middleware/auth.ts
    - apps/worker/src/routes/upload.ts
decisions:
  - NavItem updated to use react-router Link for SPA navigation (replaces <a> tag for enabled items)
  - UploadModal does not set Content-Type header on FormData POST — browser auto-sets multipart boundary
  - Focus trap implemented via Tab keydown listener querying focusable elements dynamically to handle disabled states during upload
  - Replace-confirmation uses inline amber banner (not a separate dialog) — Upload Files button is the confirmation action
  - useFetch stabilised with ref pattern to prevent infinite render loop caused by Clerk session refreshes
  - authorizedParties expanded to include both localhost:5173 and localhost:5174 — Vite allocates either port
  - Org FK upsert added before store insert in upload route — ensures org row exists before FK constraint check
  - VITE_WORKER_URL corrected to port 8787 (wrangler dev default)
  - 03-02 worktree branch merged to main before verification could proceed
requirements-completed: [UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04]
metrics:
  duration_seconds: 227
  completed_date: "2026-03-30"
  tasks_completed: 3
  files_created: 5
  files_modified: 6
---

# Phase 03 Plan 03: Upload Page UI Summary

Upload page UI built with card grid (per-store ROU/dead-stock status), UploadModal with file pickers, replace-confirmation warning, help tooltips, focus trap, and loading state — all wired to the Plan 02 API endpoints, with Upload nav item enabled via react-router Link. Human verification passed after six auto-fixes including a useFetch render-loop fix and a worktree branch merge.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useStores hook, FileStatusBadge, StoreCard, UploadModal | fe6a41f | apps/web/src/hooks/useStores.ts, apps/web/src/components/FileStatusBadge.tsx, apps/web/src/components/StoreCard.tsx, apps/web/src/components/UploadModal.tsx |
| 2 | Wire UploadPage, update routing, enable Upload nav | fe7822f | apps/web/src/pages/UploadPage.tsx, apps/web/src/App.tsx, apps/web/src/components/AppShell.tsx, apps/web/src/components/NavItem.tsx |
| 3 | Human verification — APPROVED with fixes | cc6f3c2 | apps/web/src/hooks/useFetch.ts, apps/worker/src/middleware/auth.ts, apps/worker/src/routes/upload.ts, apps/web/src/components/UploadModal.tsx |

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

Six issues were found and fixed during human verification (all committed in cc6f3c2 and 84a68e2).

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 03-02 worktree branch not merged to main**
- **Found during:** Task 3 (human verification)
- **Issue:** upload.ts and the route mount in index.ts were committed on a diverged worktree branch (worktree-agent-aab1ba11), not on main. The running app had no upload routes.
- **Fix:** Merged worktree branch to main (commit 84a68e2)
- **Files modified:** apps/worker/src/routes/upload.ts, apps/worker/src/index.ts
- **Verification:** GET /api/stores and POST /api/upload responded correctly after merge
- **Committed in:** 84a68e2

**2. [Rule 1 - Bug] VITE_WORKER_URL pointed to wrong port**
- **Found during:** Task 3 (human verification)
- **Issue:** VITE_WORKER_URL was set to port 5174 (Vite secondary port) instead of 8787 (wrangler dev default), causing all API calls to fail
- **Fix:** Corrected VITE_WORKER_URL to http://localhost:8787 in .env.local
- **Files modified:** apps/web/.env.local (gitignored — fix documented here)
- **Verification:** API calls reached wrangler dev server successfully
- **Committed in:** cc6f3c2 (fix description)

**3. [Rule 1 - Bug] useFetch render loop on Clerk session refresh**
- **Found during:** Task 3 (human verification)
- **Issue:** useStores useEffect depended on fetchApi returned from useFetch; Clerk's session refresh caused fetchApi to be recreated on every render, causing GET /stores to fire in an infinite loop
- **Fix:** Stored the underlying fetch function in useRef inside useFetch so the returned callback has stable identity across renders
- **Files modified:** apps/web/src/hooks/useFetch.ts
- **Verification:** Page reload confirmed — GET /stores called once on mount, not in a loop
- **Committed in:** cc6f3c2

**4. [Rule 1 - Bug] authorizedParties only included one Vite port**
- **Found during:** Task 3 (human verification)
- **Issue:** Clerk JWT azp validation failed when Vite allocated port 5174 instead of 5173 — authorizedParties only listed 5173, causing "Invalid azp" errors
- **Fix:** Added localhost:5174 to authorizedParties in auth middleware alongside 5173
- **Files modified:** apps/worker/src/middleware/auth.ts
- **Verification:** Sign-in and authenticated requests succeeded regardless of which Vite port was allocated
- **Committed in:** cc6f3c2

**5. [Rule 2 - Missing Critical] Org FK upsert missing from upload route**
- **Found during:** Task 3 (human verification)
- **Issue:** POST /api/upload failed with a foreign key constraint error on first upload — org row not yet present in NEON orgs table
- **Fix:** Added an org upsert (INSERT ... ON CONFLICT DO NOTHING) before the store insert so the FK constraint is always satisfied
- **Files modified:** apps/worker/src/routes/upload.ts
- **Verification:** First-time upload for a new org succeeded without FK error
- **Committed in:** cc6f3c2

**6. [Rule 2 - Missing Critical] Parse error messages lacked actionable column information**
- **Found during:** Task 3 (human verification)
- **Issue:** When a file failed column detection, the error message was generic ("parse error") — pharmacy managers had no indication of which columns were expected
- **Fix:** Error messages now include expected column names per file type (e.g., "Expected columns: SKU, Store, ROU"). Replace-confirmation copy also improved: "Click Upload to continue or Escape to return" replaces bare "Continue?"
- **Files modified:** apps/worker/src/routes/upload.ts, apps/web/src/components/UploadModal.tsx
- **Verification:** Upload of a wrong-format file showed expected column names in the inline error zone
- **Committed in:** cc6f3c2

---

**Total deviations:** 6 auto-fixed (2 bugs, 2 missing critical, 1 blocking, 1 UX copy improvement)
**Impact on plan:** All fixes were required for the upload pipeline to function end-to-end. The worktree merge was the most critical — without it the Worker had no upload routes. No scope creep.

## Known Stubs

None — all components are fully wired and verified end-to-end.

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
- Commit cc6f3c2 (verification fixes): FOUND
- Human verification: APPROVED
