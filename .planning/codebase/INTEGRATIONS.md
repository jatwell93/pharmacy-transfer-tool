# Integrations

**Analysis Date:** 2026-03-27

## External Services

**Firebase (Optional / Not Active):**
- Purpose: Future auth and/or data storage — SDK is installed but no Firebase services are initialised in app code
- SDK: `firebase` ^11.9.1 (`dead-stock-tranfer-app/package.json`)
- Config file: `dead-stock-tranfer-app/src/firebase-config.js` — reads all values from `REACT_APP_FIREBASE_*` env vars
- Status: Config object is exported but never imported or used in `App.js` or `index.js`; env vars are commented out in `.env.example`

**cdnjs.cloudflare.com (Runtime CDN — PDF export):**
- Purpose: Dynamically loads jsPDF and jsPDF-AutoTable libraries on demand when user triggers "Export to PDF"
- Libraries loaded:
  - `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`
  - `https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js`
- Integration point: `exportToPDF()` function in `dead-stock-tranfer-app/src/App.js` (line ~183)
- Note: These are not in `package.json`; they are injected as `<script>` tags at runtime. Requires internet access at export time.

## APIs

**Internal REST API (Django backend):**
- Base URL (dev): `http://127.0.0.1:8000/api` — hardcoded in `dead-stock-tranfer-app/src/App.js` line 76
- Transport: HTTP, JSON responses, `multipart/form-data` for file uploads
- No authentication on endpoints (both views use `@csrf_exempt`)

| Endpoint | Method | Purpose | Key inputs |
|---|---|---|---|
| `/api/upload-sales/` | POST | Upload master sales CSV/XLSX; replaces all `Sale` records | `sales_file` (multipart) |
| `/api/find-matches/` | POST | Upload dead stock file; returns transfer match suggestions | `dead_stock_file` (multipart), `store` (form field) |

- Route definitions: `stock_transfer_project/api/urls.py`
- View implementations: `stock_transfer_project/api/views.py`
- Root URL config: `stock_transfer_project/stock_transfer_project/urls.py`

**No third-party APIs** are currently integrated (Firebase is not initialised).

## Authentication

**Current state: No authentication implemented.**
- Both Django API endpoints use `@csrf_exempt` and perform no auth checks
- The React frontend has no login screen, session management, or token handling
- Django admin (`/admin/`) uses Django's built-in session auth but is not wired to the React app
- Firebase Auth SDK is installed but not initialised or used

## Data Sources

**Uploaded CSV/XLSX Files (primary data input):**
- Master sales data: uploaded by admin via `/api/upload-sales/`
  - Required columns: `Item Code`, `ROU Value`, `Store`, `Ranged`
  - Header aliases supported (e.g. `SKU`, `Usage Rate`, `Location`) — see `HEADER_ALIASES` in `stock_transfer_project/api/views.py`
  - Parsed with pandas; bulk-inserted into `Sale` table (replaces all existing data)
- Dead stock data: uploaded by user via `/api/find-matches/`
  - Required columns: `Item Code`, `Item Description`, `SOH`, `Cost Ex`
  - Header aliases supported

**SQLite Database:**
- File: `stock_transfer_project/db.sqlite3`
- Single table in use: `api_sale` (mapped from `Sale` model)
- Persists master sales data between sessions
- Not suitable for production multi-user or concurrent write scenarios

**Sample Data Files:**
- Located in `sample-data/` at project root (CSV and XLSX formats)
- Used for testing uploads

**localStorage (frontend):**
- Key: `theme` — persists dark/light mode preference
- Read on initial load in `dead-stock-tranfer-app/src/App.js` line 58

## Environment Variables

**Frontend (`dead-stock-tranfer-app/.env.example`):**

| Variable | Purpose | Required |
|---|---|---|
| `REACT_APP_FIREBASE_API_KEY` | Firebase project API key | Optional (Firebase unused) |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Optional |
| `REACT_APP_FIREBASE_PROJECT_ID` | Firebase project ID | Optional |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Optional |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | Optional |
| `REACT_APP_FIREBASE_APP_ID` | Firebase app ID | Optional |

All are currently commented out. The app functions fully without them.

**Backend (`stock_transfer_project/.env.example`):**

| Variable | Purpose | Required |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django cryptographic secret key | Required in production |
| `DEBUG` | Enable/disable debug mode | Recommended (default `True` in settings) |
| `ALLOWED_HOSTS` | Comma-separated allowed hostnames | Required in production |
| `DATABASE_URL` | Database connection string | Optional (defaults to SQLite) |

- `DJANGO_SECRET_KEY` is read in `stock_transfer_project/stock_transfer_project/settings.py` via `os.environ.get()` with an insecure dev fallback
- A `.env` loader (e.g. `python-dotenv`) is NOT in `requirements.txt`; env vars must be set in the shell or OS environment

## Webhooks & Callbacks

**Incoming:** None configured.
**Outgoing:** None configured.

## CORS Configuration

Configured in `stock_transfer_project/stock_transfer_project/settings.py`:
- `corsheaders.middleware.CorsMiddleware` is active
- Allowed origins (development only):
  - `http://localhost:3000`
  - `http://127.0.0.1:3000`
- No production origins configured

---

*Integration audit: 2026-03-27*
