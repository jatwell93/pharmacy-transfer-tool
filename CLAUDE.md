<!-- GSD:project-start source:PROJECT.md -->
## Project

**PharmIQ Stock Transfer**

A dead-stock matching tool for Australian pharmacy groups. Pharmacy managers upload ROU (Rate of Usage) and dead-stock reports exported from FRED Office for each store. The system identifies which stores hold dead stock that other stores in the network can sell, and recommends transfers capped at a user-defined months-cover limit to prevent receiving stores from becoming overstocked. Part of the PharmIQ platform ("Smart Ops. Better Margins.").

**Core Value:** A pharmacy manager uploads all store reports and instantly sees exactly which stores should exchange dead stock — with a months-cover cap so receiving stores never become overstocked.

### Constraints

- **Stack**: Cloudflare Workers (Node) + Pages (React) + NEON Postgres + Clerk — must match companion app stack
- **Auth**: Clerk — already integrated in companion app, users will be the same
- **Data**: NEON Postgres — replaces SQLite; must support multi-tenant (per-org) data scoping
- **Deployment**: Cloudflare Pages/Workers — no traditional server, no Python
- **Business model**: Free tier = 1 match run/month; must be enforced in backend
- **Market**: Australian pharmacies — FRED Office export formats are the integration surface
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (ES2022+) - React frontend (`dead-stock-tranfer-app/src/`)
- Python 3.13 - Django REST API backend (`stock_transfer_project/`)
- CSS (Tailwind utility classes via CDN) - Frontend styling
## Runtime
- Node.js (version managed via npm; CRA 5 requires Node 14+)
- Package Manager: npm
- Lockfile: `dead-stock-tranfer-app/package-lock.json` (present)
- Python 3.13
- Virtual environment: `.venv/` at project root
- Package Manager: pip
- Requirements file: `stock_transfer_project/requirements.txt`
## Frameworks
- React 19.1.0 - UI component framework (`dead-stock-tranfer-app/src/App.js`)
- Create React App 5.0.1 (`react-scripts`) - Build tooling and dev server
- Django 5.2.3 (actual installed; `requirements.txt` specifies `>=3.2,<5.0` — version mismatch) - Web framework
- django-cors-headers >=4.9.0 - CORS middleware for cross-origin requests from React dev server
- pandas >=1.3.0 - CSV/XLSX parsing and transformation in API views
- openpyxl >=3.0.0 - Excel file reading engine used by pandas
## Key Dependencies
- `react` ^19.1.0 - Core UI library
- `react-dom` ^19.1.0 - DOM rendering
- `firebase` ^11.9.1 - Firebase SDK (imported but currently optional/unused; config present at `dead-stock-tranfer-app/src/firebase-config.js`)
- `react-icons` ^5.5.0 - Icon library (imported in package but inline SVG used in App.js)
- `web-vitals` ^2.1.4 - Performance metrics
- jsPDF 2.5.1 - PDF generation (loaded from cdnjs.cloudflare.com on demand)
- jsPDF-AutoTable 3.5.23 - PDF table plugin (loaded from cdnjs.cloudflare.com on demand)
- `Django >=3.2,<5.0` - Web framework (note: installed version is 5.2.3, outside pinned range)
- `django-cors-headers >=4.9.0` - CORS support
- `pandas >=1.3.0` - Data processing
- `openpyxl >=3.0.0` - Excel support
- Django ORM - Database access (no separate ORM package)
- Django Admin - Built-in admin interface at `/admin/`
## Database
- File: `stock_transfer_project/db.sqlite3`
- ORM: Django ORM (built-in)
- Migrations: Django migrations system
- `Sale` - Defined in `stock_transfer_project/api/models.py`
## Infrastructure
- Not configured — development only setup
- No Dockerfile, docker-compose, or deployment config detected
- Frontend dev server: `http://localhost:3000` (CRA default)
- Backend dev server: `http://127.0.0.1:8000` (Django default)
- Not detected — no `.github/workflows/`, CircleCI, or similar config
- Not detected
## Dev Tools
- ESLint (via CRA) - Config in `dead-stock-tranfer-app/package.json` under `eslintConfig`
- No separate `.eslintrc` file
- No Prettier or other formatter config detected
- Not detected (no `.flake8`, `pyproject.toml`, `setup.cfg`, or `ruff.toml`)
- Frontend: Jest + React Testing Library (via CRA)
- Backend: Django test framework
# Frontend
# Backend
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Conventions
- React components: PascalCase-ish descriptive names — `App.js`, `App.css`, `App.test.js`
- Django modules: lowercase snake_case — `models.py`, `views.py`, `tests.py`, `admin.py`, `urls.py`
- Django project/app directories: lowercase snake_case — `stock_transfer_project/`, `api/`
- React components: PascalCase — `VirtualizedTable`, `UserView`, `AdminView`, `FileUploader`, `SunIcon`, `MoonIcon`
- Event handlers: camelCase prefixed with `handle` — `handleFileUpload`, `handleSelectItem`, `handleSelectAll`, `handleDeselectAll`, `handleThemeSwitch`
- State variables: camelCase — `selectedStore`, `isLoading`, `expandedRow`, `sortConfig`, `rangedOnlyFilter`, `selectedItems`
- Utility functions: camelCase verb phrases — `requestSort`, `renderStatusMessage`, `renderRow`, `getSortIndicator`, `exportToPDF`
- Constants: SCREAMING_SNAKE_CASE for module-level constants — `API_BASE_URL`
- Functions: snake_case — `find_header_row`, `normalize_headers`, `upload_sales_data`, `find_transfer_matches`
- Classes: PascalCase — `Sale`
- Model fields: snake_case — `sku`, `store`, `rou`, `is_ranged`
- Constants/dicts: SCREAMING_SNAKE_CASE — `HEADER_ALIASES`
- URL patterns: hyphen-kebab-case — `upload-sales/`, `find-matches/`
- URL pattern names: snake_case — `upload_sales_data`, `find_transfer_matches`
- camelCase keys in JSON responses to match frontend expectations — `isRanged`, `sellThrough`, `bestMatch`, `allMatches`, `totalCost`
- Python model field `is_ranged` is explicitly converted to `isRanged` in the view response dict
## Code Style
- ESLint config in `dead-stock-tranfer-app/package.json` extending `react-app` and `react-app/jest`
- No separate Prettier config found — formatting appears manual/editor-driven
- 4-space indentation
- Single-quote strings not enforced (mixed usage observed)
- Inline JSX for small sub-components defined inside the main `App` function body (`FileUploader`, `UserView`, `AdminView`)
- Long JSX lines are NOT broken across multiple lines for inline sub-components (e.g., `FileUploader` and `AdminView` are single-line JSX)
- Arrow functions used for event handlers and short callbacks
- `async/await` for all async operations (not `.then()` chains)
- Ruff linter cache present at `.ruff_cache/` — Ruff is the linting tool
- No `pyproject.toml` or `.ruff.toml` config file found — Ruff runs with defaults
- PEP 8 style generally followed
- 4-space indentation
- Module-level file comment `# FILE: api/views.py` and `# This file defines...` used as header comments
- Standard Django project layout without customisation
## Component/Module Patterns
- Single-file architecture: the entire frontend lives in one 344-line `App.js`
- One default export — the main `App` function component
- Sub-components defined as named `const` arrow functions or named function declarations inside `App.js` at module scope (not inside the parent component body), with the exception of `UserView`, `AdminView`, and `FileUploader` which are defined inside `App()`
- `VirtualizedTable` is a standalone functional component at module level; it accepts `rows`, `rowHeight`, `renderRow`, and `tableHeaders` props
- All state managed in top-level `App()` via `useState`; no context, no Redux
- `useMemo` used for derived state: `filteredAndSortedMatches`, `totalTransferCost`
- `useEffect` used for a single side-effect: syncing `theme` state to `localStorage` and `document.documentElement`
- Tailwind CSS utility classes used directly on JSX elements — `App.css` contains only the leftover Create React App boilerplate and is not actively used
- Standard function-based views (FBVs) — no class-based views, no Django REST Framework
- Views decorated with `@csrf_exempt` (both endpoints)
- Single `Sale` model in `api/models.py`
- All business logic in `api/views.py`
- `api/admin.py` is empty (no models registered)
- URL routing: `api/urls.py` → included from project-level `stock_transfer_project/urls.py`
## Import Patterns
- Named React hooks destructured in the single import line
- No local file imports observed (single-file frontend)
- No path aliases
- Follows PEP 8 import grouping: third-party → Django framework → relative local
- Relative imports used for local app modules (`from .models import Sale`)
## Comment Style
- Section dividers use `// ---` banners: `// --- State Management ---`, `// --- EFFECT for theme changes ---`
- Inline comments on logic steps: `// Check if jsPDF library is loaded, if not, load it.`
- Development notes with `// --- NEW LOGIC IS HERE ---` / `// --- END NEW LOGIC ---` markers
- No JSDoc used
- Module-level header comment on each file explaining its purpose
- Docstrings on all view functions and the `Sale` model using standard triple-quoted strings
- Inline `#` comments on model fields explaining intent: `# db_index=True makes lookups by SKU very fast`
- Class `Meta` uses inline comments: `# Ensures that each SKU can only have one entry per store.`
## Error Handling Patterns
- `try/catch/finally` blocks wrap all `fetch` calls in `handleFileUpload`
- Errors caught and surfaced via `setMessage(`Error: ${error.message}`)` for display to user
- `console.error()` used for developer-facing logging alongside user-facing `setMessage`
- PDF export uses a nested `async` function (`loadScriptsAndExport`) with its own `try/catch`
- `response.ok` checked after fetch; a non-OK response throws via `throw new Error(data.error || 'Something went wrong')`
- `finally` block always calls `setIsLoading(false)` to reset loading state
- Broad `except Exception as e` catch-all on all view processing logic
- Returns `JsonResponse({'error': str(e)}, status=500)` on any unhandled exception
- Specific input validation returns `status=400` with descriptive error messages before processing
- No custom exception classes; no structured error logging
## Configuration Patterns
- `API_BASE_URL` hardcoded as a constant inside `App()`: `'http://127.0.0.1:8000/api'`
- Theme preference stored and read from `localStorage`
- ESLint config embedded in `package.json` under `"eslintConfig"` key
- Browserslist config embedded in `package.json`
- Django settings in `stock_transfer_project/stock_transfer_project/settings.py`
- `SECRET_KEY` reads from environment variable `DJANGO_SECRET_KEY` with an insecure fallback hardcoded for local dev
- `DEBUG = True` hardcoded — not environment-driven
- `ALLOWED_HOSTS = []` — not configured
- `CORS_ALLOWED_ORIGINS` hardcoded to `localhost:3000` and `127.0.0.1:3000`
- Database: SQLite, path relative to `BASE_DIR` — no environment variable for connection string
- No `.env` file or `django-environ` / `python-decouple` package used
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Overview
## System Design
- The React app (`dead-stock-tranfer-app/`) runs at `http://localhost:3000` during development.
- The Django API (`stock_transfer_project/`) runs at `http://127.0.0.1:8000` during development.
- The frontend hardcodes `API_BASE_URL = 'http://127.0.0.1:8000/api'` in `dead-stock-tranfer-app/src/App.js` (line 76).
- CORS is handled by `django-cors-headers`, permitting `localhost:3000` and `127.0.0.1:3000` (configured in `stock_transfer_project/stock_transfer_project/settings.py` lines 129–132).
- All API calls use `multipart/form-data` POSTs (file uploads via `FormData`).
- The frontend uses the native `fetch` API — no Axios or other HTTP library.
- The backend returns plain `JsonResponse` objects (no DRF serializers).
- CSRF is disabled on all API views via `@csrf_exempt` decorator.
## Key Design Patterns
- **MVT (Model-View-Template):** Standard Django pattern, but without templates — views return JSON.
- **Function-based views:** All views are plain Python functions decorated with `@csrf_exempt`. No class-based views, no Django REST Framework.
- **Pandas for ETL:** File parsing and data normalization is done entirely in-memory using pandas DataFrames before writing to the database.
- **Bulk create with conflict ignore:** `Sale.objects.bulk_create(..., ignore_conflicts=True, batch_size=1000)` for performance on large uploads.
- **Header aliasing:** `HEADER_ALIASES` dict and `find_header_row()` / `normalize_headers()` functions allow flexible CSV/XLSX column naming.
- **Single-file monolith:** All application logic, components, and state live in `dead-stock-tranfer-app/src/App.js` (344 lines).
- **React hooks for state:** `useState`, `useEffect`, `useMemo`, `useRef` — no external state management library.
- **Virtualized table:** Custom `VirtualizedTable` component renders only visible rows based on scroll position to handle large result sets without performance degradation.
- **View switching:** A `view` state variable (`'user'` | `'admin'`) toggles between `UserView` and `AdminView` inline components. No routing library.
- **Dark mode:** Theme toggled via `localStorage` and a CSS class on `document.documentElement`.
- **PDF export:** jsPDF and jsPDF-AutoTable are loaded dynamically from CDN at export time (not bundled).
## Data Models
| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | Auto-generated primary key |
| `sku` | CharField(100) | SKU / item code; indexed (`db_index=True`) |
| `store` | CharField(100) | Store name |
| `rou` | FloatField | Rate of Usage (monthly sales velocity) |
| `is_ranged` | BooleanField | Whether item is a ranged (standard) product |
| `description` | CharField(255) | Item description; nullable, not currently populated from CSV |
## API Design
| Method | Endpoint | Purpose | Key inputs | Key outputs |
|--------|----------|---------|-----------|-------------|
| POST | `/api/upload-sales/` | Replace all sales data | `sales_file` (CSV/XLSX) | `{ message }` or `{ error }` |
| POST | `/api/find-matches/` | Find transfer matches for dead stock | `dead_stock_file` (CSV/XLSX), `store` (string) | `{ matches, totalCost }` or `{ error }` |
| GET | `/admin/` | Django admin interface | — | HTML |
```json
```
## State Management
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
- All state is in the SQLite database (`stock_transfer_project/db.sqlite3`).
- The `upload_sales_data` view performs a full delete-and-replace on each upload — there is no incremental update.
- No server-side sessions, caching, or in-memory state.
## Known Architectural Issues
- Both views use `@csrf_exempt`. Since there is no authentication and the API is local-only for now, this is low risk in development but would be a security concern in production deployment.
- Files: `stock_transfer_project/api/views.py` lines 46, 95.
- `API_BASE_URL = 'http://127.0.0.1:8000/api'` is hardcoded in `dead-stock-tranfer-app/src/App.js` line 76.
- Should be an environment variable (`REACT_APP_API_BASE_URL`) to support staging/production deployments.
- `const [stores] = useState(['Balwyn', 'Carnegie', 'Sunshine', 'Trentham'])` in `App.js` line 49.
- No API endpoint to fetch stores dynamically from the database.
- Adding or removing stores requires a code change and redeployment.
- `Sale.objects.all().delete()` in `views.py` line 70 drops all records before re-importing.
- A failed upload mid-stream leaves the database empty. No transaction wrapping around the delete + bulk_create.
- The Admin view is a client-side UI toggle only — there is no server-side access control.
- Django admin (`/admin/`) is available but no superuser setup is documented.
- `Sale.description` exists in the model but the `upload_sales_data` view does not set it. Only the dead-stock match flow parses `Item Description`. The field on the `Sale` record stays null.
- jsPDF and jsPDF-AutoTable are injected as `<script>` tags from `cdnjs.cloudflare.com` on first export click.
- This creates a runtime dependency on an external CDN, is fragile, and adds latency to first export.
- `stock_transfer_project/api/tests.py` exists but is empty (Django stub). No test coverage on the matching algorithm, header aliasing, or CSV parsing.
- `dead-stock-tranfer-app/src/firebase-config.js` exists and reads env vars, but is not imported anywhere in `App.js` or `index.js`. Firebase is not integrated into the running application.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
