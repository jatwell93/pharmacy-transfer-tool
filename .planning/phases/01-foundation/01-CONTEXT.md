# Phase 1: Foundation - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy an authenticated, multi-tenant scaffold: Cloudflare Worker (Hono) with Clerk JWT middleware, NEON Postgres with full schema + RLS, and a PharmIQ-branded Cloudflare Pages app with sign-in and a nav skeleton. At the end of this phase, a developer can make an authenticated API call and receive the verified org_id back — and all application tables exist with RLS enforced.

This phase does NOT include: file upload logic, matching algorithm, freemium enforcement, or brand polish. It is strictly the infrastructure and auth foundation that all subsequent phases depend on.

</domain>

<decisions>
## Implementation Decisions

### Repo Structure
- **D-01:** New `apps/` monorepo directory at repo root. Worker lives at `apps/worker/`, React Pages app at `apps/web/`. Wrangler config goes in `apps/worker/wrangler.toml`.
- **D-02:** Existing prototype directories (`dead-stock-tranfer-app/` and `stock_transfer_project/`) stay in place for reference during the port — do not delete or rename them.

### NEON Schema
- **D-03:** All application tables are created in Phase 1 — full schema upfront. Subsequent phases only insert/query data, they do not run schema migrations. Tables to create:
  - `orgs` — Clerk org metadata (org_id PK, plan, created_at)
  - `stores` — store names per org (id, org_id FK, name, created_at)
  - `rou_data` — item/ROU records uploaded per store (id, org_id, store_id, sku, description, rou, soh, uploaded_at)
  - `dead_stock` — dead stock records uploaded per store (id, org_id, store_id, sku, description, soh, is_ranged, uploaded_at)
  - `usage_meters` — match run counts per org per month (id, org_id, year_month, count)
  - `subscriptions` — paid plan status per org (id, org_id, stripe_customer_id, stripe_subscription_id, status, updated_at)
- **D-04:** Every table has an `org_id` column. Row Level Security (RLS) is enabled on all tables, with policies that restrict rows to the authenticated org's `org_id` (sourced from the verified Clerk JWT, never from request body).

### Clerk Setup
- **D-05:** Create a new dedicated Clerk application for stock transfer (separate from the companion app). Name: "PharmIQ Stock Transfer" (or similar).
- **D-06:** JWT template named `stocktransfer-worker` — used by the Hono Worker to verify tokens. Clerk Organizations must be enabled.
- **D-07:** Sign-in methods: Google, Microsoft (Azure AD), and email + password — all three enabled.

### Authenticated Shell UI
- **D-08:** Cloudflare Pages app (`apps/web/`) ships a PharmIQ-branded shell in Phase 1 using the brand palette: teal `#0F766E` primary, amber `#D97706` accent, navy `#0F172A` dark base. Fonts: Space Grotesk (headings) + Inter (body).
- **D-09:** Sign-in page at `/sign-in` uses Clerk's `<SignIn />` component styled with PharmIQ colours.
- **D-10:** Authenticated root route (`/`) shows an app shell with:
  - Teal header with PharmIQ logo/wordmark
  - Sidebar with disabled/greyed nav items: Upload, Match, Billing
  - Sidebar footer: Settings / Org, Sign out
  - Empty main content area with a placeholder (e.g. "Phase 1 scaffold — features coming soon")
- **D-11:** Nav items (Upload, Match, Billing) are rendered as disabled links — they get enabled by Phases 3, 4, and 5 respectively.

### Claude's Discretion
- Exact NEON column types, indexes, and constraint names — use standard Postgres conventions
- React component structure within `apps/web/` — Claude picks the pattern (e.g. Vite + React Router, or Next.js Pages router)
- Hono middleware composition order and error response shapes (must return 401/403 as per success criteria)
- Whether to use `@neondatabase/serverless` HTTP driver or Hyperdrive — use HTTP driver for v1 simplicity (STATE.md decision)
- Exact Wrangler binding names for secrets (CLERK_SECRET_KEY, DATABASE_URL, etc.)
- Whether to use Clerk's `@clerk/backend` JWT verification or manual JWKS verification in the Worker

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Definition
- `.planning/ROADMAP.md` §Phase 1 — goal, success criteria (5 items), dependencies, requirements list
- `.planning/REQUIREMENTS.md` AUTH-01, AUTH-02, AUTH-03 — exact auth and tenancy requirements that define Phase 1 acceptance

### Brand & UI
- `brand-identity-pharma-apps/brand-identity/brand-guidelines.md` — PharmIQ brand guide: colour palette, typography (Space Grotesk + Inter), tone, logo usage. Required reading before building any UI.

### Existing Prototype (reference only — do not copy architecture)
- `dead-stock-tranfer-app/src/App.js` — existing React app; reuse VirtualizedTable component logic and dark-mode pattern as reference for future phases
- `stock_transfer_project/api/views.py` — existing matching algorithm; audit target for Phase 2, not relevant to Phase 1

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VirtualizedTable` component in `dead-stock-tranfer-app/src/App.js` — custom virtualized list, will be useful in Phase 4 results view (port to new stack)
- Dark mode logic (localStorage + `document.documentElement` class toggle) — carry pattern forward to `apps/web/`

### Established Patterns
- Tailwind CSS utility classes used throughout existing frontend — continue with Tailwind in `apps/web/`
- `async/await` for all async operations (no `.then()` chains) — enforce in Worker code too
- camelCase JSON keys in API responses (existing `isRanged`, `sellThrough` etc.) — maintain convention in Hono responses

### Integration Points
- Phase 1 Worker must expose at minimum: `GET /api/health` (returns verified org_id) for auth smoke-test
- Phase 3 will add upload endpoints to the same Worker — keep routing modular (Hono route groups)
- Phase 4 will add match endpoint — same Worker
- NEON `org_id` is the tenancy key — all future data operations flow through it

</code_context>

<specifics>
## Specific Ideas

- The Hono Worker's JWT middleware must source `org_id` from the verified Clerk JWT only — never from a request body or query param (AUTH-02)
- Missing JWT → 401; valid JWT but no active Clerk org → 403 (AUTH-03) — these are hard requirements, not soft checks
- RLS must be enforced at the database layer (not just application layer) as per D-04
- `stocktransfer-worker` JWT template name is specific — downstream agents should use this exact name in Clerk config instructions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-28*
