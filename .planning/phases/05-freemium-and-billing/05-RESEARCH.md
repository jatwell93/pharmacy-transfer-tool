# Phase 5: Freemium and Billing - Research

**Researched:** 2026-04-05
**Domain:** Stripe Checkout + Webhook Verification, PostgreSQL atomic usage metering, Hono route middleware bypass
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Usage Metering (Worker)**
- D-01: Atomic usage check uses the SQL pattern: `UPDATE usage_meters SET count = count + 1 WHERE org_id = $1 AND year_month = $2 AND count < limit RETURNING count`. If 0 rows updated → return 429. If row doesn't exist yet → INSERT first (upsert pattern).
- D-02: `GET /api/usage` returns `{ count: number, limit: number, plan: 'free' | 'paid' }` for the authenticated org. Fetched on Match page mount. Clerk JWT required.
- D-03: `POST /match` response does NOT include usage data. Frontend re-fetches `GET /api/usage` after a successful match run.

**Upgrade Prompt UX**
- D-04: When `POST /match` returns 429, display a modal overlay on the Match page. Modal includes an Upgrade CTA that opens Stripe Checkout.
- D-05: Server-side enforcement is the security guarantee — 429 returned BEFORE `matchTransfers()` executes. Modal is purely UX.
- D-06: When the frontend knows the user is already at their limit (usage count = limit from `GET /api/usage`), the Run Match button is disabled and shows a lock icon or "Upgrade to run again" label.

**Usage Counter Display**
- D-07: Usage counter shown on Match page only, in the control bar.
- D-08: Counter hidden for paid-plan orgs.
- D-09: Counter updates without page refresh — re-fetch `GET /api/usage` after each successful match run.

**Billing Page**
- D-10: Enable Billing nav item (`disabled={true}` → `disabled={false}`) and add `/billing` route in `App.tsx`.
- D-11: Billing page is minimal: current plan name, runs used + limit, Upgrade CTA for free orgs. Paid orgs see "Paid plan — unlimited runs".
- D-12: No subscription management UI in Phase 5.

**Stripe Integration**
- D-13: Stripe Checkout only — no Customer Portal. Upgrade CTA creates a Checkout Session via `POST /api/billing/create-checkout` and redirects to Stripe-hosted checkout.
- D-14: `POST /api/stripe/webhook` is a public route (no Clerk auth). Verifies `Stripe-Signature` header. Two events: `checkout.session.completed` → set plan to `paid`; `customer.subscription.deleted` → set plan to `free`.
- D-15: Access remains paid until billing period ends. Worker sets plan to `free` only on `customer.subscription.deleted`, not on cancellation notice.
- D-16: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` added as Worker secrets. `STRIPE_PUBLISHABLE_KEY` added to web app env. `Env` interface in `types.ts` updated.

### Claude's Discretion
- Exact SQL for `usage_meters` upsert (INSERT ... ON CONFLICT DO UPDATE vs SELECT then INSERT)
- Whether `usage_meters.limit` is a column on the row or derived from the org's `subscriptions.status` at query time
- Stripe Checkout session parameters (price ID, success/cancel URLs, client_reference_id for org_id mapping)
- Loading state for the usage counter on Match page mount
- Modal design details (width, overlay opacity, exact copy)
- Error handling if `GET /api/usage` fails (fail silently, show counter as "–/1")
- Whether to store the Stripe price ID in env vars or hardcode for v1

### Deferred Ideas (OUT OF SCOPE)
- Stripe Customer Portal (self-serve subscription management / cancellation from the app)
- Payment failure handling / dunning
- Usage history log (match runs per month over time)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BILLING-01 | Free tier: 1 match run/month per org, enforced via atomic Postgres counter | D-01 SQL pattern confirmed viable; upsert pattern documented in Architecture Patterns section |
| BILLING-02 | User can see match runs used and monthly limit | GET /api/usage endpoint; useUsage hook; counter in Match control bar |
| BILLING-03 | When free limit reached, user sees upgrade prompt with Stripe checkout link | Modal + disabled button pattern; Stripe Checkout Session URL redirect documented |
| BILLING-04 | Stripe subscription creation, webhook handling, plan activation/cancellation | Stripe SDK v22; constructEventAsync; webhook event map documented |
</phase_requirements>

---

## Summary

Phase 5 adds three distinct integration surfaces: (1) a PostgreSQL atomic usage counter that enforces the free-tier limit before `matchTransfers()` runs, (2) a Stripe Checkout + webhook pipeline that activates paid plans, and (3) UI additions to the Match page and a new Billing page. All three are well-supported by existing infrastructure — the NEON schema already contains `usage_meters` and `subscriptions` tables, the Hono Worker pattern (Cloudflare Workers) already has the middleware and route module structure, and the React web app already has the fetch hook and routing conventions needed.

The most technically nuanced parts are: the atomic usage meter upsert (the exact SQL matters — an INSERT ON CONFLICT pattern both initialises the row and checks the limit atomically), the Hono webhook route that must be registered before global `/api/*` middleware to remain public, and Stripe webhook verification using `constructEventAsync` (the async variant required for Workers' WebCrypto environment). The `stripe.redirectToCheckout()` method is deprecated as of September 2025 — the correct approach is to redirect via `window.location.href = session.url` using the URL returned by the server-side Checkout Session creation.

**Primary recommendation:** Install `stripe` v22 (current) in the Worker, implement the upsert usage counter in a dedicated `billingRoute` Hono module, register the webhook route before the global auth middleware in `index.ts`, and redirect to Checkout from the frontend using the session URL returned by `POST /api/billing/create-checkout`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` (npm) | 22.0.0 | Stripe API client — Checkout Session creation + webhook verification | Official Stripe SDK; v11.10+ requires no `node_compat`, uses `createFetchHttpClient()` for Workers |
| `@neondatabase/serverless` | 1.0.2 (already installed) | NEON Postgres queries — usage_meters upsert, subscriptions update | Already in use; HTTP transaction API supports atomic multi-statement batches |
| `hono` | 4.12.9 (already installed) | Route modules for billing + webhook endpoints | Already in use; `app.post()` registration order controls middleware bypass |

[VERIFIED: npm registry — `npm view stripe version` returned `22.0.0`]
[VERIFIED: codebase — `apps/worker/package.json` shows `@neondatabase/serverless@^1.0.2`, `hono@^4.12.9`]

### Supporting (Web App)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | 0.462.0 (already installed) | Lock icon for disabled Run Match button, CreditCard icon for Billing nav | Use `Lock` icon for paywall state |
| Tailwind utility classes | 4.x (already installed) | Billing page layout + modal overlay styling | Use existing brand tokens; no new CSS files |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `stripe` (official SDK) | Raw fetch to Stripe API | SDK handles retries, type safety, webhook signature verification — do not hand-roll |
| `window.location.href = session.url` | `stripe.redirectToCheckout()` | `redirectToCheckout` deprecated September 2025 [VERIFIED: Stripe changelog] |
| `constructEventAsync` | `constructEvent` | `constructEvent` is synchronous; Workers use async WebCrypto — must use `constructEventAsync` |

**Installation (Worker only — Stripe is a backend dependency):**
```bash
cd apps/worker
npm install stripe
```

No Stripe package needed in `apps/web` — the web app only redirects to `session.url` returned by the Worker.

---

## Architecture Patterns

### Route Module Structure

New route modules follow the established pattern from `apps/worker/src/routes/upload.ts`:

```
apps/worker/src/routes/
├── health.ts      (existing)
├── upload.ts      (existing — reference pattern)
├── match.ts       (existing — insert usage check here)
├── billing.ts     (NEW — GET /api/usage + POST /api/billing/create-checkout)
└── webhook.ts     (NEW — POST /api/stripe/webhook, PUBLIC)
```

```
apps/web/src/
├── pages/
│   └── BillingPage.tsx          (NEW)
├── hooks/
│   └── useUsage.ts              (NEW — wraps GET /api/usage)
└── App.tsx                       (ADD /billing route)
```

### Pattern 1: Atomic Usage Meter Upsert (Discretion Area)

The D-01 SQL is the check-and-increment for an existing row. But the row may not exist on first use. The recommended pattern initialises the row via INSERT ON CONFLICT, then performs the conditional UPDATE — both expressed as a NEON HTTP transaction (two statements):

```sql
-- Statement 1: upsert row (ensures it exists before the UPDATE)
INSERT INTO usage_meters (org_id, year_month, count)
VALUES ($org_id, $year_month, 0)
ON CONFLICT (org_id, year_month) DO NOTHING;

-- Statement 2: conditional increment (the D-01 check)
UPDATE usage_meters
SET count = count + 1
WHERE org_id = $org_id
  AND year_month = $year_month
  AND count < $limit
RETURNING count;
```

If UPDATE returns 0 rows → limit exceeded → return 429 before `matchTransfers()`.

**NEON HTTP transaction constraint (Phase 1 learnt decision):** The `withOrgContext` callback is synchronous and returns an array. Calling `withOrgContext` twice (one call per statement) is the established pattern (see Phase 3 store replace). For the usage meter, two sequential `withOrgContext` calls work fine because the upsert followed by the conditional UPDATE is not a single atomic unit — the upsert makes the row exist, then the UPDATE atomically checks and increments.

**Alternative — single-call approach:** If NEON's HTTP transaction API is used without `withOrgContext` (using `sql.transaction()` directly), both statements can run in one transaction:

```typescript
// Source: NEON serverless docs — sql.transaction([...queries])
const sql = neon(databaseUrl);
const claims = JSON.stringify({ org_id: orgId });
const [, , updateResult] = await sql.transaction((tx) => [
  tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
  tx`INSERT INTO usage_meters (org_id, year_month, count)
     VALUES (${orgId}, ${yearMonth}, 0)
     ON CONFLICT (org_id, year_month) DO NOTHING`,
  tx`UPDATE usage_meters
     SET count = count + 1
     WHERE org_id = ${orgId} AND year_month = ${yearMonth} AND count < ${limit}
     RETURNING count`,
]);
// updateResult.length === 0 → limit exceeded
```

This is preferable — both statements share one transaction, RLS context is set once, and atomicity is guaranteed. The planner should choose this for the match route usage check.

[VERIFIED: NEON docs — `sql.transaction([...queries])` returns array of results in same order]
[CITED: https://neon.com/docs/serverless/serverless-driver]

### Pattern 2: Determine Limit from Subscriptions Table (Discretion Area)

The `usage_meters` table (from Phase 1 D-03) has columns: `id, org_id, year_month, count`. It does NOT have a `limit` column based on the Phase 1 schema decision.

Recommended approach: derive the limit at query time from the `subscriptions` table:

```typescript
// Step 1: fetch plan status
const [subRow] = await withOrgContext<Array<{ status: string }>>(
  dbUrl, orgId,
  (tx) => tx`SELECT status FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`
);
const plan = subRow?.status ?? 'free';
const limit = plan === 'paid' ? Infinity : 1;

// Step 2: if paid, skip usage check entirely
// Step 3: if free, run the upsert + conditional UPDATE
```

This avoids duplicating the limit value into `usage_meters` and keeps the source of truth in `subscriptions`. The planner should implement this pattern — it is simpler than adding a `limit` column to `usage_meters`.

[ASSUMED] — The `usage_meters` schema from Phase 1 D-03 does not list a `limit` column. The schema shows `(id, org_id, year_month, count)`. If a `limit` column was added during Phase 1 execution, the planner should use it directly instead.

### Pattern 3: Stripe Checkout Session Creation

```typescript
// Source: Stripe API docs + Cloudflare Workers blog
import Stripe from 'stripe';

// Initialise with Fetch HTTP client (required for Workers)
const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
});

const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{ price: PRICE_ID, quantity: 1 }],
  success_url: `${c.env.ALLOWED_ORIGIN}/billing?checkout=success`,
  cancel_url: `${c.env.ALLOWED_ORIGIN}/billing`,
  // Map org_id for webhook lookup — use metadata, not client_reference_id
  // (client_reference_id is limited to 200 chars and not on subscription events)
  metadata: { org_id: orgId },
  subscription_data: {
    metadata: { org_id: orgId }, // also set on subscription object for subscription events
  },
});

return c.json({ url: session.url });
```

Frontend redirect (no `stripe.redirectToCheckout` — deprecated Sept 2025):
```typescript
// Source: Stripe changelog 2025-09-30
const { url } = await fetchApi('/api/billing/create-checkout', { method: 'POST' });
window.location.href = url;
```

[CITED: https://docs.stripe.com/changelog/clover/2025-09-30/remove-redirect-to-checkout]
[CITED: https://blog.cloudflare.com/announcing-stripe-support-in-workers/]

### Pattern 4: Stripe Webhook Handler (Public Route)

**Critical: register webhook route BEFORE global `/api/*` middleware in `index.ts`.**

Hono executes middleware in registration order. The `/api/*` auth middleware is at line 21 of `index.ts`. The webhook route must be mounted BEFORE that line:

```typescript
// apps/worker/src/index.ts

// Mount webhook route FIRST (before auth middleware)
app.route('/api', webhookRoute);

// Then auth middleware (applies to all remaining /api/* routes)
app.use('/api/*', clerkAuth, requireOrg);

// Then authenticated routes
app.route('/api', healthRoute);
app.route('/api', uploadRoute);
app.route('/api', matchRoute);
app.route('/api', billingRoute);  // authenticated: /api/usage, /api/billing/create-checkout
```

Webhook handler in `apps/worker/src/routes/webhook.ts`:

```typescript
// Source: Hono stripe webhook example + Cloudflare Workers Stripe blog
import Stripe from 'stripe';
import { Hono } from 'hono';
import type { Env } from '../types';

const webhookRoute = new Hono<{ Bindings: Env }>();

const webCrypto = Stripe.createSubtleCryptoProvider();

webhookRoute.post('/stripe/webhook', async (c) => {
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = c.req.header('stripe-signature');
  if (!signature) return c.text('Missing signature', 400);

  // Read raw body ONCE — do not call c.req.text() a second time (body already used error)
  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      webCrypto,  // required for Workers async crypto
    );
  } catch (err) {
    console.error('[webhook] signature verification failed:', err);
    return c.text('Invalid signature', 400);
  }

  // Handle events
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orgId = session.metadata?.org_id;
    // ... update subscriptions table
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const orgId = sub.metadata?.org_id;
    // ... revert to free
  }

  return c.text('', 200);
});

export default webhookRoute;
```

[CITED: https://hono.dev/examples/stripe-webhook]
[CITED: https://blog.cloudflare.com/announcing-stripe-support-in-workers/]
[VERIFIED: Hono routing docs — middleware applied in registration order]

### Pattern 5: useUsage Hook

```typescript
// apps/web/src/hooks/useUsage.ts
// Wraps GET /api/usage; follows useFetch ref pattern from Phase 3
import { useState, useEffect, useCallback } from 'react';
import { useFetch } from './useFetch';

interface UsageData {
  count: number;
  limit: number;
  plan: 'free' | 'paid';
}

export function useUsage() {
  const fetchApi = useFetch();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchApi('/api/usage');
      if (res.ok) {
        const data = await res.json() as UsageData;
        setUsage(data);
      } else {
        setError('Could not load usage');
      }
    } catch {
      setError('Could not load usage');
    } finally {
      setLoading(false);
    }
  }, [fetchApi]);

  useEffect(() => { refresh(); }, [refresh]);

  return { usage, loading, error, refresh };
}
```

`refresh` is called from MatchPage after a successful match run to update the counter (D-09).

### Anti-Patterns to Avoid

- **Calling `c.req.text()` twice in webhook handler:** Body stream is consumed on first read. Store result in a variable and reuse.
- **Using `stripe.redirectToCheckout()`:** Deprecated September 2025. Use `window.location.href = session.url`.
- **Using `constructEvent` (synchronous) in Workers:** Workers use async WebCrypto; `constructEvent` will fail. Always use `constructEventAsync`.
- **Mounting webhook route after auth middleware:** The webhook will receive 401 from Clerk middleware before the handler runs. Register webhook route before `app.use('/api/*', clerkAuth, requireOrg)`.
- **Relying on `client_reference_id` for subscription event lookup:** `client_reference_id` is only on `checkout.session.completed`, not on `customer.subscription.deleted`. Use `metadata.org_id` set on both the Checkout Session and `subscription_data.metadata`.
- **Running usage check AFTER `matchTransfers()`:** The 429 must be returned before the algorithm executes (D-05 security requirement).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC comparison | `stripe.webhooks.constructEventAsync()` | Timing-safe comparison, signature format parsing, timestamp tolerance — all handled by SDK |
| Stripe API client with retries | `fetch()` calls to Stripe API | `stripe` npm package with `createFetchHttpClient()` | Idempotency keys, retry logic, rate limit handling built-in |
| Subscription state machine | Custom event-to-state logic | Handle exactly `checkout.session.completed` + `customer.subscription.deleted` only | Stripe's subscription lifecycle has many events; listening to only two minimises surface area per D-14 |
| Usage metering race protection | Application-level locks | Postgres `UPDATE ... WHERE count < limit RETURNING count` | Database-level atomicity; no distributed lock needed |

**Key insight:** The Stripe SDK is specifically designed to work in Workers (since v11.10, no `node_compat` required). The SDK's `createFetchHttpClient()` replaces Node's `http` module with the Fetch API, which is always available in Workers. Using the SDK directly eliminates every sharp edge in raw Stripe API integration.

---

## Common Pitfalls

### Pitfall 1: Body Already Used Error in Webhook Handler
**What goes wrong:** `TypeError: Body has already been used. It can only be used once.`
**Why it happens:** Calling `c.req.text()` or `c.req.json()` twice in the same handler — once by middleware, once by the webhook handler — consumes the ReadableStream.
**How to avoid:** Read the body once with `const body = await c.req.text()` at the start of the webhook handler. Pass `body` to `constructEventAsync`. Ensure no upstream middleware reads the body.
**Warning signs:** Error only appears in production or wrangler dev, not in unit tests (because unit test mocks bypass real body streams).

### Pitfall 2: Webhook Route Behind Auth Middleware
**What goes wrong:** Stripe webhooks receive 401 Unauthorized before reaching the handler.
**Why it happens:** Stripe's webhook requests have no Clerk JWT header. If the webhook route is mounted after `app.use('/api/*', clerkAuth, requireOrg)`, the middleware blocks the request.
**How to avoid:** In `index.ts`, mount `webhookRoute` before the `app.use('/api/*', ...)` line. Hono middleware runs in registration order.
**Warning signs:** Stripe webhook dashboard shows consistent 401 failures. Test with `stripe listen --forward-to localhost:8787/api/stripe/webhook`.

### Pitfall 3: org_id Not Available on subscription.deleted Event
**What goes wrong:** Webhook handler for `customer.subscription.deleted` cannot find which org to revert because `client_reference_id` is only present on `checkout.session.completed`.
**Why it happens:** `client_reference_id` is on the Checkout Session object, not propagated to the Subscription object.
**How to avoid:** Set `metadata: { org_id: orgId }` on both the top-level Checkout Session AND `subscription_data.metadata` when creating the session. The `subscription_data.metadata` is copied onto the Subscription object in Stripe.
**Warning signs:** `sub.metadata?.org_id` is undefined in `customer.subscription.deleted` handler.

### Pitfall 4: Usage Meter Row Missing on First Match Run
**What goes wrong:** The D-01 UPDATE returns 0 rows not because the limit is exceeded, but because the row doesn't exist yet — producing a spurious 429 on the first ever match run.
**Why it happens:** `UPDATE` on a non-existent row updates 0 rows; the handler treats 0 updated rows as "limit exceeded".
**How to avoid:** Run `INSERT INTO usage_meters ... ON CONFLICT DO NOTHING` first to ensure the row exists, then run the conditional UPDATE. See Architecture Pattern 1 for the exact SQL sequence.
**Warning signs:** First-ever match run for a new org returns 429.

### Pitfall 5: Stripe Price ID Not Configured
**What goes wrong:** Checkout Session creation fails at runtime — `No such price: price_xxx`.
**Why it happens:** The Stripe Price ID (from Stripe Dashboard) is not set or is a test-mode ID used in production.
**How to avoid:** Store the Stripe Price ID as an env var (`STRIPE_PRICE_ID`) in the Worker secrets, separate from `STRIPE_SECRET_KEY`. Test-mode and live-mode Price IDs are different. Verify in Stripe Dashboard before deploying.
**Warning signs:** 400 error from Stripe API on `POST /api/billing/create-checkout`.

### Pitfall 6: NEON withOrgContext Synchronous Callback
**What goes wrong:** `async` usage inside the NEON transaction callback fails silently or throws.
**Why it happens:** NEON HTTP transactions require a synchronous callback — the callback must return an array of `tx`-tagged template literal queries, not Promises.
**How to avoid:** Never use `async` inside the `withOrgContext` callback or `sql.transaction()` callback. Build the query array synchronously. This is the established Phase 1 learnt decision.
**Warning signs:** Transaction silently returns empty results or throws "callback must be synchronous".

---

## Code Examples

### Upsert + Conditional Increment (Atomic Usage Check)

```typescript
// Source: NEON serverless docs + PostgreSQL upsert docs
// Runs inside match route, before matchTransfers() call

const yearMonth = new Date().toISOString().slice(0, 7); // e.g. '2026-04'
const sql = neon(dbUrl);
const claims = JSON.stringify({ org_id: orgId });

// Step 1: fetch plan (to know if usage check applies)
const [planResult] = await sql.transaction((tx) => [
  tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
  tx`SELECT status FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`,
]);
const planStatus = (planResult[1] as Array<{ status: string }>)[0]?.status ?? 'free';

if (planStatus !== 'paid') {
  const limit = 1;
  // Step 2: upsert + conditional increment in one transaction
  const results = await sql.transaction((tx) => [
    tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
    tx`INSERT INTO usage_meters (org_id, year_month, count)
       VALUES (${orgId}, ${yearMonth}, 0)
       ON CONFLICT (org_id, year_month) DO NOTHING`,
    tx`UPDATE usage_meters
       SET count = count + 1
       WHERE org_id = ${orgId}
         AND year_month = ${yearMonth}
         AND count < ${limit}
       RETURNING count`,
  ]);
  const updateRows = results[2] as Array<{ count: number }>;
  if (updateRows.length === 0) {
    return c.json({ error: 'Monthly match run limit reached. Upgrade to continue.' }, 429);
  }
}

// Proceed to matchTransfers()...
```

### Stripe SDK Initialisation in Worker

```typescript
// Source: Cloudflare Workers + Stripe blog (blog.cloudflare.com/announcing-stripe-support-in-workers/)
import Stripe from 'stripe';

// Create once per request (no global state in Workers)
const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
  // apiVersion defaults to latest — pin when going to production
});
```

### Webhook Signature Verification

```typescript
// Source: Hono stripe-webhook example (hono.dev/examples/stripe-webhook)
const webCrypto = Stripe.createSubtleCryptoProvider();

const body = await c.req.text();
const sig = c.req.header('stripe-signature') ?? '';

let event: Stripe.Event;
try {
  event = await stripe.webhooks.constructEventAsync(
    body, sig, c.env.STRIPE_WEBHOOK_SECRET, undefined, webCrypto
  );
} catch (err) {
  return c.text('Webhook signature verification failed', 400);
}
```

### Modal Overlay (React)

```tsx
// Upgrade modal — shown when POST /match returns 429
// Positioned fixed, covers main content area only (not sidebar)
{showUpgradeModal && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center"
    style={{ background: 'rgba(15, 23, 42, 0.5)' }}
    onClick={() => setShowUpgradeModal(false)}
  >
    <div
      className="bg-white rounded-xl p-8 max-w-sm w-full mx-4 shadow-xl"
      onClick={e => e.stopPropagation()}
      role="dialog"
      aria-labelledby="upgrade-modal-title"
    >
      <h2 id="upgrade-modal-title"
        className="text-lg font-semibold text-[#0F172A] mb-2"
        style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
      >
        You've used your free run for this month
      </h2>
      <p className="text-[13px] text-[#475569] mb-6">
        Upgrade to PharmIQ Pro for unlimited match runs.
      </p>
      <button
        onClick={handleUpgrade}
        className="w-full bg-[#D97706] text-white font-semibold rounded-md px-4 py-3 hover:bg-[#B45309] transition-colors"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        Upgrade Now
      </button>
    </div>
  </div>
)}
```

### Disabled Run Match Button (Lock State)

```tsx
// When usage.count >= usage.limit and plan === 'free'
const isAtLimit = usage?.plan === 'free' && usage.count >= usage.limit;

<button
  type="button"
  onClick={isAtLimit ? () => setShowUpgradeModal(true) : handleRunMatch}
  disabled={loading}
  className={`text-[13px] font-semibold rounded-md px-4 min-h-[44px] flex items-center gap-2 transition-colors
    ${isAtLimit
      ? 'bg-[#D97706] text-white hover:bg-[#B45309]'  // amber paywall state
      : 'bg-[#0F766E] text-white hover:bg-[#0D5D5A]'  // teal active state
    }`}
>
  {isAtLimit ? (
    <>
      <Lock size={16} aria-hidden="true" />
      <span>Upgrade to run again</span>
    </>
  ) : loading ? (
    <><Loader2 className="animate-spin" size={16} aria-hidden="true" /><span>Running...</span></>
  ) : (
    <span>Run Match</span>
  )}
</button>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `stripe.redirectToCheckout({ sessionId })` | `window.location.href = session.url` | September 2025 | Do NOT use `redirectToCheckout`; no `@stripe/stripe-js` needed in the web app |
| `stripe.webhooks.constructEvent` (sync) | `stripe.webhooks.constructEventAsync` (async) | stripe-node v11+ | Workers don't have sync crypto; must use async variant |
| `node_compat: true` in wrangler.toml | No flag needed (stripe-node v11.10+) | stripe-node v11.10 (2023) | `wrangler.jsonc` already has `nodejs_compat_v2` which is sufficient |
| Separate `stripe-node-cloudflare-worker-template` | Official `stripe` npm package directly | 2024 | Use `npm install stripe` directly in Worker project |

**Deprecated/outdated:**
- `stripe.redirectToCheckout()`: Removed from Stripe.js as of September 2025. Any tutorial using this is outdated.
- `constructEvent` (sync): Still exists but will fail in Workers WebCrypto context. Always use `constructEventAsync`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `usage_meters` table has columns `(id, org_id, year_month, count)` with no `limit` column — limit is derived from `subscriptions.status` at runtime | Architecture Pattern 2, Code Examples | If a `limit` column exists on `usage_meters`, the approach simplifies — single table query for both count and limit. Verify against actual NEON schema before implementing. |
| A2 | `subscriptions` table has an org row on first use — or the code handles the case where no row exists (defaulting to `free`) | Architecture Pattern 2 | If no row exists for an org (new org, no checkout yet), `subRow` is undefined; code defaults to `free` plan and limit=1, which is correct behaviour |
| A3 | The Stripe Price ID for the paid plan is configured in Stripe Dashboard and available as an env var before execution | Pitfall 5 | Plan execution should include a Wave 0 task to verify price ID exists in Stripe Dashboard (test mode) and document the env var name |
| A4 | `nodejs_compat_v2` flag in `wrangler.jsonc` is sufficient for stripe-node v22 — no additional compat flags needed | Standard Stack | If stripe v22 requires specific Node.js APIs beyond what `nodejs_compat_v2` provides, a compatibility flag upgrade may be needed. Low risk — stripe-node has been Workers-compatible since v11.10. |

---

## Open Questions

1. **Does `usage_meters` already have a `limit` column from Phase 1 execution?**
   - What we know: Phase 1 CONTEXT.md D-03 schema lists `(id, org_id, year_month, count)` — no `limit` column shown
   - What's unclear: Whether the Phase 1 executor added a `limit` column during implementation
   - Recommendation: Wave 0 task — query NEON: `SELECT column_name FROM information_schema.columns WHERE table_name = 'usage_meters'`. If `limit` column exists, use it directly in the UPDATE WHERE clause. If not, derive from `subscriptions.status`.

2. **Does `subscriptions` table have a UNIQUE constraint on `org_id`?**
   - What we know: Phase 1 D-03 defines the table but doesn't list specific constraints beyond FK
   - What's unclear: Whether `org_id` is UNIQUE (needed for the webhook upsert update)
   - Recommendation: Wave 0 task — check schema: `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'subscriptions'`. Webhook handler uses `UPDATE subscriptions SET status = 'paid' WHERE org_id = $orgId` — if no unique constraint, multiple rows could exist.

3. **Stripe Price ID availability**
   - What we know: No Stripe product or price exists yet (Stripe not yet integrated)
   - What's unclear: Whether the price ID should be stored as an env var (`STRIPE_PRICE_ID`) or looked up dynamically
   - Recommendation: Store as Worker secret (`STRIPE_PRICE_ID`) for v1. Wave 0 task to create the product + price in Stripe Dashboard (test mode) and record the price ID.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `stripe` npm package | Worker billing + webhook routes | No — not yet installed | — | Install: `cd apps/worker && npm install stripe` |
| Wrangler CLI | Deploying worker secrets | Yes | 4.63.0 (in devDependencies) | — |
| Stripe Dashboard (test mode account) | Price ID, webhook endpoint registration | Unknown | — | Must be created manually before Wave 1 |
| NEON Postgres (`usage_meters`, `subscriptions` tables) | Usage metering + plan tracking | Yes (Phase 1 created schema) | — | — |
| `STRIPE_SECRET_KEY` env var | Worker billing route | Not yet set | — | `wrangler secret put STRIPE_SECRET_KEY` |
| `STRIPE_WEBHOOK_SECRET` env var | Worker webhook route | Not yet set | — | `wrangler secret put STRIPE_WEBHOOK_SECRET` |
| `STRIPE_PRICE_ID` env var | Checkout Session creation | Not yet set | — | `wrangler secret put STRIPE_PRICE_ID` |
| `VITE_STRIPE_PUBLISHABLE_KEY` env var | Web app (not used in code, but may be needed for future) | Not yet set | — | Not needed for v1 — no frontend Stripe SDK used |

**Missing dependencies with no fallback:**
- Stripe Dashboard account (test mode) with a product + recurring price configured — must be created manually before any checkout flow can be tested.

**Missing dependencies with fallback:**
- `stripe` npm package — install in Wave 0.
- Worker secrets — add via `wrangler secret put` in Wave 0.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 with `@cloudflare/vitest-pool-workers` 0.13.5 |
| Config file | `apps/worker/vitest.config.ts` |
| Quick run command | `cd apps/worker && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/worker && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILLING-01 | 429 returned when org at limit before matchTransfers() | unit | `npx vitest run --reporter=verbose billing.test.ts` | No — Wave 0 |
| BILLING-01 | 200 returned when org under limit (counter increments) | unit | `npx vitest run --reporter=verbose billing.test.ts` | No — Wave 0 |
| BILLING-01 | First match run (no row) creates row and succeeds | unit | `npx vitest run --reporter=verbose billing.test.ts` | No — Wave 0 |
| BILLING-02 | GET /api/usage returns { count, limit, plan } | unit | `npx vitest run --reporter=verbose billing.test.ts` | No — Wave 0 |
| BILLING-03 | 429 from POST /match causes modal to display | manual | — | No — Wave 0 (UI only) |
| BILLING-04 | POST /api/billing/create-checkout returns { url } | unit | `npx vitest run --reporter=verbose billing.test.ts` | No — Wave 0 |
| BILLING-04 | Webhook: checkout.session.completed → plan=paid | unit | `npx vitest run --reporter=verbose webhook.test.ts` | No — Wave 0 |
| BILLING-04 | Webhook: customer.subscription.deleted → plan=free | unit | `npx vitest run --reporter=verbose webhook.test.ts` | No — Wave 0 |
| BILLING-04 | Webhook: invalid signature → 400 | unit | `npx vitest run --reporter=verbose webhook.test.ts` | No — Wave 0 |

### Existing Test Patterns (Reference)

The established pattern from `match.test.ts` mocks `withOrgContext` via `vi.mock('../db/client')`. The billing and webhook tests follow the same pattern. The webhook test will also mock `stripe.webhooks.constructEventAsync`.

```typescript
// billing.test.ts — pattern from match.test.ts
vi.mock('../db/client', () => ({ withOrgContext: vi.fn() }));
vi.mock('@hono/clerk-auth', () => ({
  clerkMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
  getAuth: () => ({ userId: 'user_test', orgId: 'org_test' }),
}));
vi.mock('stripe', () => ({
  default: vi.fn().mockReturnValue({
    checkout: { sessions: { create: vi.fn() } },
    webhooks: { constructEventAsync: vi.fn() },
  }),
}));
```

### Sampling Rate

- **Per task commit:** `cd apps/worker && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd apps/worker && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/worker/src/__tests__/billing.test.ts` — covers BILLING-01 (usage check), BILLING-02 (GET /api/usage), BILLING-04 (create-checkout)
- [ ] `apps/worker/src/__tests__/webhook.test.ts` — covers BILLING-04 (webhook event handling + signature verification)
- [ ] Stripe npm install: `cd apps/worker && npm install stripe`
- [ ] Stripe Dashboard manual setup: create product + recurring price (test mode), record price ID

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Clerk JWT on all `/api/*` routes (existing); webhook route explicitly excluded |
| V3 Session Management | no | Stateless Workers; no server-side sessions |
| V4 Access Control | yes | `withOrgContext` scopes all DB queries to org_id; paid status checked server-side before every match run |
| V5 Input Validation | yes | Validate `monthsCoverTarget` (existing); validate webhook `event.type` before acting |
| V6 Cryptography | yes | `stripe.webhooks.constructEventAsync` — do not hand-roll HMAC; uses WebCrypto via `createSubtleCryptoProvider()` |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook events (missing/invalid `Stripe-Signature`) | Spoofing | `constructEventAsync` with webhook signing secret — reject any event that fails verification |
| Replay attacks on webhook (old event replayed) | Spoofing | Stripe's `constructEventAsync` includes a 300-second timestamp tolerance by default — accept |
| Bypass usage limit by sending crafted POST /match | Tampering | Limit enforced in Worker DB query; client has no way to bypass server-side SQL |
| org_id injection via request body (use fraudulent org) | Elevation of privilege | `orgId` always sourced from Clerk JWT via `c.get('orgId')` — never from request body |
| Stripe race: concurrent match runs exceed limit | Tampering | Postgres `UPDATE ... WHERE count < limit RETURNING count` is atomic at DB level — concurrent requests cannot both succeed past the limit |

---

## Sources

### Primary (HIGH confidence)
- NEON serverless driver docs (https://neon.com/docs/serverless/serverless-driver) — `sql.transaction()` multi-query pattern
- Cloudflare Workers + Stripe announcement (https://blog.cloudflare.com/announcing-stripe-support-in-workers/) — `createFetchHttpClient`, `createSubtleCryptoProvider`, `constructEventAsync` pattern
- Hono Stripe webhook example (https://hono.dev/examples/stripe-webhook) — webhook handler pattern with `c.req.text()` raw body
- Stripe changelog (https://docs.stripe.com/changelog/clover/2025-09-30/remove-redirect-to-checkout) — `redirectToCheckout` deprecated September 2025
- Stripe Checkout Sessions API (https://docs.stripe.com/api/checkout/sessions/create) — session creation parameters

### Secondary (MEDIUM confidence)
- Multiple web sources confirm: `constructEventAsync` required for Workers (not `constructEvent`)
- Multiple web sources confirm: `npm view stripe version` returns 22.0.0 as of 2026-04-05
- Hono routing documentation confirms: middleware applies in registration order (webhook before auth = public)

### Tertiary (LOW confidence)
- stripe-node v11.10 `node_compat` no longer required — referenced by jross.me blog (2023); confirmed by Cloudflare announcement but no specific changelog line verified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry verified, existing codebase confirmed
- Architecture patterns: HIGH — verified against existing code in `match.ts`, `db/client.ts`, `index.ts`; Stripe patterns verified via official docs and Cloudflare blog
- Pitfalls: HIGH — pitfalls 1-4 directly verified against known Worker/NEON constraints and Stripe SDK behaviour documented in official sources
- Webhook event map: HIGH — directly from Stripe API reference
- `redirectToCheckout` deprecation: HIGH — Stripe changelog September 2025

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable APIs; Stripe SDK major version unlikely to change in 30 days)
