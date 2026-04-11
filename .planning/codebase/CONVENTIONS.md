# Coding Conventions

**Analysis Date:** 2026-03-27

## Naming Conventions

**Files:**
- React components: PascalCase-ish descriptive names — `App.js`, `App.css`, `App.test.js`
- Django modules: lowercase snake_case — `models.py`, `views.py`, `tests.py`, `admin.py`, `urls.py`
- Django project/app directories: lowercase snake_case — `stock_transfer_project/`, `api/`

**JavaScript/React functions and variables:**
- React components: PascalCase — `VirtualizedTable`, `UserView`, `AdminView`, `FileUploader`, `SunIcon`, `MoonIcon`
- Event handlers: camelCase prefixed with `handle` — `handleFileUpload`, `handleSelectItem`, `handleSelectAll`, `handleDeselectAll`, `handleThemeSwitch`
- State variables: camelCase — `selectedStore`, `isLoading`, `expandedRow`, `sortConfig`, `rangedOnlyFilter`, `selectedItems`
- Utility functions: camelCase verb phrases — `requestSort`, `renderStatusMessage`, `renderRow`, `getSortIndicator`, `exportToPDF`
- Constants: SCREAMING_SNAKE_CASE for module-level constants — `API_BASE_URL`

**Python:**
- Functions: snake_case — `find_header_row`, `normalize_headers`, `upload_sales_data`, `find_transfer_matches`
- Classes: PascalCase — `Sale`
- Model fields: snake_case — `sku`, `store`, `rou`, `is_ranged`
- Constants/dicts: SCREAMING_SNAKE_CASE — `HEADER_ALIASES`
- URL patterns: hyphen-kebab-case — `upload-sales/`, `find-matches/`
- URL pattern names: snake_case — `upload_sales_data`, `find_transfer_matches`

**API response shape:**
- camelCase keys in JSON responses to match frontend expectations — `isRanged`, `sellThrough`, `bestMatch`, `allMatches`, `totalCost`
- Python model field `is_ranged` is explicitly converted to `isRanged` in the view response dict

## Code Style

**Frontend (JavaScript/React):**
- ESLint config in `dead-stock-tranfer-app/package.json` extending `react-app` and `react-app/jest`
- No separate Prettier config found — formatting appears manual/editor-driven
- 4-space indentation
- Single-quote strings not enforced (mixed usage observed)
- Inline JSX for small sub-components defined inside the main `App` function body (`FileUploader`, `UserView`, `AdminView`)
- Long JSX lines are NOT broken across multiple lines for inline sub-components (e.g., `FileUploader` and `AdminView` are single-line JSX)
- Arrow functions used for event handlers and short callbacks
- `async/await` for all async operations (not `.then()` chains)

**Backend (Python):**
- Ruff linter cache present at `.ruff_cache/` — Ruff is the linting tool
- No `pyproject.toml` or `.ruff.toml` config file found — Ruff runs with defaults
- PEP 8 style generally followed
- 4-space indentation
- Module-level file comment `# FILE: api/views.py` and `# This file defines...` used as header comments
- Standard Django project layout without customisation

## Component/Module Patterns

**React (`dead-stock-tranfer-app/src/App.js`):**
- Single-file architecture: the entire frontend lives in one 344-line `App.js`
- One default export — the main `App` function component
- Sub-components defined as named `const` arrow functions or named function declarations inside `App.js` at module scope (not inside the parent component body), with the exception of `UserView`, `AdminView`, and `FileUploader` which are defined inside `App()`
- `VirtualizedTable` is a standalone functional component at module level; it accepts `rows`, `rowHeight`, `renderRow`, and `tableHeaders` props
- All state managed in top-level `App()` via `useState`; no context, no Redux
- `useMemo` used for derived state: `filteredAndSortedMatches`, `totalTransferCost`
- `useEffect` used for a single side-effect: syncing `theme` state to `localStorage` and `document.documentElement`
- Tailwind CSS utility classes used directly on JSX elements — `App.css` contains only the leftover Create React App boilerplate and is not actively used

**Django (`stock_transfer_project/api/`):**
- Standard function-based views (FBVs) — no class-based views, no Django REST Framework
- Views decorated with `@csrf_exempt` (both endpoints)
- Single `Sale` model in `api/models.py`
- All business logic in `api/views.py`
- `api/admin.py` is empty (no models registered)
- URL routing: `api/urls.py` → included from project-level `stock_transfer_project/urls.py`

## Import Patterns

**JavaScript/React:**
```js
// Third-party first, then local
import React, { useState, useRef, useMemo, useEffect } from 'react';
```
- Named React hooks destructured in the single import line
- No local file imports observed (single-file frontend)
- No path aliases

**Python (Django views):**
```python
# Standard library (not used)
# Third-party
import pandas as pd
# Django core
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
# Local app
from .models import Sale
```
- Follows PEP 8 import grouping: third-party → Django framework → relative local
- Relative imports used for local app modules (`from .models import Sale`)

## Comment Style

**JavaScript:**
- Section dividers use `// ---` banners: `// --- State Management ---`, `// --- EFFECT for theme changes ---`
- Inline comments on logic steps: `// Check if jsPDF library is loaded, if not, load it.`
- Development notes with `// --- NEW LOGIC IS HERE ---` / `// --- END NEW LOGIC ---` markers
- No JSDoc used

**Python:**
- Module-level header comment on each file explaining its purpose
- Docstrings on all view functions and the `Sale` model using standard triple-quoted strings
- Inline `#` comments on model fields explaining intent: `# db_index=True makes lookups by SKU very fast`
- Class `Meta` uses inline comments: `# Ensures that each SKU can only have one entry per store.`

## Error Handling Patterns

**Frontend:**
- `try/catch/finally` blocks wrap all `fetch` calls in `handleFileUpload`
- Errors caught and surfaced via `setMessage(`Error: ${error.message}`)` for display to user
- `console.error()` used for developer-facing logging alongside user-facing `setMessage`
- PDF export uses a nested `async` function (`loadScriptsAndExport`) with its own `try/catch`
- `response.ok` checked after fetch; a non-OK response throws via `throw new Error(data.error || 'Something went wrong')`
- `finally` block always calls `setIsLoading(false)` to reset loading state

**Backend:**
- Broad `except Exception as e` catch-all on all view processing logic
- Returns `JsonResponse({'error': str(e)}, status=500)` on any unhandled exception
- Specific input validation returns `status=400` with descriptive error messages before processing
- No custom exception classes; no structured error logging

## Configuration Patterns

**Frontend:**
- `API_BASE_URL` hardcoded as a constant inside `App()`: `'http://127.0.0.1:8000/api'`
- Theme preference stored and read from `localStorage`
- ESLint config embedded in `package.json` under `"eslintConfig"` key
- Browserslist config embedded in `package.json`

**Backend:**
- Django settings in `stock_transfer_project/stock_transfer_project/settings.py`
- `SECRET_KEY` reads from environment variable `DJANGO_SECRET_KEY` with an insecure fallback hardcoded for local dev
- `DEBUG = True` hardcoded — not environment-driven
- `ALLOWED_HOSTS = []` — not configured
- `CORS_ALLOWED_ORIGINS` hardcoded to `localhost:3000` and `127.0.0.1:3000`
- Database: SQLite, path relative to `BASE_DIR` — no environment variable for connection string
- No `.env` file or `django-environ` / `python-decouple` package used
