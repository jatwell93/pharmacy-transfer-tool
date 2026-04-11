# Codebase Structure

**Analysis Date:** 2026-03-27

## Root Layout

```
pharmacy-transfer-tool/
├── dead-stock-tranfer-app/     # React frontend (Create React App)
├── stock_transfer_project/     # Django REST API backend
├── brand-identity-pharma-apps/ # Brand identity docs and assets (non-code)
├── sample-data/                # Sample CSV/XLSX files for testing
├── .planning/                  # GSD planning documents (AI-generated)
├── .agents/                    # Agent skill definitions
├── .claude/                    # Claude skill definitions
├── .venv/                      # Python virtual environment (not committed)
├── .ruff_cache/                # Ruff linter cache (not committed)
├── SETUP.md                    # Development environment setup guide
├── DEVELOPMENT_TODOS.md        # Prioritized feature backlog
├── bugscan-report.txt          # Bug scan output
└── skills-lock.json            # Agent skills lock file
```

**Note:** The frontend directory name contains a typo: `dead-stock-tranfer-app` (missing second 'r' in "transfer"). This is the actual directory name — do not correct it in file paths.

## Frontend Structure

```
dead-stock-tranfer-app/
├── public/
│   ├── index.html              # HTML shell; root <div id="root">
│   ├── favicon.ico
│   ├── manifest.json
│   └── robots.txt
├── src/
│   ├── App.js                  # Entire application: all components, state, handlers
│   ├── App.css                 # Application styles
│   ├── App.test.js             # Placeholder test file
│   ├── firebase-config.js      # Firebase config (env vars only; currently unused)
│   ├── index.js                # React entry point; mounts <App /> to #root
│   ├── index.css               # Global CSS (Tailwind base imports)
│   ├── logo.svg                # Default CRA logo (unused in production)
│   ├── reportWebVitals.js      # CRA web vitals reporter
│   └── setupTests.js           # Jest setup (imports @testing-library/jest-dom)
├── .env.example                # Example environment variable template
├── package.json                # npm manifest; defines CRA scripts and dependencies
└── package-lock.json           # npm lockfile
```

**Key frontend files:**
- `dead-stock-tranfer-app/src/App.js` — the entire application lives here. Contains `VirtualizedTable`, `UserView`, `AdminView`, `FileUploader` components plus all event handlers and state. 344 lines.
- `dead-stock-tranfer-app/src/index.js` — entry point; renders `<App />` inside `React.StrictMode`.
- `dead-stock-tranfer-app/src/firebase-config.js` — reads Firebase env vars but is not imported by `App.js` or `index.js`.

## Backend Structure

```
stock_transfer_project/
├── api/                            # Django application ("api" app)
│   ├── migrations/
│   │   ├── 0001_initial.py         # Initial migration: creates Sale table
│   │   └── __init__.py
│   ├── __init__.py
│   ├── admin.py                    # Django admin registrations
│   ├── apps.py                     # App config (ApiConfig)
│   ├── models.py                   # Sale model definition
│   ├── tests.py                    # Empty test stub (Django default)
│   ├── urls.py                     # URL patterns for the api app
│   └── views.py                    # All API view functions + CSV/XLSX parsing logic
├── stock_transfer_project/         # Django project package
│   ├── __init__.py
│   ├── asgi.py                     # ASGI entry point
│   ├── settings.py                 # Project settings (DB, CORS, installed apps)
│   ├── urls.py                     # Root URL config (mounts /admin/ and /api/)
│   └── wsgi.py                     # WSGI entry point
├── .env.example                    # Example environment variable template
├── db.sqlite3                      # SQLite database file (generated; not committed)
├── manage.py                       # Django management script
└── requirements.txt                # Python dependencies
```

**Key backend files:**
- `stock_transfer_project/api/models.py` — defines the single `Sale` model with fields: `sku`, `store`, `rou`, `is_ranged`, `description`.
- `stock_transfer_project/api/views.py` — all business logic: `HEADER_ALIASES` dict, `find_header_row()`, `normalize_headers()`, `upload_sales_data()`, `find_transfer_matches()`.
- `stock_transfer_project/api/urls.py` — maps `upload-sales/` and `find-matches/` to their view functions.
- `stock_transfer_project/stock_transfer_project/settings.py` — configures SQLite database, CORS origins, installed apps including `corsheaders`.
- `stock_transfer_project/stock_transfer_project/urls.py` — root router: `admin/` and `api/` prefix.

## Supporting Files

**`sample-data/`:**
- `sample_sales_data.csv` — example master sales data (4 stores, ~20 SKUs); upload via Admin view
- `sample_deadstock_data.csv` — example dead stock from one store; upload via User view
- `sample_sales_data.xlsx` — Excel version of the sales data
- `README.md` — explains sample data format and testing workflow

**`brand-identity-pharma-apps/`:**
- Non-code directory containing brand strategy documents, logo assets, color palettes, typography specs, and UI mockups.
- Has its own `.agents/` and `.claude/` subdirectories for brand-related AI skill definitions.
- Not consumed by the running application.

**`bugscan-report.txt`:** Output from a static analysis / bug scan tool at the repo root.

**`.planning/codebase/`:** GSD-generated codebase analysis documents (this file and ARCHITECTURE.md).

## Entry Points

**Start the backend (Django dev server):**
```bash
# From repo root, with virtual environment activated:
cd stock_transfer_project
python manage.py runserver
# API available at: http://127.0.0.1:8000/api
# Admin UI at:      http://127.0.0.1:8000/admin
```

**Start the frontend (React dev server):**
```bash
# From repo root:
cd dead-stock-tranfer-app
npm start
# App available at: http://localhost:3000
```

**Run database migrations (first-time setup or after model changes):**
```bash
cd stock_transfer_project
python manage.py migrate
```

**Run backend tests:**
```bash
cd stock_transfer_project
python manage.py test
```

**Run frontend tests:**
```bash
cd dead-stock-tranfer-app
npm test
```

## Naming Conventions

**Files:**
- Backend Python files: `snake_case.py` (standard Django convention)
- Frontend JS files: `PascalCase.js` for components (`App.js`), `camelCase.js` for utilities (`reportWebVitals.js`, `firebase-config.js`)

**Directories:**
- Frontend: kebab-case (`dead-stock-tranfer-app`)
- Backend Django app: snake_case (`stock_transfer_project`, `api`)
- Sample data: snake_case filenames (`sample_sales_data.csv`)

## Where to Add New Code

**New API endpoint:**
1. Add view function to `stock_transfer_project/api/views.py`
2. Add URL pattern to `stock_transfer_project/api/urls.py`

**New database model:**
1. Add class to `stock_transfer_project/api/models.py`
2. Run `python manage.py makemigrations` and `python manage.py migrate`
3. Register in `stock_transfer_project/api/admin.py` if admin access is needed

**New frontend component:**
- Currently: add directly to `dead-stock-tranfer-app/src/App.js` (the existing pattern)
- Preferred for larger components: create `dead-stock-tranfer-app/src/components/ComponentName.js` and import into `App.js` (per `DEVELOPMENT_TODOS.md` Task 6.4 which references `src/components/StockComparisonView.js`)

**New frontend tests:**
- Add to `dead-stock-tranfer-app/src/App.test.js` or create new `*.test.js` files in `src/`

**New backend tests:**
- Add to `stock_transfer_project/api/tests.py` or create `stock_transfer_project/api/test_views.py` and `stock_transfer_project/api/test_models.py`

---

*Structure analysis: 2026-03-27*
