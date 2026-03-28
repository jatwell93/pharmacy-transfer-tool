# Phase 1: Foundation - Research

**Researched:** 2026-03-28
**Domain:** Cloudflare Workers (Hono) + Clerk Auth + NEON Postgres + React/Vite SPA
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New `apps/` monorepo directory at repo root. Worker lives at `apps/worker/`, React Pages app at `apps/web/`. Wrangler config goes in `apps/worker/wrangler.jsonc`.
- **D-02:** Existing prototype directories (`dead-stock-tranfer-app/` and `stock_transfer_project/`) stay in place for reference — do not delete or rename them.
- **D-03:** All application tables are created in Phase 1 — full schema upfront. Tables: `orgs`, `stores`, `rou_data`, `dead_stock`, `usage_meters`, `subscriptions`.
- **D-04:** Every table has an `org_id` column. Row Level Security (RLS) is enabled on all tables, restricting rows to the authenticated org's `org_id` sourced exclusively from the verified Clerk JWT.
- **D-05:** Create a new dedicated Clerk application for stock transfer (separate from the companion app). Name: "PharmIQ Stock Transfer".
- **D-06:** JWT template named `stocktransfer-worker` — used by the Hono Worker to verify tokens. Clerk Organizations must be enabled.
- **D-07:** Sign-in methods: Google, Microsoft (Azure AD), and email + password — all three enabled.
- **D-08:** PharmIQ brand palette: teal `#0F766E` primary, amber `#D97706` accent, navy `#0F172A` dark base. Fonts: Space Grotesk (headings) + Inter (body).
- **D-09:** Sign-in page at `/sign-in` uses Clerk's `<SignIn />` component styled with PharmIQ colours.
- **D-10:** Authenticated root route (`/`) shows an app shell with teal header, sidebar with disabled nav items (Upload, Match, Billing), sidebar footer (Settings / Org, Sign out), and empty main content with a placeholder.
- **D-11:** Nav items (Upload, Match, Billing) rendered as disabled links — enabled by Phases 3, 4, 5 respectively.

### Claude's Discretion

- Exact NEON column types, indexes, and constraint names — use standard Postgres conventions
- React component structure within `apps/web/` — Claude picks the pattern (e.g. Vite + React Router, or Next.js Pages router)
- Hono middleware composition order and error response shapes (must return 401/403 as per success criteria)
- Whether to use `@neondatabase/serverless` HTTP driver or Hyperdrive — use HTTP driver for v1 simplicity (STATE.md decision)
- Exact Wrangler binding names for secrets (CLERK_SECRET_KEY, DATABASE_URL, etc.)
- Whether to use Clerk's `@clerk/backend` JWT verification or manual JWKS verification in the Worker

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can create an account and sign in via Clerk (email + social) | Clerk React SDK + `@clerk/react` ClerkProvider + `<SignIn />` component; social logins configured in Clerk dashboard |
| AUTH-02 | Each pharmacy group has isolated data — all queries scoped to `org_id` from verified Clerk JWT (never from request body) | `@hono/clerk-auth` middleware + `getAuth(c).orgId`; NEON RLS policies using `current_setting('request.jwt.claims')` |
| AUTH-03 | User without an active Clerk organisation is blocked at middleware before any data operation | `getAuth(c).orgId === undefined` check after JWT validation → 403 before any DB call; Hono middleware chain ordering |
</phase_requirements>

---

## Summary

Phase 1 builds the authenticated scaffold that all subsequent phases depend on. There are four distinct technical domains: (1) a Cloudflare Worker built with Hono that verifies Clerk JWTs and enforces org presence before any DB access, (2) a React SPA on Cloudflare Pages that integrates Clerk's hosted sign-in flow and shows an authenticated app shell, (3) a NEON Postgres database with the full v1 schema and Row Level Security policies that bind to Clerk JWT claims, and (4) a monorepo directory structure under `apps/` that keeps the Worker and web app buildable independently.

The critical path for auth correctness is: Clerk JWT arrives in `Authorization: Bearer <token>` header → `@hono/clerk-auth` middleware verifies the token using `CLERK_SECRET_KEY` → if invalid/missing → 401 immediately → check `auth.orgId` is present → if absent → 403 immediately → business logic proceeds with `auth.orgId` as the tenant key. The `org_id` is then threaded into every NEON query via `SET LOCAL "request.jwt.claims"` inside a SQL transaction so that RLS policies at the database layer enforce the same tenancy boundary as application code.

The web front end is a Vite + React SPA with `@clerk/react`, React Router v7 (Vite plugin integration), and Tailwind CSS v4. Cloudflare Pages deploys it with `not_found_handling = "single-page-application"` so all client-side routes are served correctly. The Worker and Pages app are separate deployable units sharing no build dependency, which keeps the `apps/` monorepo simple (no Turborepo required at this stage).

**Primary recommendation:** Use `@hono/clerk-auth` for JWT verification (delegates to Clerk's backend SDK, fetches JWKS automatically, handles clock skew). Use the `neon()` HTTP function from `@neondatabase/serverless` for all DB access. Apply RLS at the Postgres layer as a defence-in-depth guarantee — not as a substitute for application-layer `org_id` checks.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | 4.12.9 | HTTP framework for the Cloudflare Worker | Workers-native, excellent TS support, 12KB bundle, built-in middleware ecosystem |
| `@hono/clerk-auth` | 3.1.0 | Clerk JWT verification middleware for Hono | Official Hono middleware; delegates to `@clerk/backend` SDK, fetches JWKS automatically |
| `@clerk/backend` | 3.2.3 | Clerk backend SDK (peer dep of @hono/clerk-auth) | Required peer; provides `verifyToken()` and auth object types |
| `@neondatabase/serverless` | 1.0.2 | Postgres HTTP driver for NEON | Only driver that works in the Workers runtime without Node.js compat flags |
| `@clerk/react` | 6.1.3 | Clerk auth components for React | Official Clerk SDK for React; provides `<ClerkProvider>`, `<SignIn />`, `useAuth()` |
| `react` | 19.2.4 | UI framework | Already in project; Vite SPA target |
| `vite` | 8.0.3 | Build tool for `apps/web` | Standard for React SPAs; Cloudflare Vite plugin for Workers |
| `@cloudflare/vite-plugin` | latest | Integrates Vite dev server with Workers runtime | Required for local dev that matches production Workers environment |
| `tailwindcss` | 4.2.2 | Utility CSS framework | Project convention (already uses Tailwind); v4 uses `@tailwindcss/vite` plugin |
| `typescript` | 6.0.2 | Type safety across Worker + web | Required for `wrangler types` and all typed bindings |
| `wrangler` | 4.63.0 | Deploy Worker, manage secrets, type generation | Already installed globally; confirmed on this machine |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-router` | 7.x (DOM) | Client-side routing for `/sign-in` and `/` | Needed for multi-route SPA; v7 is supported by Cloudflare Pages |
| `@tanstack/react-router` | 1.168.7 | Alternative type-safe router | Alternative if type-safe routing is preferred; either works for Phase 1 |
| `vitest` | 4.1.2 | Test runner for Worker unit tests | `@cloudflare/vitest-pool-workers` runs tests in the actual Workers runtime |
| `@cloudflare/vitest-pool-workers` | 0.13.5 | Vitest pool that runs tests inside workerd | Required for testing Workers code; avoids Node.js polyfill issues |
| `zod` | 3.x | Request body validation in Hono routes | Use with `@hono/zod-validator` for the `/api/health` endpoint |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@hono/clerk-auth` | Manual JWKS fetch + `jose` library | More control, more code. `@hono/clerk-auth` is sufficient for v1 and handles JWKS caching automatically |
| `@neondatabase/serverless` HTTP driver | Hyperdrive + `postgres` driver | Hyperdrive gives lower latency but adds billing and Wrangler config complexity; HTTP driver is fine for v1 |
| React Router v7 | TanStack Router | TanStack Router is more type-safe; React Router is simpler, better documented for Clerk integration |
| Vite + `@cloudflare/vite-plugin` | React Router v7 framework mode | Framework mode gives SSR; Phase 1 is a pure SPA so standalone Vite SPA is simpler and less configuration |
| Tailwind v4 (`@tailwindcss/vite`) | Tailwind v3 + PostCSS | v4 is the current release; v4 uses Vite plugin directly, no postcss.config.js needed |

**Installation (Worker):**
```bash
cd apps/worker
npm install hono @hono/clerk-auth @clerk/backend @neondatabase/serverless
npm install -D wrangler typescript @cloudflare/vitest-pool-workers vitest
```

**Installation (Web):**
```bash
cd apps/web
npm install @clerk/react react react-dom react-router
npm install -D vite @vitejs/plugin-react @cloudflare/vite-plugin tailwindcss typescript
```

**Version verification:** Versions above are confirmed from npm registry on 2026-03-28 via `npm view <pkg> version`.

---

## Architecture Patterns

### Recommended Project Structure
```
apps/
├── worker/                  # Cloudflare Worker (Hono API)
│   ├── src/
│   │   ├── index.ts         # Worker entry point — exports Hono app
│   │   ├── middleware/
│   │   │   └── auth.ts      # Clerk JWT + org check middleware
│   │   ├── routes/
│   │   │   └── health.ts    # GET /api/health — Phase 1 smoke-test route
│   │   └── db/
│   │       ├── client.ts    # neon() factory — accepts org_id for RLS context
│   │       └── schema.sql   # Full schema (committed, run once in Phase 1)
│   ├── wrangler.jsonc
│   ├── package.json
│   └── tsconfig.json
├── web/                     # React SPA (Cloudflare Pages)
│   ├── src/
│   │   ├── main.tsx         # ClerkProvider + router setup
│   │   ├── App.tsx          # Route definitions
│   │   ├── pages/
│   │   │   ├── SignIn.tsx   # /sign-in — Clerk <SignIn /> component
│   │   │   └── Dashboard.tsx # / — authenticated app shell
│   │   └── components/
│   │       ├── AppShell.tsx # Header + sidebar layout
│   │       └── NavItem.tsx  # Disabled nav link
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
└── db/
    └── migrations/
        └── 0001_initial.sql # Full schema + RLS — run once via NEON console
```

### Pattern 1: Hono Auth Middleware — 401 then 403

**What:** Two-stage Hono middleware: first verify the JWT (→ 401 if invalid), then check `orgId` (→ 403 if absent). Business logic only runs after both gates pass.

**When to use:** Apply to all routes under `/api/*` except `/api/health` (health must work to test auth itself — keep health gated behind auth as per requirements).

**Example:**
```typescript
// apps/worker/src/middleware/auth.ts
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { createMiddleware } from 'hono/factory';

// Stage 1: verify Clerk JWT — returns 401 if invalid/missing
export const clerkAuth = clerkMiddleware();

// Stage 2: require active org — returns 403 if orgId absent
export const requireOrg = createMiddleware(async (c, next) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    // clerkMiddleware should have caught this, but belt-and-suspenders
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (!auth?.orgId) {
    return c.json({ error: 'Active Clerk organisation required' }, 403);
  }
  // Store on context for downstream handlers
  c.set('orgId', auth.orgId);
  await next();
});

// apps/worker/src/index.ts
import { Hono } from 'hono';
import { clerkAuth, requireOrg } from './middleware/auth';
import healthRoute from './routes/health';

const app = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();

app.use('/api/*', clerkAuth, requireOrg);
app.route('/api', healthRoute);

export default app;
```

### Pattern 2: NEON RLS via JWT Claims Transaction

**What:** Before any data query, call `SET LOCAL "request.jwt.claims"` inside a SQL transaction to inject the org_id. Postgres RLS policies read this setting using `current_setting('request.jwt.claims', true)`.

**When to use:** Every database helper that reads or writes data. Set it once per request at the `db/client.ts` factory layer.

**Example:**
```typescript
// apps/worker/src/db/client.ts
import { neon } from '@neondatabase/serverless';

export async function withOrgContext<T>(
  databaseUrl: string,
  orgId: string,
  query: (sql: ReturnType<typeof neon>) => Promise<T>
): Promise<T> {
  const sql = neon(databaseUrl);
  const claims = JSON.stringify({ org_id: orgId });
  // Transaction: set claims, then run the actual query
  const [, result] = await sql.transaction([
    sql`SELECT set_config('request.jwt.claims', ${claims}, true)`,
    // caller provides the actual query
  ] as any);
  // Simpler alternative: run in a single transaction using sql.transaction()
  return result as T;
}
```

Note: In practice, use `sql.transaction()` to set the config and run the query atomically:
```typescript
const [, rows] = await sql.transaction([
  sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ org_id: orgId })}, true)`,
  sql`SELECT org_id FROM orgs WHERE org_id = ${orgId}`,
]);
```

### Pattern 3: NEON RLS Policy SQL

**What:** Enable RLS on every table. Write a single permissive policy that restricts all row access to the current org from the JWT claims.

**Example (SQL in `db/migrations/0001_initial.sql`):**
```sql
-- Enable RLS on all tables
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE rou_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy pattern for each table (example: stores)
CREATE POLICY org_isolation ON stores
  FOR ALL
  USING (
    org_id = (
      current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
```

**CRITICAL:** The NEON connection string must use a database role that does NOT have the `BYPASSRLS` attribute. The `neondb_owner` role bypasses RLS — create a separate `app_user` role for the application.

### Pattern 4: Clerk React SPA with Protected Routes

**What:** Wrap the entire app in `<ClerkProvider>`. Use `<SignedIn>` / `<SignedOut>` guards to redirect unauthenticated users to `/sign-in`. After sign-in, redirect to `/`.

**Example:**
```typescript
// apps/web/src/main.tsx
import { ClerkProvider } from '@clerk/react';
import { createBrowserRouter, RouterProvider } from 'react-router';

const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/', element: <ProtectedRoute><Dashboard /></ProtectedRoute> },
]);

createRoot(document.getElementById('root')!).render(
  <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    afterSignOutUrl="/sign-in">
    <RouterProvider router={router} />
  </ClerkProvider>
);

// ProtectedRoute component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/sign-in" />;
  return <>{children}</>;
}
```

### Pattern 5: Wrangler Config for the Worker

**What:** `apps/worker/wrangler.jsonc` — use `wrangler.jsonc` (JSON, not TOML) per project skill guidance. Secrets stored via `wrangler secret put`, not in the config file.

**Example:**
```jsonc
// apps/worker/wrangler.jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "pharmiq-stock-transfer-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-03-01",
  "compatibility_flags": ["nodejs_compat_v2"],
  "observability": { "enabled": true }
}
// Secrets set separately (not in config):
// wrangler secret put CLERK_SECRET_KEY
// wrangler secret put DATABASE_URL
```

### Pattern 6: Cloudflare Pages Config for the SPA

**What:** `apps/web/wrangler.jsonc` — configure Pages asset serving with `not_found_handling = "single-page-application"` so React Router handles all routes. The Worker is a separate Cloudflare service.

**Example:**
```jsonc
// apps/web/wrangler.jsonc (Pages / Assets config only)
{
  "name": "pharmiq-stock-transfer-web",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

### Anti-Patterns to Avoid

- **Sourcing org_id from request body or query params:** AUTH-02 is explicit — `org_id` comes only from the verified JWT. Never trust request body data for tenancy.
- **Using `neondb_owner` role in DATABASE_URL:** This role has BYPASSRLS, which silently disables all RLS policies. Create a dedicated `app_user` role.
- **Putting Clerk secret key in `wrangler.jsonc` `vars`:** Use `wrangler secret put CLERK_SECRET_KEY` — vars are plaintext in config; secrets are encrypted.
- **Running auth in a Pages Function instead of a separate Worker:** The plan specifies `apps/worker/` as a standalone Cloudflare Worker, not a Pages Function. Keep them separate.
- **Checking `auth.userId` only (skipping `auth.orgId` check):** A valid JWT user with no active org must still get a 403. Both checks are required (AUTH-03).
- **Using Next.js adapter for Cloudflare Pages:** The `@cloudflare/next-on-pages` adapter is deprecated (confirmed by skill reference). Use React + Vite.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signature verification | Custom JWKS fetch + WebCrypto verify | `@hono/clerk-auth` + `@clerk/backend` | JWKS caching, clock skew, `azp` validation, key rotation — all handled |
| Token clock skew | Manual `Date.now()` comparisons | `@clerk/backend` `verifyToken()` | Built-in `clockSkewInMs` option (default 5000ms) |
| CORS preflight handling | Custom OPTIONS handler | `hono/cors` middleware | One-liner, handles all CORS scenarios correctly |
| SQL injection protection | String escaping | `neon` template literal tags | Parameterised queries baked in: `sql`SELECT * FROM t WHERE id = ${val}`` |
| RLS bypass detection | Application-layer table scans | Postgres RLS + non-BYPASSRLS role | DB-layer enforcement is independent of application code paths |
| Environment variable access in Vite | `process.env` | `import.meta.env.VITE_*` | Vite requires `VITE_` prefix to expose vars to the browser bundle |

**Key insight:** Both the JWT verification layer and the RLS layer must be correct independently. If application code accidentally passes the wrong `org_id` to the DB, RLS blocks the query. If the DB connection bypasses RLS (wrong role), application code is the only defence. Defence in depth requires both layers to work.

---

## Common Pitfalls

### Pitfall 1: Clerk Session Token v2 uses `o.id`, not `org_id`, as the claim name

**What goes wrong:** Developer inspects a Clerk JWT and expects to find `org_id` as a top-level claim (v1 format), but v2 tokens (current as of April 2025) use a compact `o` object with `o.id` for the org ID.

**Why it happens:** Clerk deprecated v1 session tokens on April 14, 2025. Legacy docs still show `org_id`. The `@hono/clerk-auth` `getAuth()` call returns the parsed `orgId` correctly regardless of token version — so only code that manually decodes the JWT and reads `org_id` directly will break.

**How to avoid:** Always use `getAuth(c).orgId` (from `@hono/clerk-auth`) rather than decoding the JWT payload manually. If a custom JWT template (`stocktransfer-worker`) is created in the Clerk Dashboard, explicitly add `"org_id": "{{org.id}}"` to the claims JSON to ensure the field name is predictable for the RLS `set_config` call.

**Warning signs:** JWT decoded payload missing `org_id` at top level; `current_setting('request.jwt.claims')::json->>'org_id'` returning NULL in RLS policies.

### Pitfall 2: RLS silently disabled because connection uses `neondb_owner` role

**What goes wrong:** All RLS policies exist but every user can read every org's data. Smoke tests on the developer's own org pass, masking the vulnerability.

**Why it happens:** NEON auto-creates the database with an owner role that has `BYPASSRLS = true`. If `DATABASE_URL` is copied from the NEON console "Connection string" tab without creating a restricted role, it will use the owner credentials.

**How to avoid:** Create a `pharmiq_app` role with `NOLOGIN NOINHERIT` in the schema migration, grant it `SELECT`, `INSERT`, `UPDATE`, `DELETE` on all application tables, and use a connection string for that role in production. Confirm via: `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'pharmiq_app';` — must return `f`.

**Warning signs:** `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user;` returns `t`.

### Pitfall 3: Vite environment variables not exposed to the browser

**What goes wrong:** `CLERK_PUBLISHABLE_KEY` is set as an environment variable in the build environment but `ClerkProvider` receives `undefined` for `publishableKey`.

**Why it happens:** Vite only exposes variables with the `VITE_` prefix to client code. A variable named `CLERK_PUBLISHABLE_KEY` is stripped.

**How to avoid:** Name it `VITE_CLERK_PUBLISHABLE_KEY` in `.env` and in the Cloudflare Pages environment settings. Reference as `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY` in code.

**Warning signs:** ClerkProvider throws "Missing publishableKey" in the browser console; variable works in Node tests but not in browser builds.

### Pitfall 4: `apps/web` SPA returns 404 on direct route navigation

**What goes wrong:** Navigating to `https://app.example.com/sign-in` directly (or refreshing a React Router route) returns Cloudflare's 404 page.

**Why it happens:** By default, Cloudflare Pages serves only exact asset matches. A request for `/sign-in` has no corresponding file in `dist/`.

**How to avoid:** Set `not_found_handling = "single-page-application"` in `wrangler.jsonc` for the Pages project. This returns `index.html` for all unmatched paths, letting React Router handle routing.

**Warning signs:** Direct URL navigation works in local dev (`vite dev` serves `index.html` for all routes) but fails after Pages deployment.

### Pitfall 5: `@hono/clerk-auth` `clerkMiddleware()` returns 401 in production but not local dev

**What goes wrong:** JWT verification passes locally but fails after deploying the Worker.

**Why it happens:** `clerkMiddleware()` uses `CLERK_SECRET_KEY` from `env` bindings. In local dev this comes from `.dev.vars`. In production it comes from `wrangler secret put`. If the secret is not pushed, the middleware has no key and rejects every request.

**How to avoid:** Run `wrangler secret put CLERK_SECRET_KEY` explicitly before deployment. The `Env` type (from `wrangler types`) should declare `CLERK_SECRET_KEY: string` so TypeScript fails if it's missing.

**Warning signs:** Worker returns 401 for all requests in production; `wrangler secret list` does not show `CLERK_SECRET_KEY`.

### Pitfall 6: `azp` claim rejection when Worker and Pages are on different domains

**What goes wrong:** JWT verification passes in local dev but `@clerk/backend` rejects tokens in production with an "Invalid azp" error.

**Why it happens:** Clerk's `verifyToken()` validates the `azp` (authorized parties) claim against a whitelist. If the Pages domain (`https://pharmiq-stock-transfer-web.pages.dev`) is not in the `authorizedParties` list, tokens from the SPA will be rejected.

**How to avoid:** Pass `authorizedParties: [env.ALLOWED_ORIGIN]` when initialising the Clerk client in the Worker, or set it as a Wrangler variable. Include both the `pages.dev` preview URL and the custom domain.

**Warning signs:** 401 responses only in production, not in local dev; JWT payload includes an `azp` value matching the Pages domain.

### Pitfall 7: NEON connection string requires `?sslmode=require` for serverless HTTP driver

**What goes wrong:** Worker throws a TLS error connecting to NEON in production.

**Why it happens:** NEON requires SSL but the connection string copied from the dashboard may not include `?sslmode=require` explicitly.

**How to avoid:** The NEON serverless HTTP driver enforces SSL by default over HTTPS, so this is less likely to bite with the HTTP driver than with TCP drivers. Confirm the `DATABASE_URL` does not start with `postgres://` in a context that implies plain TCP — when using `@neondatabase/serverless` `neon()`, only the HTTP path is used and SSL is implicit.

**Warning signs:** `Connection terminated` errors; use the pooled connection string from the NEON "Connection" tab with the "Pooling" toggle enabled.

---

## Code Examples

Verified patterns from official sources:

### Clerk JWT verification — `@hono/clerk-auth` with Hono

```typescript
// Source: https://github.com/honojs/middleware/tree/main/packages/clerk-auth
import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';

const app = new Hono<{ Bindings: { CLERK_SECRET_KEY: string; CLERK_PUBLISHABLE_KEY: string } }>();

app.use('*', clerkMiddleware());

app.get('/api/health', (c) => {
  const auth = getAuth(c);

  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (!auth?.orgId) {
    return c.json({ error: 'Active Clerk organisation required' }, 403);
  }

  return c.json({ orgId: auth.orgId });
});
```

### NEON serverless HTTP driver — basic query

```typescript
// Source: https://neon.com/docs/guides/cloudflare-workers
import { neon } from '@neondatabase/serverless';

const sql = neon(env.DATABASE_URL);
const rows = await sql`SELECT * FROM orgs WHERE org_id = ${orgId}`;
```

### NEON RLS — JWT claims via transaction

```typescript
// Source: https://neon.com/docs/serverless/serverless-driver
import { neon } from '@neondatabase/serverless';

async function queryWithOrgContext(databaseUrl: string, orgId: string) {
  const sql = neon(databaseUrl);
  const claims = JSON.stringify({ org_id: orgId });
  const [, rows] = await sql.transaction([
    sql`SELECT set_config('request.jwt.claims', ${claims}, true)`,
    sql`SELECT org_id FROM orgs WHERE org_id = ${orgId}`,
  ]);
  return rows;
}
```

### NEON schema — table creation with RLS

```sql
-- Source: NEON RLS docs (https://neon.com/docs/guides/row-level-security)
-- Plus standard Postgres conventions

CREATE TABLE IF NOT EXISTS orgs (
  org_id     TEXT PRIMARY KEY,           -- Clerk org_id (e.g. org_xxx)
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON orgs
  FOR ALL
  USING (
    org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')
  );
```

### Clerk React — `ClerkProvider` with Vite environment variable

```typescript
// Source: https://clerk.com/docs/react/getting-started/quickstart
import { ClerkProvider } from '@clerk/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
                   afterSignOutUrl="/sign-in">
      <App />
    </ClerkProvider>
  </StrictMode>
);
```

### Clerk React — get JWT to call the Worker API

```typescript
// Source: Clerk docs — useAuth() hook
import { useAuth } from '@clerk/react';

function useFetch() {
  const { getToken } = useAuth();

  return async (endpoint: string, options?: RequestInit) => {
    const token = await getToken();  // Gets the active session token
    return fetch(`${import.meta.env.VITE_WORKER_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  };
}
```

### Wrangler — JSONC config for the Worker

```jsonc
// Source: wrangler skill — prefer wrangler.jsonc over wrangler.toml
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "pharmiq-stock-transfer-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-03-01",
  "compatibility_flags": ["nodejs_compat_v2"],
  "observability": { "enabled": true }
}
// Secrets (not in config):
// wrangler secret put CLERK_SECRET_KEY
// wrangler secret put DATABASE_URL
// wrangler secret put ALLOWED_ORIGIN
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Clerk v1 session token (`org_id` top-level claim) | Clerk v2 token (`o.id` nested claim) | April 14, 2025 | Use `getAuth(c).orgId` not raw JWT decode; custom templates can expose `org_id` explicitly |
| `wrangler.toml` config file | `wrangler.jsonc` (JSON config) | 2024 (Wrangler 3+) | JSON-only features exist; prefer JSONC for new projects |
| `@cloudflare/next-on-pages` for Next.js on Pages | Vite + React (plain SPA) or SvelteKit/Nuxt | 2024 (deprecated) | Next.js adapter is unmaintained; do not use |
| Workers Free plan (10ms CPU limit) | Workers Paid plan (30s CPU limit) | Always separate tiers | Mandatory upgrade before Phase 1 — CSV parsing alone exceeds 10ms |
| `neondb_owner` role in connection string | Dedicated `app_user` role without BYPASSRLS | Best practice (always) | `neondb_owner` silently bypasses all RLS policies |

**Deprecated/outdated:**
- `@cloudflare/next-on-pages`: Deprecated, unmaintained, incompatible with Next.js 15+. Do not use for this project.
- Clerk v1 session token `org_id` direct claim: Deprecated April 14 2025. Use SDK `getAuth()` helpers.
- Wrangler TOML config: Still works but new features are JSON-only. Use `wrangler.jsonc`.

---

## Open Questions

1. **Clerk Organisation creation flow in Phase 1**
   - What we know: The Clerk Dashboard requires Organizations to be enabled, and a user can create an org from the Clerk `<OrganizationList />` or `<CreateOrganization />` components.
   - What's unclear: The CONTEXT.md specifies the app shell shows disabled nav but does not specify how a new user creates/joins their first organisation before they can access any data. If `orgId` is required (AUTH-03), a user with no org gets a 403 on every request.
   - Recommendation: Add a post-sign-in redirect check: if `orgId` is absent, show a "Create your pharmacy group" screen with `<CreateOrganization />` or `<OrganizationList />` before showing the dashboard. This is a Phase 1 UX edge case that should be covered in the plan.

2. **Clerk JWT template claim shape for RLS**
   - What we know: The `stocktransfer-worker` JWT template must expose `org_id` as a top-level key so `current_setting('request.jwt.claims', true)::json->>'org_id'` works in RLS policies.
   - What's unclear: Whether the shortcode in the Clerk JWT template editor is `{{org.id}}` or `{{organization.id}}`. The v2 token uses `o.id` internally but the template shortcode may differ.
   - Recommendation: In the plan, include a step to verify the correct Clerk shortcode by creating a test token and inspecting the decoded payload. The template claim body should be `{ "org_id": "{{org.id}}" }`.

3. **NEON connection role setup**
   - What we know: The schema migration must create a `pharmiq_app` role without `BYPASSRLS` and the `DATABASE_URL` secret must reference that role's credentials.
   - What's unclear: NEON's console may not expose a simple "create role" UI — this may require running raw SQL via the NEON SQL editor or the NEON MCP server.
   - Recommendation: Include a specific schema migration step that creates the role, grants table permissions, and adds a verification query. Flag as manual step with NEON SQL editor.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Worker + Web builds | Yes | v22.20.0 | — |
| npm | Package management | Yes | 11.7.0 | — |
| Wrangler CLI | Worker deployment + secrets | Yes | 4.63.0 | — |
| git | Source control | Yes | 2.51.1 | — |
| Cloudflare Workers Paid plan | CPU budget for CSV/XLSX parsing (later phases) | Unknown — manual prerequisite | — | None; must upgrade before Phase 1 execution |
| NEON Postgres project | Database | Unknown — must be created | — | None; required |
| Clerk application (PharmIQ Stock Transfer) | Authentication | Unknown — must be created | — | None; required |

**Missing dependencies with no fallback:**
- Cloudflare Workers Paid plan: Must be upgraded manually in the Cloudflare Dashboard before any Worker deployment. STATE.md documents this as a hard blocker.
- NEON Postgres project: Must be created in the NEON console. Credentials must be configured as Wrangler secrets.
- Clerk application: Must be created in the Clerk Dashboard with Organizations enabled, social providers configured, and `stocktransfer-worker` JWT template created.

**Missing dependencies with fallback:**
- None identified for Phase 1.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 + `@cloudflare/vitest-pool-workers` 0.13.5 |
| Config file | `apps/worker/vitest.config.ts` — does not exist yet (Wave 0 gap) |
| Quick run command | `cd apps/worker && npm test -- --run` |
| Full suite command | `cd apps/worker && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | User can sign in via Clerk (UI smoke) | manual | — (browser-only) | N/A |
| AUTH-02 | Request with valid JWT + active org returns `orgId` | integration | `npm test -- health.test.ts` | Wave 0 |
| AUTH-02 | `org_id` in DB query matches JWT claim (not request body) | unit | `npm test -- auth.test.ts` | Wave 0 |
| AUTH-03 | Request with missing JWT → 401 | unit | `npm test -- auth.test.ts` | Wave 0 |
| AUTH-03 | Request with valid JWT but no org → 403 | unit | `npm test -- auth.test.ts` | Wave 0 |
| AUTH-03 | Request with valid JWT + org → passes middleware | unit | `npm test -- auth.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/worker && npm test -- --run`
- **Per wave merge:** `cd apps/worker && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/worker/vitest.config.ts` — Vitest + `@cloudflare/vitest-pool-workers` config
- [ ] `apps/worker/src/middleware/auth.test.ts` — covers AUTH-02 (invalid JWT → 401), AUTH-03 (no org → 403), AUTH-03 (valid JWT + org → passes)
- [ ] `apps/worker/src/routes/health.test.ts` — covers AUTH-02 (valid token returns orgId)
- [ ] `apps/worker/package.json` — test script: `"test": "vitest"`
- [ ] Framework install: `cd apps/worker && npm install -D vitest @cloudflare/vitest-pool-workers`

---

## Project Constraints (from CLAUDE.md)

Directives the planner MUST verify compliance with:

| Directive | Source | Implication for Phase 1 |
|-----------|--------|------------------------|
| Stack: Cloudflare Workers (Node) + Pages (React) + NEON Postgres + Clerk | CLAUDE.md constraints | Worker = Hono on CF Workers; Web = React Vite on CF Pages; DB = NEON; Auth = Clerk |
| No Python, no traditional server, no Django | CLAUDE.md out of scope | `stock_transfer_project/` is reference only; new code is TypeScript |
| No SQLite | CLAUDE.md out of scope | Use NEON Postgres exclusively for all persistence |
| `async/await` for all async operations, no `.then()` chains | CLAUDE.md conventions | Enforce in Worker code and React code |
| camelCase JSON keys in API responses | CLAUDE.md naming conventions | Hono `c.json()` responses use camelCase keys |
| Workers Paid plan is a prerequisite | STATE.md/ROADMAP.md | Human must upgrade before Phase 1 execution starts |

---

## Sources

### Primary (HIGH confidence)
- Project skill: `.claude/skills/cloudflare/references/workers/frameworks.md` — Hono setup, Worker entry point, middleware patterns
- Project skill: `.claude/skills/cloudflare/references/workers/gotchas.md` — CPU limits, module-level state, compatibility flags
- Project skill: `.claude/skills/cloudflare/references/pages/gotchas.md` — `not_found_handling`, deprecated Next.js adapter
- Project skill: `.claude/skills/wrangler/SKILL.md` — `wrangler.jsonc` preference, secrets management, `wrangler types`
- npm registry (2026-03-28): all package versions confirmed via `npm view <pkg> version`

### Secondary (MEDIUM confidence)
- [NEON serverless driver docs](https://neon.com/docs/serverless/serverless-driver) — HTTP driver usage, `transaction()` API, JWT claims via `set_config`, connection string format
- [NEON Cloudflare Workers guide](https://neon.com/docs/guides/cloudflare-workers) — wrangler config, pooled connection string requirement
- [NEON RLS guide](https://neon.com/docs/guides/row-level-security) — `current_setting('request.jwt.claims')` in RLS policies, `auth.user_id()` pattern
- [Clerk session tokens reference](https://clerk.com/docs/guides/sessions/session-tokens) — v2 token structure, `o` claim, `orgId` via `getAuth()`
- [Clerk Auth object reference](https://clerk.com/docs/reference/backend/types/auth-object) — `orgId`, `orgRole`, `orgPermissions` fields
- [Clerk React quickstart](https://clerk.com/docs/react/getting-started/quickstart) — `VITE_CLERK_PUBLISHABLE_KEY`, `ClerkProvider`, `afterSignOutUrl`
- [Cloudflare Workers React + Vite guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/) — scaffolding, `not_found_handling = "single-page-application"`, `wrangler.jsonc` for Pages
- [@hono/clerk-auth README](https://github.com/honojs/middleware/tree/main/packages/clerk-auth) — `clerkMiddleware()`, `getAuth(c)`, `c.get('clerk')` pattern
- [verifyToken() reference](https://clerk.com/docs/reference/backend/verify-token) — function signature, `jwtKey`, `authorizedParties`, `clockSkewInMs`

### Tertiary (LOW confidence — needs validation)
- Clerk JWT template shortcode for `org.id` (exact shortcode syntax not confirmed from official docs — verify in Clerk dashboard)
- NEON `pharmiq_app` role creation exact SQL (standard Postgres syntax used — verify against NEON console behaviour)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions confirmed from npm registry 2026-03-28
- Architecture: HIGH — patterns sourced from project skill references + official NEON/Clerk/Cloudflare docs
- Pitfalls: HIGH (for structural issues) / MEDIUM (for Clerk v2 token shortcode exact syntax)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (30 days — Clerk and NEON APIs are stable; Hono middleware ecosystem is fast-moving but breaking changes unlikely at patch/minor level)
