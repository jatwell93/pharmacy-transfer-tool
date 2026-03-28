---
phase: 01-foundation
plan: 02
subsystem: ui
tags: [react, vite, clerk, tailwind, cloudflare-pages, typescript]

# Dependency graph
requires: []
provides:
  - Vite + React 19 SPA at apps/web/ deployable on Cloudflare Pages
  - Clerk authentication with ClerkProvider, ProtectedRoute, and sign-in page
  - PharmIQ-branded AppShell with teal header and 240px sidebar
  - Brand CSS token set (--color-teal, --color-navy, --color-amber, etc.)
  - useFetch hook with Clerk Bearer token injection
  - Org setup screen with CreateOrganization for users without an org
affects:
  - 01-03
  - 01-04
  - all future frontend phases

# Tech tracking
tech-stack:
  added:
    - vite 6.x — build tooling and dev server
    - react 19 / react-dom 19 — UI library
    - react-router v7 — client-side routing
    - "@clerk/react" — authentication provider and UI components
    - "@tailwindcss/vite" — Tailwind v4 via Vite plugin
    - tailwindcss v4 — utility-first CSS framework
    - lucide-react — icon library (Upload, GitCompare, CreditCard, Settings, LogOut)
    - typescript 5.x — type safety across all source files
    - "@vitejs/plugin-react" — React Fast Refresh
    - wrangler (wrangler.jsonc) — Cloudflare Pages deployment config
  patterns:
    - ClerkProvider wraps BrowserRouter at root; auth state available app-wide via useAuth()
    - ProtectedRoute component checks isSignedIn and orgId before rendering children
    - CSS custom properties for brand tokens; Tailwind v4 imported via @import "tailwindcss"
    - useFetch hook encapsulates getToken() + Bearer header for authenticated Worker calls
    - AppShell layout pattern: fixed 56px header + 240px sidebar + scrollable main

key-files:
  created:
    - apps/web/src/main.tsx
    - apps/web/src/App.tsx
    - apps/web/src/index.css
    - apps/web/src/vite-env.d.ts
    - apps/web/src/pages/SignIn.tsx
    - apps/web/src/pages/Dashboard.tsx
    - apps/web/src/pages/OrgSetup.tsx
    - apps/web/src/components/AppShell.tsx
    - apps/web/src/components/NavItem.tsx
    - apps/web/src/components/ProtectedRoute.tsx
    - apps/web/src/hooks/useFetch.ts
    - apps/web/package.json
    - apps/web/vite.config.ts
    - apps/web/wrangler.jsonc
    - apps/web/index.html
    - apps/web/.env.example
    - apps/web/tsconfig.json
    - apps/web/tsconfig.app.json
    - apps/web/tsconfig.node.json
    - apps/web/.gitignore
    - apps/web/package-lock.json
  modified: []

key-decisions:
  - "Used Tailwind v4 @import syntax (not v3 @tailwind directives) with @tailwindcss/vite plugin"
  - "Cloudflare Pages configured via wrangler.jsonc with not_found_handling: single-page-application for client-side routing"
  - "ProtectedRoute checks both isSignedIn and orgId — users without an org redirect to /org-setup before reaching the dashboard"
  - "NavItem disabled state uses aria-disabled + pointer-events-none + opacity-40 + title='Coming soon' (no href navigation)"
  - "useFetch hook reads VITE_WORKER_URL from import.meta.env for environment-agnostic Worker calls"

patterns-established:
  - "Auth guard pattern: ProtectedRoute wraps all routes requiring authentication, with optional requireOrg flag"
  - "Brand token pattern: all colors declared as CSS custom properties in index.css, referenced inline via Tailwind arbitrary values"
  - "Disabled nav pattern: aria-disabled + pointer-events-none + opacity-40 for placeholder nav items across all future sidebar additions"

requirements-completed:
  - AUTH-01

# Metrics
duration: ~15min
completed: 2026-03-28
---

# Phase 01 Plan 02: React SPA with Clerk Auth Summary

**Vite + React 19 SPA with Clerk auth, PharmIQ-branded AppShell (teal header + disabled sidebar), and Cloudflare Pages SPA config**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-28T04:23:15Z
- **Completed:** 2026-03-28T04:24:05Z
- **Tasks:** 2
- **Files modified:** 21 (all created)

## Accomplishments

- Vite + React 19 + TypeScript SPA scaffolded with Tailwind v4 and full brand CSS token set
- Clerk authentication wired end-to-end: ClerkProvider at root, ProtectedRoute guard checking isSignedIn + orgId, sign-in page with colorPrimary '#0F766E', and org setup screen with CreateOrganization
- PharmIQ AppShell built with 56px teal header, 240px sidebar (Upload / Match / Billing / Settings nav items — all disabled with aria-disabled + opacity-40 + "Coming soon" tooltip), UserButton, and sign-out button
- Cloudflare Pages configured via wrangler.jsonc with single-page-application not_found_handling for client-side routing fallback
- useFetch hook encapsulates Clerk getToken() + Authorization Bearer header injection for future Worker API calls

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Vite + React project with Clerk auth and Cloudflare Pages config** - `bed2382` (feat)
2. **Task 2: Build PharmIQ-branded app shell, sign-in page, and org setup screen** - `020c1b5` (feat)
3. **Task 3: Add .gitignore and lock file for apps/web** - `e7be19f` (chore)

## Files Created/Modified

- `apps/web/src/main.tsx` - Root entry point; ClerkProvider + BrowserRouter wrapping App
- `apps/web/src/App.tsx` - Route definitions: /sign-in, /org-setup (ProtectedRoute requireOrg=false), / (ProtectedRoute requireOrg=true)
- `apps/web/src/index.css` - Tailwind v4 import + full brand CSS token set (teal, navy, amber, surface, text, semantic)
- `apps/web/src/pages/SignIn.tsx` - Centered card with "Sign in to PharmIQ" heading and Clerk SignIn component branded teal
- `apps/web/src/pages/OrgSetup.tsx` - Centered card with Clerk CreateOrganization for users without an org
- `apps/web/src/pages/Dashboard.tsx` - Placeholder page inside AppShell with "You're all set up" heading
- `apps/web/src/components/AppShell.tsx` - Layout wrapper: teal header (PharmIQ wordmark + UserButton + skip link), 240px sidebar with disabled nav, main content area
- `apps/web/src/components/NavItem.tsx` - Disabled-by-default nav link with aria-disabled, pointer-events-none, opacity-40, title="Coming soon"
- `apps/web/src/components/ProtectedRoute.tsx` - Auth guard checking isLoaded, isSignedIn, and orgId before rendering children
- `apps/web/src/hooks/useFetch.ts` - Fetch wrapper that injects Clerk Bearer token from VITE_WORKER_URL base
- `apps/web/package.json` - Package manifest; name: pharmiq-stock-transfer-web
- `apps/web/vite.config.ts` - Vite config with @vitejs/plugin-react and @tailwindcss/vite plugins
- `apps/web/wrangler.jsonc` - Cloudflare Pages config with single-page-application fallback
- `apps/web/index.html` - HTML entry with Space Grotesk + Inter Google Fonts preloaded
- `apps/web/.env.example` - VITE_CLERK_PUBLISHABLE_KEY and VITE_WORKER_URL placeholders
- `apps/web/tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` - TypeScript project references config
- `apps/web/.gitignore` - Excludes dist/, node_modules/, .env files
- `apps/web/package-lock.json` - Lockfile for reproducible installs

## Decisions Made

- Used Tailwind v4 `@import "tailwindcss"` syntax (not v3 `@tailwind` directives) with `@tailwindcss/vite` plugin — this is the correct v4 approach and matches Vite's plugin architecture.
- Cloudflare Pages configured via `wrangler.jsonc` with `not_found_handling: single-page-application` so all unmatched paths return index.html for React Router to handle.
- ProtectedRoute checks both `isSignedIn` and `orgId` before allowing dashboard access — users authenticated but without an org are redirected to /org-setup rather than seeing an empty/broken dashboard.
- NavItem disabled state uses `aria-disabled="true"` + `pointer-events-none` + `opacity-40` + `title="Coming soon"` — fully accessible disabled state that communicates placeholder status without removing the nav structure.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration before the app functions.**

Before running the dev server or deploying to Cloudflare Pages, the following environment variables must be set:

| Variable | Where to get it | Required for |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard > API Keys | Authentication to load |
| `VITE_WORKER_URL` | Cloudflare Workers dashboard (after plan 01-01 deploy) | API calls via useFetch |

Copy `apps/web/.env.example` to `apps/web/.env.local` and populate both values.

For Cloudflare Pages deployment, set these as environment variables in the Pages project settings.

## Next Phase Readiness

- Frontend auth scaffold is complete and production-deployable to Cloudflare Pages
- All nav items (Upload, Match, Billing) are disabled placeholders — ready to be enabled by future plans
- useFetch hook is ready to make authenticated Worker calls once VITE_WORKER_URL is set
- AppShell layout is fixed — future pages just need to wrap content in `<AppShell>` to inherit the header/sidebar

---
*Phase: 01-foundation*
*Completed: 2026-03-28*
