# Phase 3: File Upload Pipeline - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Give pharmacy managers a way to upload FRED ROU and dead-stock CSV/XLSX exports for each store in their group. Each store has its own card showing per-file upload status and last-updated timestamps. Files are uploaded via a modal dialog. Data persists in NEON; individual stores can be re-uploaded independently without re-uploading the whole group.

This phase does NOT include: running the matching algorithm, freemium enforcement, or brand polish. It is strictly the upload pipeline, parser, persistence layer, and per-store status UI.

</domain>

<decisions>
## Implementation Decisions

### Store Naming Model
- **D-01:** Upload form has two fields: **Store Name** (required, e.g. "Balwyn") and **Store Number** (optional, e.g. "987"). Both are free-text. A new `stores` row is created automatically on first upload for that name within the org. Store is uniquely identified by name within the org.
- **D-02:** Re-uploading for an existing store name triggers a confirmation warning before overwriting: "This will replace [Store Name]'s [ROU/dead-stock] data. Continue?" Silent replace is NOT used — user must confirm.
- **D-03:** Store number is metadata — displayed on the card but not used as the primary key. The matching algorithm (Phase 4) identifies stores by name.

### Upload Page Layout
- **D-04:** Upload page uses a **card grid** layout. One card per store. Each card shows: store name (and store number if set), ROU last-uploaded timestamp, dead-stock last-uploaded timestamp, and an "Upload files" button.
- **D-05:** A **"+ Add store"** button sits at the top of the page (header area). Clicking it opens the upload modal with empty store name/number fields (new store flow).
- **D-06:** Clicking "Upload files" on a store card opens a **modal dialog** containing: store name (pre-filled read-only), store number (pre-filled read-only), ROU file picker, dead-stock file picker, Upload button, and close button. The store name/number fields are editable in the new-store flow only.
- **D-07:** Empty state (no stores yet): centred message "No stores yet — add your first store to get started" with a prominent Add Store CTA button.

### ROU + Dead-Stock File Pairing
- **D-08:** Both file fields in the modal are **independently optional**. Uploading just ROU updates only that store's ROU data; dead-stock data remains as-is (and vice versa). At least one file must be selected for the Upload button to activate.
- **D-09:** Each file's status is shown **independently** on the store card:
  - `ROU: ✓ 29 Mar 2026, 14:32` — uploaded and timestamped
  - `Dead: – not uploaded` — missing
  This makes it immediately clear which file needs attention.
- **D-10:** No completeness validation at upload time. A store can exist with only ROU or only dead-stock data. The Match page (Phase 4) is responsible for validating that all selected stores have both files before running a match.
- **D-11:** Dead-stock is expected to be updated more frequently than ROU (sales velocity is stable; dead-stock SKUs change regularly). The independent per-file upload path directly supports this workflow — updating dead-stock for a store should be a single-click action from the card.

### Parser Placement
- **D-12:** Parsing happens **in the Worker** (server-side). The browser sends the raw file as `multipart/form-data`. The Worker parses CSV/XLSX, extracts rows, and bulk-inserts into NEON. No SheetJS dependency in the frontend — it stays lean.
- **D-13:** **5 MB per-file hard limit** enforced in the Worker before parsing begins (UPLOAD-06). If exceeded, the Worker returns a 413 with a JSON error body. The modal surfaces this inline under the file picker: "File too large — maximum 5 MB. Your file is [X] MB."
- **D-14:** A **help tooltip icon** (ⓘ) appears alongside the file pickers in the upload modal. Tooltip content:
  - Before exporting from FRED: filter by relevant departments/categories, filter for ROU > 0.01, filter for active items only, filter out $0 cost lines
  - Review in a spreadsheet (Excel / Google Sheets / LibreCalc) and delete unnecessary rows before upload
- **D-15:** The Worker parser **silently drops unrecognised columns** — only columns required by the NEON schema are retained. This reduces payload size and makes the parser robust against FRED export format variations (extra columns, reordered columns, custom fields).

### Claude's Discretion
- Exact XLSX parsing library for the Worker (SheetJS `xlsx` npm package, `exceljs`, or a lighter alternative — pick what works in the Workers runtime without ESM issues)
- Whether the upload endpoint is two separate routes (`POST /api/upload/rou` + `POST /api/upload/dead-stock`) or a single route with a `type` field — prefer whatever keeps the API surface clean
- Pagination or row limits for the store card grid (if an org has many stores)
- Exact Postgres `upsert` vs `delete + insert` strategy for replacing store data
- Animation/transition details for the modal open/close

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Definition
- `.planning/ROADMAP.md` §Phase 3 — goal, success criteria (6 items), dependencies, requirements list
- `.planning/REQUIREMENTS.md` UPLOAD-01 through UPLOAD-06 — exact upload and parsing requirements

### NEON Schema (already created in Phase 1)
- `.planning/phases/01-foundation/01-CONTEXT.md` §D-03 — full schema: `stores` (id, org_id, name, created_at), `rou_data` (id, org_id, store_id, sku, description, rou, soh, uploaded_at), `dead_stock` (id, org_id, store_id, sku, description, soh, is_ranged, uploaded_at). Phase 3 inserts into these tables — no new migrations needed.

### Existing Worker Code (integration points)
- `apps/worker/src/index.ts` — Hono app with `app.route('/api', ...)` pattern; new upload routes mount here
- `apps/worker/src/db/client.ts` — `withOrgContext` for RLS-scoped NEON queries; all insert/select operations in Phase 3 must use this
- `apps/worker/src/types.ts` — `Env` and `Variables` interfaces; upload route handlers use the same bindings

### Existing Web App (UI integration points)
- `apps/web/src/components/AppShell.tsx` — Upload nav item is currently `disabled={true}` (line 36); Phase 3 enables it and adds the Upload route
- `apps/web/src/hooks/useFetch.ts` — existing authenticated fetch hook; use for all API calls from the Upload page

### Brand & UI
- `brand-identity-pharma-apps/brand-identity/brand-guidelines.md` — PharmIQ brand guide: colour palette, typography. Required for card grid, modal, and status badge styling.

### Existing Parser Reference (Django prototype — do not copy architecture)
- `stock_transfer_project/api/views.py` — `HEADER_ALIASES`, `find_header_row()`, `normalize_headers()` functions; port the header-aliasing and blank-row-scanning logic to TypeScript
- `dead-stock-tranfer-app/src/App.js` — existing `handleFileUpload` and `FileUploader` component; reference for UX pattern only

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/hooks/useFetch.ts` — authenticated fetch hook; use for upload API calls (handles Clerk JWT header automatically)
- `apps/web/src/components/AppShell.tsx` — shell layout and nav; Upload page slots into the `<main>` area as a new route/page component

### Established Patterns
- `withOrgContext` (db/client.ts) — all NEON queries must go through this; ensures RLS is enforced per org
- Hono `app.route('/api', routeModule)` — new upload routes follow this pattern; create `apps/worker/src/routes/upload.ts`
- Tailwind utility classes + PharmIQ brand tokens (`#0F766E`, `#D97706`, `#0F172A`) — use these directly on JSX elements
- `async/await` throughout — no `.then()` chains
- camelCase JSON keys in all API responses

### Integration Points
- AppShell Upload nav item (`disabled={true}`) — Phase 3 enables this link and adds the `/upload` route
- Worker `index.ts` — add `app.route('/api', uploadRoute)` alongside existing health route
- NEON `stores` table — Phase 3 creates rows here on first upload; Phase 4 reads them for the match store selector
- NEON `rou_data` + `dead_stock` tables — Phase 3 bulk-inserts parsed rows; Phase 4 fetches them for the algorithm

</code_context>

<specifics>
## Specific Ideas

- The card grid should show a visible "incomplete" indicator when a store has one file but not the other — makes it easy to spot before attempting a match run
- The help tooltip tips (D-14) are the user's own domain knowledge — use them verbatim or close to it in the actual tooltip copy
- Store number display format on the card: show as "Balwyn (987)" if both name and number are set, plain "Balwyn" if number is absent
- The replace-confirmation warning (D-02) should specify which file type(s) are being replaced, not just the store name

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-file-upload-pipeline*
*Context gathered: 2026-03-29*
