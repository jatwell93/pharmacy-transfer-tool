# Technology Stack

**Analysis Date:** 2026-03-27

## Languages

**Primary:**
- JavaScript (ES2022+) - React frontend (`dead-stock-tranfer-app/src/`)
- Python 3.13 - Django REST API backend (`stock_transfer_project/`)

**Secondary:**
- CSS (Tailwind utility classes via CDN) - Frontend styling

## Runtime

**Frontend Environment:**
- Node.js (version managed via npm; CRA 5 requires Node 14+)
- Package Manager: npm
- Lockfile: `dead-stock-tranfer-app/package-lock.json` (present)

**Backend Environment:**
- Python 3.13
- Virtual environment: `.venv/` at project root
- Package Manager: pip
- Requirements file: `stock_transfer_project/requirements.txt`

## Frameworks

**Frontend:**
- React 19.1.0 - UI component framework (`dead-stock-tranfer-app/src/App.js`)
- Create React App 5.0.1 (`react-scripts`) - Build tooling and dev server

**Backend:**
- Django 5.2.3 (actual installed; `requirements.txt` specifies `>=3.2,<5.0` — version mismatch) - Web framework
- django-cors-headers >=4.9.0 - CORS middleware for cross-origin requests from React dev server

**Data Processing:**
- pandas >=1.3.0 - CSV/XLSX parsing and transformation in API views
- openpyxl >=3.0.0 - Excel file reading engine used by pandas

## Key Dependencies

**Frontend (`dead-stock-tranfer-app/package.json`):**
- `react` ^19.1.0 - Core UI library
- `react-dom` ^19.1.0 - DOM rendering
- `firebase` ^11.9.1 - Firebase SDK (imported but currently optional/unused; config present at `dead-stock-tranfer-app/src/firebase-config.js`)
- `react-icons` ^5.5.0 - Icon library (imported in package but inline SVG used in App.js)
- `web-vitals` ^2.1.4 - Performance metrics

**Frontend (dynamically loaded at runtime, not in package.json):**
- jsPDF 2.5.1 - PDF generation (loaded from cdnjs.cloudflare.com on demand)
- jsPDF-AutoTable 3.5.23 - PDF table plugin (loaded from cdnjs.cloudflare.com on demand)

**Backend (`stock_transfer_project/requirements.txt`):**
- `Django >=3.2,<5.0` - Web framework (note: installed version is 5.2.3, outside pinned range)
- `django-cors-headers >=4.9.0` - CORS support
- `pandas >=1.3.0` - Data processing
- `openpyxl >=3.0.0` - Excel support

**Backend (built-in Django):**
- Django ORM - Database access (no separate ORM package)
- Django Admin - Built-in admin interface at `/admin/`

## Database

**Engine:** SQLite3 (default, file-based)
- File: `stock_transfer_project/db.sqlite3`
- ORM: Django ORM (built-in)
- Migrations: Django migrations system
  - Initial migration: `stock_transfer_project/api/migrations/0001_initial.py`
  - Migration history dir: `stock_transfer_project/api/migrations/`

**Models:**
- `Sale` - Defined in `stock_transfer_project/api/models.py`
  - Fields: `sku`, `store`, `rou` (float), `is_ranged` (bool), `description`
  - Unique constraint: `(sku, store)` pair

## Infrastructure

**Hosting:**
- Not configured — development only setup
- No Dockerfile, docker-compose, or deployment config detected
- Frontend dev server: `http://localhost:3000` (CRA default)
- Backend dev server: `http://127.0.0.1:8000` (Django default)

**CI/CD:**
- Not detected — no `.github/workflows/`, CircleCI, or similar config

**Containerization:**
- Not detected

## Dev Tools

**Frontend Linting:**
- ESLint (via CRA) - Config in `dead-stock-tranfer-app/package.json` under `eslintConfig`
  - Extends: `react-app`, `react-app/jest`
- No separate `.eslintrc` file

**Frontend Formatting:**
- No Prettier or other formatter config detected

**Backend Linting/Formatting:**
- Not detected (no `.flake8`, `pyproject.toml`, `setup.cfg`, or `ruff.toml`)

**Testing:**
- Frontend: Jest + React Testing Library (via CRA)
  - `@testing-library/react` ^16.3.0
  - `@testing-library/jest-dom` ^6.6.3
  - `@testing-library/user-event` ^13.5.0
  - `@testing-library/dom` ^10.4.0
  - Test file: `dead-stock-tranfer-app/src/App.test.js`
  - Run: `npm test` (from `dead-stock-tranfer-app/`)
- Backend: Django test framework
  - Test file: `stock_transfer_project/api/tests.py` (exists but content not verified as populated)
  - Run: `python manage.py test` (from `stock_transfer_project/`)

**Build Commands:**
```bash
# Frontend
cd dead-stock-tranfer-app && npm start    # Dev server on :3000
cd dead-stock-tranfer-app && npm build    # Production build

# Backend
cd stock_transfer_project && python manage.py runserver  # Dev server on :8000
cd stock_transfer_project && python manage.py migrate    # Apply migrations
```

---

*Stack analysis: 2026-03-27*
