# Architecture

**Analysis Date:** 2026-03-27

## Overview

The Pharmacy Stock Transfer Tool is a two-tier web application with a decoupled React frontend and a Django REST API backend. The system helps pharmacy staff identify dead-stock items at one store that can be transferred to another store where those same items have positive sales velocity (Rate of Usage / ROU). There is no shared session or authentication enforced — the two tiers communicate over HTTP with CORS configured for local development.

## System Design

**Frontend-Backend Separation:**
- The React app (`dead-stock-tranfer-app/`) runs at `http://localhost:3000` during development.
- The Django API (`stock_transfer_project/`) runs at `http://127.0.0.1:8000` during development.
- The frontend hardcodes `API_BASE_URL = 'http://127.0.0.1:8000/api'` in `dead-stock-tranfer-app/src/App.js` (line 76).
- CORS is handled by `django-cors-headers`, permitting `localhost:3000` and `127.0.0.1:3000` (configured in `stock_transfer_project/stock_transfer_project/settings.py` lines 129–132).

**Communication Pattern:**
- All API calls use `multipart/form-data` POSTs (file uploads via `FormData`).
- The frontend uses the native `fetch` API — no Axios or other HTTP library.
- The backend returns plain `JsonResponse` objects (no DRF serializers).
- CSRF is disabled on all API views via `@csrf_exempt` decorator.

**Data Flow — Sales Data Upload (Admin workflow):**
1. Admin selects master sales CSV/XLSX in the Admin view.
2. Frontend POSTs file to `POST /api/upload-sales/` as `sales_file`.
3. Backend (`upload_sales_data` in `api/views.py`) parses file with pandas, normalizes headers, deletes all existing `Sale` rows, and bulk-inserts new records.
4. Backend returns `{ message: "Successfully imported N sales records." }`.

**Data Flow — Dead Stock Matching (User workflow):**
1. User selects their origin store from a hardcoded dropdown and uploads a dead-stock CSV/XLSX.
2. Frontend POSTs file + `store` field to `POST /api/find-matches/`.
3. Backend (`find_transfer_matches` in `api/views.py`) parses the dead-stock file, queries the `Sale` table for matching SKUs with ROU > 0 (excluding the origin store), applies a 12-month sell-through filter (`ROU >= SOH / 12`), calculates sell-through time per match, sorts by ranged status then ROU descending.
4. Backend returns `{ matches: [...], totalCost: N }`.
5. Frontend stores results in React state and renders them in the virtualized table.

## Key Design Patterns

**Backend:**
- **MVT (Model-View-Template):** Standard Django pattern, but without templates — views return JSON.
- **Function-based views:** All views are plain Python functions decorated with `@csrf_exempt`. No class-based views, no Django REST Framework.
- **Pandas for ETL:** File parsing and data normalization is done entirely in-memory using pandas DataFrames before writing to the database.
- **Bulk create with conflict ignore:** `Sale.objects.bulk_create(..., ignore_conflicts=True, batch_size=1000)` for performance on large uploads.
- **Header aliasing:** `HEADER_ALIASES` dict and `find_header_row()` / `normalize_headers()` functions allow flexible CSV/XLSX column naming.

**Frontend:**
- **Single-file monolith:** All application logic, components, and state live in `dead-stock-tranfer-app/src/App.js` (344 lines).
- **React hooks for state:** `useState`, `useEffect`, `useMemo`, `useRef` — no external state management library.
- **Virtualized table:** Custom `VirtualizedTable` component renders only visible rows based on scroll position to handle large result sets without performance degradation.
- **View switching:** A `view` state variable (`'user'` | `'admin'`) toggles between `UserView` and `AdminView` inline components. No routing library.
- **Dark mode:** Theme toggled via `localStorage` and a CSS class on `document.documentElement`.
- **PDF export:** jsPDF and jsPDF-AutoTable are loaded dynamically from CDN at export time (not bundled).

## Data Models

**`Sale`** — defined in `stock_transfer_project/api/models.py`

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | Auto-generated primary key |
| `sku` | CharField(100) | SKU / item code; indexed (`db_index=True`) |
| `store` | CharField(100) | Store name |
| `rou` | FloatField | Rate of Usage (monthly sales velocity) |
| `is_ranged` | BooleanField | Whether item is a ranged (standard) product |
| `description` | CharField(255) | Item description; nullable, not currently populated from CSV |

**Constraint:** `unique_together = ('sku', 'store')` — one ROU value per SKU per store.

**Note:** The `description` field on `Sale` is populated from the upload source according to the model comment ("Added for potential future use") but the `upload_sales_data` view does not currently write it — it is only populated via the dead-stock file parse path.

## API Design

**Base path:** `/api/`

| Method | Endpoint | Purpose | Key inputs | Key outputs |
|--------|----------|---------|-----------|-------------|
| POST | `/api/upload-sales/` | Replace all sales data | `sales_file` (CSV/XLSX) | `{ message }` or `{ error }` |
| POST | `/api/find-matches/` | Find transfer matches for dead stock | `dead_stock_file` (CSV/XLSX), `store` (string) | `{ matches, totalCost }` or `{ error }` |
| GET | `/admin/` | Django admin interface | — | HTML |

**No versioning.** No `/v1/` prefix. No authentication on API endpoints.

**Match response shape:**
```json
{
  "matches": [
    {
      "sku": "ABC123",
      "description": "Product Name",
      "soh": 10,
      "cost": 4.50,
      "allMatches": [
        { "store": "Carnegie", "rou": 2.5, "isRanged": true, "sellThrough": 4.0 }
      ],
      "bestMatch": { "store": "Carnegie", "rou": 2.5, "isRanged": true, "sellThrough": 4.0 }
    }
  ],
  "totalCost": 45.00
}
```

## State Management

**Frontend (React local state only):**

| State variable | Type | Purpose |
|----------------|------|---------|
| `stores` | string[] | Hardcoded list: `['Balwyn', 'Carnegie', 'Sunshine', 'Trentham']` |
| `selectedStore` | string | Currently selected origin store |
| `matches` | array | Raw match results from API |
| `filteredAndSortedMatches` | array (memo) | Derived: filtered + sorted view of `matches` |
| `expandedRow` | number\|null | Index of expanded row showing additional matches |
| `isLoading` | boolean | Upload in-progress flag |
| `message` | string | Status/error text for user feedback |
| `view` | `'user'`\|`'admin'` | Active view panel |
| `sortConfig` | `{ key, direction }` | Current sort column and direction |
| `rangedOnlyFilter` | boolean | Show only ranged-item matches |
| `theme` | `'light'`\|`'dark'` | UI theme; persisted to `localStorage` |
| `selectedItems` | Set\<string\> | SKUs checked for export/cost calculation |

**Backend (database state only):**
- All state is in the SQLite database (`stock_transfer_project/db.sqlite3`).
- The `upload_sales_data` view performs a full delete-and-replace on each upload — there is no incremental update.
- No server-side sessions, caching, or in-memory state.

## Known Architectural Issues

**CSRF disabled globally on API views:**
- Both views use `@csrf_exempt`. Since there is no authentication and the API is local-only for now, this is low risk in development but would be a security concern in production deployment.
- Files: `stock_transfer_project/api/views.py` lines 46, 95.

**Hardcoded API URL in frontend:**
- `API_BASE_URL = 'http://127.0.0.1:8000/api'` is hardcoded in `dead-stock-tranfer-app/src/App.js` line 76.
- Should be an environment variable (`REACT_APP_API_BASE_URL`) to support staging/production deployments.

**Hardcoded store list:**
- `const [stores] = useState(['Balwyn', 'Carnegie', 'Sunshine', 'Trentham'])` in `App.js` line 49.
- No API endpoint to fetch stores dynamically from the database.
- Adding or removing stores requires a code change and redeployment.

**Full delete-and-replace on sales upload:**
- `Sale.objects.all().delete()` in `views.py` line 70 drops all records before re-importing.
- A failed upload mid-stream leaves the database empty. No transaction wrapping around the delete + bulk_create.

**No authentication on API or admin:**
- The Admin view is a client-side UI toggle only — there is no server-side access control.
- Django admin (`/admin/`) is available but no superuser setup is documented.

**`description` field not populated on sales upload:**
- `Sale.description` exists in the model but the `upload_sales_data` view does not set it. Only the dead-stock match flow parses `Item Description`. The field on the `Sale` record stays null.

**PDF libraries loaded from CDN at runtime:**
- jsPDF and jsPDF-AutoTable are injected as `<script>` tags from `cdnjs.cloudflare.com` on first export click.
- This creates a runtime dependency on an external CDN, is fragile, and adds latency to first export.

**No backend tests:**
- `stock_transfer_project/api/tests.py` exists but is empty (Django stub). No test coverage on the matching algorithm, header aliasing, or CSV parsing.

**Firebase config present but unused:**
- `dead-stock-tranfer-app/src/firebase-config.js` exists and reads env vars, but is not imported anywhere in `App.js` or `index.js`. Firebase is not integrated into the running application.

---

*Architecture analysis: 2026-03-27*
