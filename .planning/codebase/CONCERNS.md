# Codebase Concerns

**Analysis Date:** 2026-03-27

---

## Security Issues

**No Authentication or Authorization on Any Endpoint:**
- Both API endpoints in `stock_transfer_project/api/views.py` are decorated with `@csrf_exempt` and have zero authentication checks.
- `upload_sales_data` (line 47) and `find_transfer_matches` (line 96) accept POST requests from anyone.
- Any user who can reach the backend can wipe and replace the entire sales database by POSTing to `/api/upload-sales/`.
- There is no user login, API key, token, or session requirement.
- Fix: Add Django REST Framework token auth or Firebase token verification before processing requests.

**`DEBUG = True` Hard-Coded in Settings:**
- `stock_transfer_project/stock_transfer_project/settings.py` line 28: `DEBUG = True` with no environment-variable override.
- In DEBUG mode Django exposes full stack traces, SQL queries, and internal configuration to any user who triggers a 500 error.
- Fix: Change to `DEBUG = os.environ.get('DJANGO_DEBUG', 'False') == 'True'`.

**Insecure Default SECRET_KEY Present in Source:**
- `settings.py` line 25 contains a fallback insecure key: `'django-insecure-3@5_i!$i182&fsonrg91zuy536$b__aw@&-)!c71&ehn$-ntk_'`
- If `DJANGO_SECRET_KEY` env var is not set in production, this literal key is used, compromising session security and CSRF tokens.
- Fix: Remove the fallback entirely — raise `ImproperlyConfigured` if the env var is absent.

**`ALLOWED_HOSTS = []` (Empty List):**
- `settings.py` line 30: `ALLOWED_HOSTS = []`
- An empty list combined with `DEBUG = True` silently allows all hosts during development. If DEBUG is ever toggled off without updating this, the app will reject all requests.
- Fix: Set `ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost').split(',')`.

**No File Upload Validation (Type or Size):**
- `views.py` accepts any file uploaded as `sales_file` or `dead_stock_file`. No MIME type verification, no file size cap.
- A malicious user could upload a multi-gigabyte file and cause the server to run out of memory attempting to load it into a pandas DataFrame.
- Fix: Check file size before reading (reject if > configured limit, e.g. 50 MB), and validate the content-type header.

**PDF Libraries Loaded from CDN at Runtime:**
- `dead-stock-tranfer-app/src/App.js` lines 186–200 dynamically inject `<script>` tags pointing to `cdnjs.cloudflare.com` for jsPDF.
- If the CDN is unavailable or the URL is compromised (supply chain attack), PDF export silently fails or executes attacker-controlled code.
- Fix: Bundle jsPDF and jsPDF-AutoTable as proper npm dependencies; remove the dynamic script injection.

**Firebase SDK Installed but Not Used in Application Logic:**
- `dead-stock-tranfer-app/package.json` includes `"firebase": "^11.9.1"` and `src/firebase-config.js` exists, but `App.js` never imports or uses Firebase.
- This is dead dependency weight — and if Firebase were accidentally activated without proper rules, it could expose a Firestore or Storage bucket.
- Fix: Remove the firebase package and `firebase-config.js` until Firebase functionality is intentionally implemented.

---

## Technical Debt

**`App.js` is a Single 344-Line God Component:**
- `dead-stock-tranfer-app/src/App.js` contains the entire application: state management, API calls, PDF export, filtering, sorting, virtualized table, admin view, user view, and all UI rendering.
- No components are extracted to separate files (compare the `src/` directory which only contains `App.js`, `App.css`, `App.test.js`, and config files).
- Impossible to unit-test individual pieces. Adding features requires navigating the full file.
- Fix: Extract `VirtualizedTable`, `FileUploader`, `AdminView`, `UserView`, and `exportToPDF` into separate component/utility files.

**Store List Is Hard-Coded in Frontend:**
- `App.js` line 49: `const [stores] = useState(['Balwyn', 'Carnegie', 'Sunshine', 'Trentham']);`
- Adding or renaming a store requires a code change and redeployment. The backend has no concept of a store registry.
- Fix: Derive the store list from the uploaded sales data or expose a `/api/stores/` endpoint.

**`API_BASE_URL` Hard-Coded as a Literal:**
- `App.js` line 76: `const API_BASE_URL = 'http://127.0.0.1:8000/api';`
- This is a component-level constant, not an environment variable. Any deployment pointing to a non-localhost backend requires a source code change.
- Fix: Move to `process.env.REACT_APP_API_BASE_URL` and document it in `.env.example`.

**Broad `except Exception as e` Catches in Backend:**
- `views.py` lines 90 and 186 catch all exceptions and return a generic HTTP 500 with `str(e)`.
- This hides distinct failure modes (encoding error vs. missing column vs. DB error) behind a single message and prevents targeted error recovery.
- Fix: Catch specific exceptions (`pd.errors.EmptyDataError`, `KeyError`, `ValueError`, `DatabaseError`) with tailored error responses.

**`Sale.objects.all().delete()` on Every Sales Upload:**
- `views.py` line 70 deletes the entire sales table before importing new data.
- There is no transaction wrapping this operation: if the import fails midway, the database is left empty.
- Fix: Wrap the delete + bulk_create in `transaction.atomic()`.

**`inplace=True` on Shared DataFrame in `normalize_headers`:**
- `views.py` line 44: `df.rename(columns=canonical_map, inplace=True)` mutates the passed DataFrame.
- pandas is deprecating `inplace=True` patterns; this also makes the function a side-effectful mutator rather than a pure transform.
- Fix: Return `df.rename(columns=canonical_map)` and assign the result at the call site.

**Requirements Specify Overly Broad Django Version Range:**
- `stock_transfer_project/requirements.txt` line 1: `Django>=3.2,<5.0` but the actual installed version is Django 5.2.3 (per `settings.py` docstring). This range excludes the actual runtime version.
- Fix: Pin to `Django>=5.2,<6.0` or pin the exact tested version.

---

## Performance Concerns

**Row-by-Row Python Loop for Building ORM Objects:**
- `views.py` lines 73–84 iterate over every DataFrame row in pure Python to construct `Sale` objects. For large files (tens of thousands of rows) this is significantly slower than vectorized pandas operations.
- The loop is followed by `bulk_create` (good), but the construction loop itself is the bottleneck.
- Fix: Use `df.apply` or vectorized column operations to build the list faster, or consider `django-pandas` for ORM integration.

**`find_header_row` Scans Every Row with Python Iteration:**
- `views.py` lines 24–29: `find_header_row` iterates over all rows in the DataFrame with `df.iterrows()` until it finds the header row.
- For files with thousands of rows before the header, this is slow. The header row is almost always near the top.
- Fix: Add an early-exit limit (e.g., scan only the first 20 rows) and break out immediately on a match.

**Virtualized Table `visibleRowCount` Calculated After Render:**
- `dead-stock-tranfer-app/src/App.js` line 28: `containerRef.current ? Math.ceil(containerRef.current.clientHeight / rowHeight) : 0`
- On first render `containerRef.current` is null, so `visibleRowCount` is 0 and no rows render until a scroll event occurs.
- Fix: Use a `useLayoutEffect` or an initial estimate for visible row count to ensure rows render immediately.

---

## Scalability Risks

**SQLite as the Production Database:**
- `settings.py` lines 80–85: SQLite (`db.sqlite3`) is the only configured database. SQLite does not support concurrent writes — simultaneous uploads from two users will cause write conflicts or data corruption.
- The database file is committed to the repo (observed in the directory listing), meaning production data could be accidentally overwritten.
- Fix: Migrate to PostgreSQL or another multi-writer database before any multi-user deployment. Add `db.sqlite3` to `.gitignore`.

**Single-Tenant Design with Full Table Delete:**
- The application has no concept of users or organisations. All stores share one global sales dataset. One admin upload overwrites data for all users simultaneously.
- Fix: Add a user/organisation model and scope sales data per tenant, or at minimum add a lock/confirmation mechanism around the destructive upload.

**No Rate Limiting or Request Queuing:**
- The two upload endpoints process files synchronously within the HTTP request. There is no queue, worker, or timeout. A large file upload will block the Django thread for the duration of processing.
- Fix: Move file processing to a background task (Celery, Django-Q, or similar) and return a job ID for polling.

---

## Missing Features / Incomplete Work

**Zero Backend Tests:**
- `stock_transfer_project/api/tests.py` contains only the auto-generated stub (`# Create your tests here.`). The `TestCase` import is flagged as unused by ruff.
- The matching algorithm, header normalisation, sell-through calculation, and database operations are entirely untested.
- Per `DEVELOPMENT_TODOS.md` Task 4.2: target is >80% coverage for `api/views.py`. Status: Not Started.

**Zero Frontend Tests:**
- `dead-stock-tranfer-app/src/App.test.js` exists but likely contains only the CRA default smoke test.
- No tests for sorting, filtering, selection state, PDF export, or file upload handler.

**CSV/Excel Export Not Implemented:**
- `DEVELOPMENT_TODOS.md` Task 3.3 (Status: Not Started): users can only export to PDF. CSV and Excel export are not available.
- The PDF export itself uses a CDN-loaded library (see Security Issues above).

**Enhanced Filtering Not Implemented:**
- `DEVELOPMENT_TODOS.md` Task 6.1 (Status: Not Started): no filter by store, no filter by sell-through range, no filter by minimum ROU. Filter settings are not persisted to `localStorage`.

**Audit / History Tracking Not Implemented:**
- `DEVELOPMENT_TODOS.md` Task 6.3 (Status: Not Started): no log of uploads, transfers, or user actions. No audit trail for compliance or debugging.

**Multi-Store Comparison View Not Implemented:**
- `DEVELOPMENT_TODOS.md` Task 6.4 (Status: Not Started): no way to visualise stock levels across all stores for a given SKU.

**Firebase Integration Incomplete:**
- `firebase-config.js` and the `firebase` npm package exist but nothing in the application imports or uses Firebase. Authentication, cloud storage, and real-time features are not implemented.

---

## Infrastructure Concerns

**No Production Deployment Configuration:**
- There is no `Dockerfile`, `docker-compose.yml`, `Procfile`, `gunicorn` configuration, or cloud deployment manifest anywhere in the project.
- `DEBUG = True` and `ALLOWED_HOSTS = []` confirm the backend has never been hardened for production.

**No WSGI/ASGI Production Server:**
- The only way to run the backend is `python manage.py runserver`, which is explicitly unsupported for production by Django's documentation.
- Fix: Add `gunicorn` or `uvicorn` to requirements and document a production start command.

**No HTTPS Configuration:**
- `CORS_ALLOWED_ORIGINS` in `settings.py` lines 129–132 only lists `http://` origins. No HTTPS variants are configured.
- Django's `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, and `CSRF_COOKIE_SECURE` settings are absent.

**No Static File Serving Setup:**
- `STATIC_URL = 'static/'` is set but `STATIC_ROOT` is not defined. Running `collectstatic` for production deployment will fail.

**Frontend Build Not Documented or Automated:**
- There is no CI pipeline, build script, or deployment guide explaining how to build the React app and serve it. The `react-scripts` version (5.0.1) is pinned but the overall toolchain setup is undocumented.

**`.env` Files Present in Repo (Potential):**
- The working directory listing shows `.env`, `.env.example`, and `.env.local` all present in `dead-stock-tranfer-app/`. If `.env` or `.env.local` contain real credentials and are not in `.gitignore`, they risk being committed.

---

## Data Concerns

**`db.sqlite3` Committed to Repository:**
- The SQLite database file is present at `stock_transfer_project/db.sqlite3`. If this contains real pharmacy stock data, it represents a data leak vector via version control.
- Fix: Add `db.sqlite3` to `.gitignore` immediately. Confirm no real data is in the current file.

**No Input Sanitisation on `origin_store`:**
- `views.py` line 103: `origin_store = request.POST.get('store')` is used directly in a Django ORM `.exclude(store__iexact=origin_store)` query.
- Django's ORM parameterises queries (no SQL injection risk), but the value is never validated against known stores. An attacker could submit any string and silently get different result sets.
- Fix: Validate `origin_store` against a known store list before use.

**`is_ranged` Parsing Is Brittle:**
- `views.py` line 82: `is_ranged=str(row['Ranged']).strip().lower() == 'checked'`
- Only the exact string `"checked"` sets this to `True`. Any other truthy representation (`"yes"`, `"true"`, `"1"`, `"Y"`) is silently treated as `False`. This can cause valid ranged items to be ranked lower in suggestions.
- Fix: Accept a broader set of truthy values: `{'checked', 'yes', 'true', '1', 'y'}`.

**`or 0.0` Masking NaN in ROU and Cost:**
- `views.py` line 81: `pd.to_numeric(row['ROU Value'], errors='coerce') or 0.0`
- `pd.to_numeric(..., errors='coerce')` returns `NaN` for bad values. In Python, `NaN or 0.0` evaluates to `0.0` (because `NaN` is truthy in Python's boolean context). This silently sets bad ROU values to 0 rather than surfacing the data quality problem.
- Same pattern on line 133 for cost. Use `pd.isna()` checks or `fillna(0.0)` explicitly.

**No Migration History for `description` Field:**
- `models.py` line 14 adds a `description` field with comment "Added for potential future use." If migrations were generated after initial deployment, existing databases may be missing this column and will error on queries.
- Verify that `0001_initial.py` (the only migration) includes this field.

---

## Priority Issues

**1. No Authentication — Highest Risk**
The backend has zero access control. Any network-reachable user can wipe the sales database and read all dead stock matching results. This must be addressed before any non-local deployment. File: `stock_transfer_project/api/views.py` lines 46, 95.

**2. `DEBUG = True` and Insecure `SECRET_KEY` Fallback**
The application cannot be safely deployed in its current state. Stack traces and internal config are exposed on errors. File: `stock_transfer_project/stock_transfer_project/settings.py` lines 25, 28.

**3. No Transaction Around Destructive Sales Import**
`Sale.objects.all().delete()` followed by `bulk_create` is not atomic. A parsing error mid-import leaves the database empty, breaking the entire application until a successful re-upload. File: `stock_transfer_project/api/views.py` line 70.

**4. SQLite in Production — Data Integrity and Concurrency**
SQLite cannot handle concurrent writes and should never be used as a multi-user production database. `db.sqlite3` is also potentially committed to source control. File: `stock_transfer_project/stock_transfer_project/settings.py` lines 80–85, `stock_transfer_project/db.sqlite3`.

**5. Zero Test Coverage**
The matching algorithm, header normalisation logic, and sell-through calculation are the core business logic of this application and are completely untested. Any future change to `views.py` has no safety net. Files: `stock_transfer_project/api/tests.py` (empty stub), `dead-stock-tranfer-app/src/App.test.js`.

---

*Concerns audit: 2026-03-27*
