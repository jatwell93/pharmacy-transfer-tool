# Phase 3: File Upload Pipeline — Research

**Researched:** 2026-03-29
**Domain:** Hono multipart file upload, SheetJS XLSX parsing in Cloudflare Workers, NEON bulk insert, React Router v7 routing, modal accessibility
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Upload form has two fields: Store Name (required) and Store Number (optional). Both free-text. New `stores` row created automatically on first upload for that name within the org. Store uniquely identified by name within the org.

**D-02:** Re-uploading for an existing store triggers a confirmation warning before overwriting. Silent replace is NOT used — user must confirm.

**D-03:** Store number is metadata — displayed on the card but not used as the primary key.

**D-04:** Upload page uses a card grid layout. One card per store. Each card shows: store name (and store number if set), ROU last-uploaded timestamp, dead-stock last-uploaded timestamp, and an "Upload files" button.

**D-05:** A "+ Add store" button sits at the top of the page. Opens upload modal with empty store name/number fields (new store flow).

**D-06:** Clicking "Upload files" on a store card opens a modal containing: store name (pre-filled read-only), store number (pre-filled read-only), ROU file picker, dead-stock file picker, Upload button, and close button. Store name/number fields editable in new-store flow only.

**D-07:** Empty state: centred message "No stores yet — add your first store to get started" with a prominent Add Store CTA.

**D-08:** Both file fields independently optional. At least one file must be selected for the Upload button to activate.

**D-09:** Each file's status shown independently on the store card (`ROU: ✓ 29 Mar 2026, 14:32` / `Dead: – not uploaded`).

**D-10:** No completeness validation at upload time. Match page (Phase 4) validates completeness.

**D-11:** Dead-stock expected to update more frequently than ROU.

**D-12:** Parsing happens in the Worker (server-side). Browser sends raw file as `multipart/form-data`. SheetJS dependency is in the Worker, NOT the frontend.

**D-13:** 5 MB per-file hard limit enforced in the Worker before parsing. 413 response if exceeded. Modal surfaces this inline.

**D-14:** Help tooltip (ⓘ) alongside file pickers with FRED export guidance.

**D-15:** Worker parser silently drops unrecognised columns.

### Claude's Discretion

- Exact XLSX parsing library for the Worker (SheetJS `xlsx` npm package, `exceljs`, or lighter alternative — pick what works in Workers runtime without ESM issues)
- Whether the upload endpoint is two separate routes (`POST /api/upload/rou` + `POST /api/upload/dead-stock`) or a single route with a `type` field
- Pagination or row limits for the store card grid
- Exact Postgres `upsert` vs `delete + insert` strategy for replacing store data
- Animation/transition details for the modal open/close

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPLOAD-01 | User can upload a FRED Office ROU report (CSV or XLSX: Item Code, Item Description, ROU, SOH) for a named store | Worker multipart handler + SheetJS/CSV parser + NEON insert into `rou_data` |
| UPLOAD-02 | User can upload a FRED Office dead stock report (CSV or XLSX: Item Code, Item Description, SOH) for a named store | Same parser pipeline, different target table (`dead_stock`) |
| UPLOAD-03 | Uploaded store data persists in NEON Postgres; user does not need to re-upload all stores to run a new match | NEON `stores`, `rou_data`, `dead_stock` tables already created in Phase 1 — insert/query pattern documented |
| UPLOAD-04 | User can see when each store's data was last uploaded and replace it individually | `uploaded_at` timestamp already on `rou_data` and `dead_stock` tables; store card reads this from a `GET /api/stores` endpoint |
| UPLOAD-05 | Parser handles FRED-specific CSV quirks — UTF-8 BOM stripping, CRLF line endings, blank title rows before the header row | BOM: strip `\uFEFF` prefix from decoded string; CRLF: split on `/\r?\n/`; blank title rows: scan for header row matching `HEADER_ALIASES` pattern from Django prototype |
| UPLOAD-06 | Parser handles XLSX files via SheetJS (CDN tarball); enforces 5 MB per-file size cap | SheetJS `xlsx` 0.20.3 from CDN tarball confirmed working in Workers with `nodejs_compat_v2`; size check via `file.size` before `arrayBuffer()` |
</phase_requirements>

---

## Summary

Phase 3 adds a file upload pipeline to an already-deployed Cloudflare Workers + NEON + React stack. The core work splits into three layers: (1) a Hono route at `apps/worker/src/routes/upload.ts` that receives multipart form uploads, parses CSV/XLSX files, and bulk-inserts into NEON; (2) a `GET /api/stores` endpoint that returns per-org store metadata with per-file upload timestamps; and (3) a new `UploadPage` in the React app with a card grid, modal dialog, and per-store status indicators.

All server-side parsing is locked to the Worker (D-12). The `xlsx` npm package (SheetJS) at version 0.20.3 is the recommended XLSX parser — it works with `XLSX.read(buffer)` from an `ArrayBuffer` in the Workers runtime with `nodejs_compat_v2` already enabled in `wrangler.jsonc`. CSV parsing is handled without a library: strip BOM, split on `/\r?\n/`, scan rows for the header using the `HEADER_ALIASES` pattern from the Django prototype, then parse with column mapping. The NEON schema is already in place from Phase 1; the upload handler uses `DELETE WHERE store_id = $1` followed by bulk insert via `UNNEST` arrays to replace a single store's data atomically.

On the frontend, React Router v7 (already installed as `react-router@^7.0.0`) adds a `/upload` route. The modal is built from Tailwind utilities with a manual focus trap (`useRef` + `keydown` listener) — no third-party library needed. `useFetch` (existing) handles authenticated API calls automatically.

**Primary recommendation:** Use SheetJS `xlsx` 0.20.3 installed from CDN tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) in the Worker. Use a single upload endpoint (`POST /api/upload`) with a `type` field (`rou` or `dead-stock`) to keep the API surface clean. Use `DELETE + INSERT` (delete store's existing rows, then bulk-insert) rather than upsert — simpler and avoids conflict-column complexity on multi-column tables.

---

## Standard Stack

### Core (Worker)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `xlsx` (SheetJS) | 0.20.3 (CDN tarball) | XLSX + CSV parsing in Worker | Official SheetJS docs confirm `XLSX.read(buffer)` works with ArrayBuffer in CF Workers. Pure JS — no native deps. |
| `hono` | ^4.12.9 (already installed) | HTTP routing + `c.req.parseBody()` | Already in Worker; `parseBody()` returns `File` objects from multipart forms |
| `@neondatabase/serverless` | ^1.0.2 (already installed) | NEON bulk insert via HTTP | Already integrated via `withOrgContext`; composable template literals for bulk ops |

### Core (Web)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-router` | ^7.0.0 (already installed) | `/upload` route | Already installed; add `<Route path="/upload" element={...}>` to `App.tsx` |
| `lucide-react` | ^0.462.0 (already installed) | `Plus`, `X`, `Info`, `Loader2` icons | Already installed per UI-SPEC |
| Tailwind CSS v4 | ^4.0.0 (already installed) | All component styling | Project standard; CSS-first, no config file |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Built-in `TextDecoder` | Web API | Decode `ArrayBuffer` to string for CSV parsing | Available in Workers runtime; no import needed |
| `useRef` + `keydown` event | React built-in | Focus trap in modal | No third-party library needed for a single modal |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `xlsx` 0.20.3 from CDN tarball | `exceljs` 4.4.0 | ExcelJS is larger, stream-based, and has less evidence of Workers compatibility. SheetJS is the documented path. |
| `xlsx` 0.20.3 from CDN tarball | `@e965/xlsx` 0.20.3 | `@e965/xlsx` is a community-maintained fork of SheetJS published to npm registry — same API, avoids CDN tarball. A viable fallback if CDN tarball causes wrangler bundling issues. |
| Manual focus trap | `focus-trap-react` | Adding a dependency for a single modal is unnecessary overhead. The manual pattern (`useRef` + Tab/Shift+Tab key handler) is ~20 lines and well-documented. |
| DELETE + INSERT | `ON CONFLICT DO UPDATE` (upsert) | Upsert requires a unique constraint across `(org_id, store_id, sku)`. DELETE + INSERT is semantically correct for a full store data replacement and avoids constraint engineering. |
| Single `POST /api/upload` with `type` field | Two routes (`/api/upload/rou` + `/api/upload/dead-stock`) | Two routes is also clean but adds route boilerplate. Single route with `type` field is simpler and matches the modal's single-submit-for-both-files flow. |

**Installation (Worker — SheetJS):**
```bash
cd apps/worker
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

**Version verification (confirmed 2026-03-29):**
- `xlsx` (npm registry): 0.18.5 (last updated 2024-10-22) — **do NOT use this; it is the stale/abandoned npm registry version**
- `@e965/xlsx` (npm registry): 0.20.3 — community fork, same API, current
- SheetJS CDN tarball: xlsx-0.20.3 — official maintained release
- `exceljs` (npm registry): 4.4.0

---

## Architecture Patterns

### Recommended Project Structure (additions for Phase 3)

```
apps/worker/src/
├── routes/
│   ├── health.ts          # existing
│   └── upload.ts          # NEW: POST /upload + GET /stores
├── lib/
│   └── parser.ts          # NEW: parseCSV + parseXLSX pure functions
└── __tests__/
    ├── upload.test.ts     # NEW: parser unit tests + route integration tests
    └── ...existing

apps/web/src/
├── pages/
│   ├── Dashboard.tsx      # existing
│   └── UploadPage.tsx     # NEW: /upload route page
├── components/
│   ├── AppShell.tsx       # existing — update NavItem disabled={true} → enabled
│   ├── StoreCard.tsx      # NEW
│   ├── UploadModal.tsx    # NEW
│   └── FileStatusBadge.tsx # NEW
└── hooks/
    ├── useFetch.ts        # existing — use for all upload API calls
    └── useStores.ts       # NEW: fetches + refreshes store list
```

### Pattern 1: Hono Multipart File Upload

**What:** Parse multipart form data in a Hono Worker route to get `File` objects, check size, then call `arrayBuffer()`.
**When to use:** Any endpoint that receives `multipart/form-data` with file fields.

```typescript
// Source: https://hono.dev/examples/file-upload + https://hono.dev/docs/api/request#parsebody
import { Hono } from 'hono';
import type { Env, Variables } from '../types';

const uploadRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

uploadRoute.post('/upload', async (c) => {
  const body = await c.req.parseBody();
  const orgId = c.get('orgId');

  const rouFile = body['rouFile'];   // File | string | undefined
  const dsFile  = body['dsFile'];    // File | string | undefined
  const storeName = body['storeName'] as string;
  const storeNumber = body['storeNumber'] as string | undefined;
  const type = body['type'] as 'rou' | 'dead-stock'; // or inspect per-file

  if (!(rouFile instanceof File) && !(dsFile instanceof File)) {
    return c.json({ error: 'At least one file is required' }, 400);
  }

  // Size check BEFORE arrayBuffer() to fail fast
  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
  if (rouFile instanceof File && rouFile.size > MAX_BYTES) {
    const mb = (rouFile.size / 1024 / 1024).toFixed(1);
    return c.json({ error: `File too large — maximum 5 MB. Your file is ${mb} MB.` }, 413);
  }
  // ... same check for dsFile

  const buffer = await (rouFile as File).arrayBuffer();
  // pass to parseRou(buffer, filename)
});
```

### Pattern 2: SheetJS XLSX Parsing in Workers

**What:** Read an `ArrayBuffer` with SheetJS, get first sheet rows as arrays, apply header-scan and column-mapping logic.
**When to use:** Any file that may be `.xlsx`.

```typescript
// Source: SheetJS official docs + https://git.sheetjs.com/sheetjs/docs.sheetjs.com cloudflare demo
import * as XLSX from 'xlsx';

export function parseXLSX(buffer: ArrayBuffer): string[][] {
  const wb = XLSX.read(buffer);  // ArrayBuffer accepted directly
  const ws = wb.Sheets[wb.SheetNames[0]];
  // sheet_to_json with header:1 returns rows as string[][]
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
}
```

### Pattern 3: CSV Parsing Without a Library

**What:** Decode buffer to string, strip UTF-8 BOM, normalise CRLF, split into rows.
**When to use:** `.csv` files from FRED Office exports.

```typescript
// Source: Web platform TextDecoder API + ported from stock_transfer_project/api/views.py
export function parseCSV(buffer: ArrayBuffer): string[][] {
  let text = new TextDecoder('utf-8').decode(buffer);
  // Strip UTF-8 BOM (U+FEFF)
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  // Normalise CRLF → LF, then split
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines
    .filter(line => line.trim().length > 0)
    .map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
}
```

### Pattern 4: FRED Header-Row Scanner (ported from Django prototype)

**What:** Scan rows top-to-bottom looking for a row that contains all required canonical column names (or their aliases). Return that row index.
**When to use:** FRED exports may have 1–3 blank/title rows above the actual header.

```typescript
// Source: Ported from stock_transfer_project/api/views.py find_header_row() + normalize_headers()
const HEADER_ALIASES: Record<string, string[]> = {
  'Item Code':        ['Item Code', 'SKU', 'ItemCode', 'Code', 'Product Code'],
  'ROU':              ['ROU Value', 'ROU', 'Usage Rate', 'Sales Rate', 'Rate of Usage'],
  'SOH':              ['SOH', 'Stock on Hand', 'Quantity', 'Qty', 'Quantity on Hand'],
  'Item Description': ['Item Description', 'Description', 'Desc', 'Product Name'],
  'Ranged':           ['Ranged', 'Is Ranged', 'Ranged Item', 'Range Flag'],
  'Cost Ex':          ['Cost Ex', 'Cost', 'Unit Cost', 'Price', 'Cost Excl'],
};

function findHeaderRow(rows: string[][], required: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const rowVals = rows[i].map(v => v.trim());
    const allFound = required.every(canonical =>
      (HEADER_ALIASES[canonical] ?? [canonical]).some(alias => rowVals.includes(alias))
    );
    if (allFound) return i;
  }
  return -1;
}

function buildColumnMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, i) => {
    const trimmed = cell.trim();
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(trimmed)) {
        map[canonical] = i;
        break;
      }
    }
  });
  return map;
}
```

### Pattern 5: NEON Bulk Insert via UNNEST

**What:** Insert many rows in one SQL statement using Postgres UNNEST to avoid hitting the 65,535-parameter limit and for 2x performance vs individual VALUES.
**When to use:** Bulk insert of parsed ROU or dead-stock rows (could be thousands of rows).

```typescript
// Source: https://www.tigerdata.com/blog/boosting-postgres-insert-performance + @neondatabase/serverless docs
// Constraint: withOrgContext callback MUST be synchronous
await withOrgContext<void>(databaseUrl, orgId, (tx) =>
  tx`
    INSERT INTO rou_data (org_id, store_id, sku, description, rou, soh, uploaded_at)
    SELECT
      ${orgId},
      ${storeId},
      unnest(${skus}::text[]),
      unnest(${descriptions}::text[]),
      unnest(${rous}::float8[]),
      unnest(${sohs}::float8[]),
      NOW()
  `
);
```

**IMPORTANT:** The `withOrgContext` callback is synchronous (STATE.md constraint). This means only one query can be the `fn` return value. For delete-then-insert, execute them as two separate `withOrgContext` calls, or inline the DELETE + INSERT as a single SQL statement using a CTE.

### Pattern 6: Store Data Replace (DELETE + INSERT)

**What:** Atomically replace all rows for a single store+file type combination.
**When to use:** User re-uploads ROU or dead-stock data for an existing store.

```typescript
// Two withOrgContext calls — delete first, then insert
// Alternative: single CTE combining DELETE and INSERT (requires wrapping in transaction)
// For simplicity: sequential calls are safe because RLS scopes deletes to org
await withOrgContext<void>(databaseUrl, orgId, (tx) =>
  tx`DELETE FROM rou_data WHERE org_id = ${orgId} AND store_id = ${storeId}`
);
await withOrgContext<void>(databaseUrl, orgId, (tx) =>
  tx`
    INSERT INTO rou_data (org_id, store_id, sku, description, rou, soh, uploaded_at)
    SELECT ${orgId}, ${storeId}, unnest(${skus}::text[]),
           unnest(${descs}::text[]), unnest(${rous}::float8[]),
           unnest(${sohs}::float8[]), NOW()
  `
);
```

### Pattern 7: React Router v7 New Route (existing library)

**What:** Add a protected route at `/upload` using the existing `react-router` v7 install pattern.
**When to use:** Any new page in `apps/web`.

```typescript
// Source: apps/web/src/App.tsx existing pattern
// Add to App.tsx — import UploadPage and add Route:
<Route path="/upload" element={
  <ProtectedRoute requireOrg={true}>
    <UploadPage />
  </ProtectedRoute>
} />
```

**Also update AppShell.tsx NavItem for Upload:**
```typescript
// Change disabled={true} → disabled={false} and add href="/upload"
<NavItem
  icon={<Upload size={16} strokeWidth={1.5} aria-hidden="true" />}
  label="Upload"
  disabled={false}
  href="/upload"
/>
```

### Anti-Patterns to Avoid

- **Using SheetJS from the npm registry (`npm install xlsx`):** The npm registry version is 0.18.5 (last published 2024-10-22) and is stale. Always install from the CDN tarball or use `@e965/xlsx`.
- **Calling `arrayBuffer()` before the size check:** `arrayBuffer()` loads the entire file into Workers memory (128 MB cap). Check `file.size` first, return 413 if over limit.
- **Async callback inside `withOrgContext`:** The NEON HTTP transaction API requires a synchronous callback returning `NeonQueryInTransaction` (documented in STATE.md). Using `async` inside the callback will cause runtime errors.
- **Putting the SheetJS dependency in `apps/web`:** D-12 is locked — parsing is server-side only. The frontend sends the raw file, the Worker parses it.
- **Using `window.confirm()` for replace-confirmation:** D-02 mandates a UI confirmation. Implement as an inline amber warning banner in the modal (per UI-SPEC), not a native browser dialog.
- **Importing `fs` module for SheetJS:** The Workers runtime does not have the `fs` module. SheetJS's `XLSX.read(buffer)` with an `ArrayBuffer` does not require `fs` — it's pure buffer processing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XLSX parsing | Custom binary format parser | SheetJS `XLSX.read(buffer)` | XLSX is a complex ZIP+XML format. SheetJS handles encoding, shared strings, formula cells, merged cells, and all FRED export variants. |
| Authenticated fetch from React | Custom JWT injection | `useFetch` (existing `apps/web/src/hooks/useFetch.ts`) | Already handles `Authorization: Bearer ${token}` via `@clerk/react`'s `getToken()`. |
| RLS-scoped NEON queries | Manual `WHERE org_id =` filter | `withOrgContext` (existing `apps/worker/src/db/client.ts`) | Already injects JWT claims for Postgres RLS. All inserts/selects MUST use this — it's the defence-in-depth layer. |
| File type detection | Inspect bytes / MIME type | Check filename extension (`.csv` / `.xlsx`) | FRED only exports CSV and XLSX. Extension check is sufficient; MIME type from browser is unreliable. SheetJS gracefully fails on invalid XLSX. |
| Postgres parameter limit workaround | Chunked individual INSERTs | `UNNEST` array bulk insert | UNNEST avoids the 65,535-parameter limit entirely and is 2x faster than VALUES at 1,000+ row batch sizes. |

**Key insight:** The complex work in this phase (XLSX format, BOM handling, header aliasing) is all solved by SheetJS + the ported Python logic. Do not underestimate how fragile hand-rolled CSV parsers are against edge cases like quoted commas, multi-line cell values, or mixed encoding.

---

## Common Pitfalls

### Pitfall 1: SheetJS npm Registry Version is Stale

**What goes wrong:** `npm install xlsx` installs 0.18.5 (stale npm registry copy). This version has known CVE reports and may lack ArrayBuffer compatibility fixes.
**Why it happens:** SheetJS moved their distribution to a private CDN after the npm registry version became unmaintained.
**How to avoid:** Install from CDN tarball: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Or use the community fork `@e965/xlsx@0.20.3` from npm.
**Warning signs:** `npm list xlsx` shows version 0.18.5; Snyk reports prototype pollution CVE.

### Pitfall 2: `withOrgContext` Async Callback Constraint

**What goes wrong:** Developer writes an `async` callback inside `withOrgContext` expecting it to work like a normal async transaction — but the NEON HTTP transaction API does not support interactive (async) transactions.
**Why it happens:** `withOrgContext` returns a `Promise<T>` at the outer level, which makes it look async-safe. The callback itself must be synchronous.
**How to avoid:** The callback must return a single `NeonQueryInTransaction` (a tagged template literal call). For multiple operations (e.g., delete then insert), use two separate sequential `withOrgContext` calls.
**Warning signs:** TypeScript type error `Type 'Promise<...>' is not assignable to ReturnType<NeonQueryFunctionInTransaction>`. Runtime: silent hang or unresolved promise.

### Pitfall 3: File Size Check After `arrayBuffer()`

**What goes wrong:** Calling `await file.arrayBuffer()` on a large file loads it into Workers memory (128 MB limit). If the file is 50 MB, the Worker crashes before the size check runs.
**Why it happens:** Developers check `Content-Length` or file size after parsing rather than before.
**How to avoid:** Check `file.size > MAX_BYTES` immediately after `c.req.parseBody()`, before any `arrayBuffer()` call.
**Warning signs:** Worker throws `Error: Memory limit exceeded` or request times out for large file uploads.

### Pitfall 4: FRED CSV Header Row Is Not Row 0

**What goes wrong:** Parser assumes the first row is the header and calls `text.split('\n')[0]` to get column names. FRED exports commonly have 1–3 title/blank rows above the actual data header.
**Why it happens:** Standard CSV conventions assume row 0 is the header. FRED Office exports break this assumption.
**How to avoid:** Use `findHeaderRow()` to scan all rows looking for required column aliases before splitting data. This is the exact logic from the Django prototype in `stock_transfer_project/api/views.py`.
**Warning signs:** Parser returns `Required headers not found` error; or silently inserts rows with `sku = 'Store Name'` or similar title-row content.

### Pitfall 5: Modal Focus Trap Blocking Navigation

**What goes wrong:** Focus trap implementation traps focus too broadly — Tab key stops working when modal is open but there are no focusable elements inside the modal in certain states (e.g., during upload when inputs are disabled).
**Why it happens:** Focus trap queries focusable elements once on mount but the set changes when inputs are disabled during upload.
**How to avoid:** Query focusable elements dynamically on each Tab press using `querySelectorAll` with a selector that excludes `[disabled]` and `[aria-disabled="true"]` elements.
**Warning signs:** User presses Tab and nothing happens; focus jumps out of the modal; console error `Cannot set focus to null`.

### Pitfall 6: `react-router` v7 `<Link>` Component vs `<a>` in NavItem

**What goes wrong:** The existing `NavItem.tsx` uses an `<a>` tag. Navigating to `/upload` with `<a href="/upload">` causes a full page reload instead of a client-side transition.
**Why it happens:** React Router's SPA routing requires `<Link to="...">` (or `<NavLink>`) for client-side navigation. Native `<a>` bypasses the router.
**How to avoid:** Update `NavItem.tsx` to use `<Link>` from `react-router` when `href` is provided and `disabled` is false. Keep `<a>` with `undefined` href for disabled items (no navigation needed).
**Warning signs:** Browser address bar flickers on nav click; React state resets on navigation; Clerk auth re-initialises.

### Pitfall 7: NEON UNNEST Type Mismatch

**What goes wrong:** Passing JavaScript `number[]` arrays to UNNEST without explicit Postgres type casts causes column type mismatch errors (`float8` vs `text` coercion failures).
**Why it happens:** The NEON HTTP driver serialises JavaScript arrays to JSON before sending to Postgres. Without `::float8[]` casts, Postgres may infer the wrong type.
**How to avoid:** Always include explicit Postgres array type casts in UNNEST expressions: `unnest(${rous}::float8[])`, `unnest(${sohs}::float8[])`, `unnest(${skus}::text[])`.
**Warning signs:** NEON throws `ERROR: function unnest(json) does not exist` or `invalid input syntax for type double precision`.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Upload Route Skeleton (Hono)

```typescript
// apps/worker/src/routes/upload.ts
// Source: hono.dev/examples/file-upload + existing apps/worker/src/routes/health.ts pattern
import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { parseRou, parseDeadStock } from '../lib/parser';
import { withOrgContext } from '../db/client';

const uploadRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

uploadRoute.post('/upload', async (c) => {
  const body = await c.req.parseBody();
  const orgId = c.get('orgId');
  const storeName = (body['storeName'] as string)?.trim();
  const storeNumber = (body['storeNumber'] as string)?.trim() || null;
  const rouFile = body['rouFile'];
  const dsFile = body['dsFile'];

  if (!storeName) return c.json({ error: 'storeName is required' }, 400);
  if (!(rouFile instanceof File) && !(dsFile instanceof File)) {
    return c.json({ error: 'At least one file must be provided' }, 400);
  }

  // Size checks
  for (const [label, f] of [['rouFile', rouFile], ['dsFile', dsFile]] as const) {
    if (f instanceof File && f.size > MAX_BYTES) {
      const mb = (f.size / 1024 / 1024).toFixed(1);
      return c.json({ error: `File too large — maximum 5 MB. Your file is ${mb} MB.`, field: label }, 413);
    }
  }

  // Upsert store row and get storeId
  // ... (see GET /stores pattern)

  if (rouFile instanceof File) {
    const buf = await rouFile.arrayBuffer();
    const rows = rouFile.name.endsWith('.xlsx') ? parseXLSX(buf) : parseCSV(buf);
    // find header row, extract ROU data, bulk insert
  }
  // ... same for dsFile

  return c.json({ ok: true });
});

uploadRoute.get('/stores', async (c) => {
  const orgId = c.get('orgId');
  // SELECT stores.*, MAX(rou_data.uploaded_at) as rouUploadedAt,
  //        MAX(dead_stock.uploaded_at) as dsUploadedAt
  // FROM stores LEFT JOIN rou_data ... LEFT JOIN dead_stock ...
  // WHERE stores.org_id = orgId GROUP BY stores.id
  return c.json({ stores: [] }); // populated from NEON
});

export default uploadRoute;
```

### Mount Upload Route in index.ts

```typescript
// Source: existing apps/worker/src/index.ts pattern
import uploadRoute from './routes/upload';
app.route('/api', uploadRoute);
```

### Store Upsert Pattern (get-or-create)

```typescript
// Source: @neondatabase/serverless docs + withOrgContext pattern
// Get existing store or create new one
const existing = await withOrgContext<{ id: string }[]>(
  databaseUrl, orgId,
  (tx) => tx`SELECT id FROM stores WHERE org_id = ${orgId} AND name = ${storeName}`
);

let storeId: string;
if (existing.length > 0) {
  storeId = existing[0].id;
} else {
  const created = await withOrgContext<{ id: string }[]>(
    databaseUrl, orgId,
    (tx) => tx`INSERT INTO stores (org_id, name, created_at)
               VALUES (${orgId}, ${storeName}, NOW()) RETURNING id`
  );
  storeId = created[0].id;
}
```

### React Route Addition

```typescript
// Source: apps/web/src/App.tsx existing pattern
// Add to imports:
import UploadPage from './pages/UploadPage';

// Add to Routes:
<Route path="/upload" element={
  <ProtectedRoute requireOrg={true}>
    <UploadPage />
  </ProtectedRoute>
} />
```

### Modal Escape Key + Overlay Click Dismiss

```typescript
// Source: Standard React accessibility pattern
// In UploadModal.tsx:
useEffect(() => {
  if (!isOpen || isUploading) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [isOpen, isUploading, onClose]);

// Overlay click (but not modal content click):
<div
  className="fixed inset-0 bg-[#0F172A]/60 flex items-center justify-center z-50"
  onClick={isUploading ? undefined : onClose}
>
  <div
    className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
    onClick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    {/* modal content */}
  </div>
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SheetJS from npm registry (`xlsx`) | SheetJS from CDN tarball or `@e965/xlsx` | 2023 (SheetJS v0.19+) | npm registry version frozen at 0.18.5; CDN tarball has all fixes |
| Streaming CSV parsers (PapaParse, csv-parse) | Manual TextDecoder + split for simple cases | Ongoing | No stream support in CF Workers; TextDecoder is built-in and sufficient for FRED's simple CSV format |
| react-router v6 component API | react-router v7 (installed) | Late 2024 | v7 retains component routing API; no changes needed to `<Route>` pattern |
| `ON CONFLICT DO UPDATE` (upsert) for upload replace | DELETE + INSERT | N/A — decision for this phase | UNNEST bulk insert doesn't have a natural conflict key across (org_id, store_id, sku); DELETE + INSERT is cleaner |

**Deprecated/outdated:**
- `xlsx` from npm registry (0.18.5): Do not use. Install from CDN tarball or use `@e965/xlsx`.
- SheetJS `XLSX.readFile()`: Not available in Workers — no filesystem. Use `XLSX.read(buffer)` only.
- Streaming CSV (PapaParse streaming mode): Requires Node.js streams. Workers supports Web Streams but PapaParse streaming adds unnecessary complexity for FRED-sized files.

---

## Open Questions

1. **`withOrgContext` and two-step delete+insert atomicity**
   - What we know: The NEON HTTP transaction API is non-interactive; `withOrgContext` executes exactly two queries per call (set_config + caller query). Two sequential `withOrgContext` calls are not wrapped in a single transaction.
   - What's unclear: If the Worker crashes between the DELETE and the INSERT, the store's data will be empty until the next upload. Acceptable for v1? Yes — the upload modal can show a retry option and the failure is transparent to the user (empty card status).
   - Recommendation: Accept the non-atomic replace for v1. Document as a known limitation. A future migration can use a single CTE: `WITH deleted AS (DELETE FROM rou_data WHERE ...) INSERT INTO rou_data ...`.

2. **Store number field in `stores` table**
   - What we know: D-03 says store number is metadata; D-01 says the `stores` row is created automatically. Phase 1 schema (01-CONTEXT.md D-03) shows `stores(id, org_id, name, created_at)` — no `store_number` column.
   - What's unclear: The `stores` table schema does not have a `store_number` column. Phase 3 needs to either (a) run a migration to add it, or (b) store it elsewhere, or (c) treat Phase 1's no-migrations rule as meaning Phase 3 cannot add columns.
   - Recommendation: Phase 1's D-03 states "all application tables are created in Phase 1 — subsequent phases only insert/query data, they do not run schema migrations." However, `store_number` is Phase 3 functionality not anticipated in Phase 1. The planner must include an `ALTER TABLE stores ADD COLUMN store_number TEXT` migration step. This is the only schema change needed.

3. **`GET /stores` response shape and timestamp aggregation**
   - What we know: The store card needs `rouUploadedAt` and `dsUploadedAt`. Both come from `MAX(uploaded_at)` joined from `rou_data` and `dead_stock`.
   - What's unclear: `withOrgContext` currently handles one query per call. A JOIN query returning store + timestamps from two tables should work fine in a single `withOrgContext` call.
   - Recommendation: Use a single LEFT JOIN query:
     ```sql
     SELECT s.id, s.name, s.store_number,
            MAX(r.uploaded_at) AS rou_uploaded_at,
            MAX(d.uploaded_at) AS ds_uploaded_at
     FROM stores s
     LEFT JOIN rou_data r ON r.store_id = s.id
     LEFT JOIN dead_stock d ON d.store_id = s.id
     WHERE s.org_id = [rls scoped]
     GROUP BY s.id, s.name, s.store_number
     ```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Worker dev, web dev | Yes | 22.20.0 | — |
| npm | Package install | Yes | 11.7.0 | — |
| Wrangler CLI | Worker dev/deploy | Yes | 4.63.0 | — |
| Vite | Web dev server | Yes | ^6.0.0 (in package.json) | — |
| SheetJS CDN tarball | XLSX parsing | Requires install | xlsx-0.20.3 | `@e965/xlsx@0.20.3` from npm |
| NEON Postgres | Data persistence | Yes (configured) | (managed) | — |
| Clerk | Auth (already integrated) | Yes | (managed) | — |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies requiring install:**
- `xlsx` from CDN tarball must be installed in `apps/worker` before Worker code can import it.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 with `@cloudflare/vitest-pool-workers` |
| Config file | `apps/worker/vitest.config.ts` (using `cloudflarePool`) |
| Quick run command | `cd apps/worker && npm test` |
| Full suite command | `cd apps/worker && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPLOAD-01 | ROU CSV/XLSX parses to correct `rou_data` rows | unit | `npm test -- --reporter=verbose -t "parseRou"` | ❌ Wave 0: `__tests__/upload.test.ts` |
| UPLOAD-02 | Dead-stock CSV/XLSX parses to correct `dead_stock` rows | unit | `npm test -- --reporter=verbose -t "parseDeadStock"` | ❌ Wave 0: `__tests__/upload.test.ts` |
| UPLOAD-03 | Data persists — GET /stores returns previously uploaded stores | integration | `npm test -- -t "GET /api/stores"` | ❌ Wave 0: `__tests__/upload.test.ts` |
| UPLOAD-04 | Store card shows last-uploaded timestamp | integration | `npm test -- -t "uploaded_at"` | ❌ Wave 0: `__tests__/upload.test.ts` |
| UPLOAD-05 | BOM-prefixed CSV parses without error; CRLF CSV parses correctly; 2-row-blank-title CSV finds header | unit | `npm test -- -t "parseCSV BOM"` / `"CRLF"` / `"blank title rows"` | ❌ Wave 0: `__tests__/upload.test.ts` |
| UPLOAD-06 | File >5 MB returns 413 JSON; XLSX file parses correctly | unit + integration | `npm test -- -t "413"` / `"parseXLSX"` | ❌ Wave 0: `__tests__/upload.test.ts` |

### Sampling Rate

- **Per task commit:** `cd apps/worker && npm test`
- **Per wave merge:** `cd apps/worker && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/worker/src/__tests__/upload.test.ts` — covers UPLOAD-01 through UPLOAD-06
- [ ] `apps/worker/src/lib/parser.ts` — pure parser functions; must exist before tests can import them
- [ ] SheetJS install: `cd apps/worker && npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 3 |
|-----------|-------------------|
| Stack: Cloudflare Workers + Pages + NEON Postgres + Clerk | No deviation — all Phase 3 work targets these platforms |
| No Python, no traditional server | SheetJS in Worker replaces pandas/openpyxl from Django prototype |
| Multi-tenant (per-org) data scoping | All NEON queries must use `withOrgContext`; never pass `org_id` from request body |
| Auth: Clerk — JWT-scoped org_id | Worker upload route runs behind existing `clerkAuth + requireOrg` middleware chain |
| React component naming: PascalCase | `UploadPage`, `StoreCard`, `UploadModal`, `FileStatusBadge`, `StoreCardGrid` |
| Event handlers: camelCase `handle*` prefix | `handleFileUpload`, `handleAddStore`, `handleCloseModal`, `handleConfirmReplace` |
| State variables: camelCase | `stores`, `isModalOpen`, `isUploading`, `selectedStore`, `confirmReplace` |
| `async/await` throughout — no `.then()` chains | All fetch calls in `UploadPage` use `async/await` |
| camelCase JSON keys in API responses | `rouUploadedAt`, `dsUploadedAt`, `storeName`, `storeNumber` |
| Tailwind utility classes directly on JSX | No CSS modules or styled-components |
| GSD workflow enforcement | All edits via `/gsd:execute-phase` — no direct repo edits |

---

## Sources

### Primary (HIGH confidence)

- SheetJS official docs (docs.sheetjs.com) — installation, `XLSX.read(buffer)`, ArrayBuffer support, Cloudflare Workers demo
- Hono docs (hono.dev) — `c.req.parseBody()` API, File object in multipart form data
- Cloudflare Workers limits docs (developers.cloudflare.com/workers/platform/limits/) — request body size, CPU time (paid: 5 min), memory 128 MB
- `apps/worker/src/db/client.ts` (codebase) — `withOrgContext` synchronous callback constraint
- `apps/worker/wrangler.jsonc` (codebase) — `nodejs_compat_v2` flag already enabled
- `apps/worker/src/index.ts` (codebase) — Hono app + `app.route('/api', ...)` pattern
- `apps/web/src/hooks/useFetch.ts` (codebase) — authenticated fetch hook
- `apps/web/src/App.tsx` (codebase) — React Router v7 route pattern
- `apps/web/src/components/AppShell.tsx` (codebase) — Upload NavItem currently `disabled={true}`
- `.planning/phases/03-file-upload-pipeline/03-UI-SPEC.md` (codebase) — approved component specs

### Secondary (MEDIUM confidence)

- tigerdata.com blog "Boosting Postgres INSERT Performance by 2x With UNNEST" — UNNEST bulk insert pattern and 65,535-parameter limit
- @neondatabase/serverless 1.0.0 release notes — composable template literals for bulk ops
- `stock_transfer_project/api/views.py` (Django prototype) — `HEADER_ALIASES`, `find_header_row`, `normalize_headers` logic ported to TypeScript

### Tertiary (LOW confidence — verify before use)

- WebSearch results for SheetJS ESM in Workers: multiple sources confirm `XLSX.read(buffer)` works; specific `nodejs_compat_v2` interaction not in official docs — test in actual Worker before finalising.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SheetJS CDN tarball confirmed, all other deps already installed
- Architecture: HIGH — all integration points verified in existing codebase
- Parser logic: HIGH — ported from working Django prototype with known test cases
- Pitfalls: HIGH — most are derived from documented constraints (withOrgContext sync, NEON param limit, SheetJS npm vs CDN)
- UNNEST bulk insert: MEDIUM — confirmed pattern, but NEON HTTP driver type-casting behaviour not tested

**Research date:** 2026-03-29
**Valid until:** 2026-04-29 (SheetJS versioning is stable; NEON and Hono APIs are stable)
