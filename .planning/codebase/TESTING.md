# Testing

**Analysis Date:** 2026-03-27

## Test Coverage Status

The project has effectively zero meaningful test coverage. Both test files exist but contain no real tests:

| File | Status |
|------|--------|
| `dead-stock-tranfer-app/src/App.test.js` | 1 test — stale CRA boilerplate that will **fail** immediately |
| `stock_transfer_project/api/tests.py` | Empty — contains only `# Create your tests here.` comment |

No integration tests, no API tests, no unit tests for business logic.

## Frontend Tests

**Framework:**
- Jest (via `react-scripts`) — bundled with Create React App
- `@testing-library/react` ^16.3.0
- `@testing-library/jest-dom` ^6.6.3
- `@testing-library/user-event` ^13.5.0

**Config:**
- No `jest.config.js` — Jest is configured implicitly by `react-scripts`
- ESLint extended with `react-app/jest` in `package.json`

**Current test (`dead-stock-tranfer-app/src/App.test.js`):**
```js
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
```

This test is broken — `App` no longer renders any "learn react" text. It will fail on `getByText` immediately.

Additionally, `App.js` calls `localStorage.getItem('theme')` at module level during `useState` initialisation. Tests running in jsdom will need to mock `localStorage` or this will throw in a test environment.

**What is not tested (frontend):**
- File upload flow (`handleFileUpload`) and its fetch calls
- Match display and filtering (`filteredAndSortedMatches`, `rangedOnlyFilter`)
- Sort behavior (`requestSort`, `getSortIndicator`)
- Select/deselect logic (`handleSelectItem`, `handleSelectAll`, `handleDeselectAll`)
- Total cost calculation (`totalTransferCost`)
- PDF export (`exportToPDF`)
- Theme toggle (`handleThemeSwitch`, localStorage persistence)
- `VirtualizedTable` scroll behavior
- Error state display via `renderStatusMessage`
- View switching (User / Admin tabs)

## Backend Tests

**Framework:**
- Django's built-in `TestCase` (`from django.test import TestCase`) — imported but unused
- No pytest, no pytest-django

**Current test file (`stock_transfer_project/api/tests.py`):**
```python
from django.test import TestCase

# Create your tests here.
```

Entirely empty. The import is the only line of substance.

**What is not tested (backend):**
- `Sale` model creation, `unique_together` constraint, `__str__` method
- `find_header_row()` — header scanning logic with alias fallbacks
- `normalize_headers()` — column renaming logic
- `upload_sales_data` view — POST with valid CSV/XLSX, missing headers, invalid method, `bulk_create` behaviour
- `find_transfer_matches` view — POST with valid dead stock file, missing store param, sell-through 12-month limit, sorting by `isRanged` then `rou`, empty result set
- CSV parsing edge cases: `$` in cost values, rows with zero SOH, missing `Item Code`
- CORS headers on responses

## Test Gaps

**Critical (blocking correctness verification):**
1. `find_transfer_matches` sell-through calculation — `soh / rou` — no test verifies the math
2. `upload_sales_data` bulk upsert — `ignore_conflicts=True` silently drops duplicates; no test verifies which record wins
3. CSV header alias resolution — `find_header_row` and `normalize_headers` are central to the app but entirely untested
4. Frontend file upload error paths — network failures, non-OK responses, malformed JSON

**High priority:**
5. `Sale` model `unique_together` constraint behaviour
6. `rangedOnlyFilter` correctly excludes non-ranged items
7. `totalTransferCost` only sums selected items
8. `VirtualizedTable` renders correct row slice on scroll

**Medium priority:**
9. Theme persistence via `localStorage`
10. Sort direction toggle (ascending → descending)
11. `exportToPDF` items-to-export selection logic

## How to Run Tests

**Frontend:**
```bash
cd dead-stock-tranfer-app
npm test                    # Run in interactive watch mode
npm test -- --watchAll=false  # Run once (CI mode)
npm test -- --coverage      # Run with coverage report
```

**Backend:**
```bash
cd stock_transfer_project
python manage.py test       # Run all Django tests
python manage.py test api   # Run only the api app tests
```

Note: Backend tests currently produce no output beyond "Ran 0 tests". Frontend tests currently fail on the stale boilerplate test.
