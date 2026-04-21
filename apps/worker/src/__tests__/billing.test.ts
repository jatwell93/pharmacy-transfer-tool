import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock stripe — used by POST /api/billing/create-checkout, GET /billing/checkout-session/:sessionId,
// POST /billing/create-portal-session, and the Pro->Enterprise upgrade flow.
// Use vi.hoisted so all mock functions are available inside the vi.mock factory.
const {
  mockSessionsCreate,
  mockSessionsRetrieve,
  mockSubRetrieve,
  mockPortalCreate,
} = vi.hoisted(() => ({
  mockSessionsCreate: vi.fn().mockResolvedValue({
    url: "https://checkout.stripe.com/c/pay_test_abc123",
    customer: null,
  }),
  mockSessionsRetrieve: vi.fn(),
  mockSubRetrieve: vi.fn(),
  mockPortalCreate: vi.fn().mockResolvedValue({
    url: "https://billing.stripe.com/session/bps_test",
  }),
}));
vi.mock("stripe", () => {
  function MockStripe() {
    return {
      checkout: {
        sessions: {
          create: mockSessionsCreate,
          retrieve: mockSessionsRetrieve,
        },
      },
      subscriptions: {
        retrieve: mockSubRetrieve,
      },
      billingPortal: {
        sessions: {
          create: mockPortalCreate,
        },
      },
    };
  }
  // Add static methods used by billing.ts (Stripe.createFetchHttpClient, etc.)
  MockStripe.createFetchHttpClient = () => ({});
  MockStripe.createSubtleCryptoProvider = () => ({});
  return { default: MockStripe };
});

// Mock @hono/clerk-auth — passthrough middleware, returns valid auth state
vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: (_opts?: unknown) => {
    return async (_c: unknown, next: () => Promise<void>) => {
      await next();
    };
  },
  getAuth: () => ({
    userId: "user_test",
    orgId: "org_test",
  }),
}));

// Mock withOrgContext so tests do not require a live NEON connection
vi.mock("../db/client", () => ({
  withOrgContext: vi.fn(),
}));

// Mock neon from @neondatabase/serverless for the sql.transaction() calls
// in the match route usage check (uses neon directly, not withOrgContext)
const mockTransaction = vi.fn();
vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => ({ transaction: mockTransaction })),
}));

import { withOrgContext } from "../db/client";
import { clerkAuth, requireOrg } from "../middleware/auth";
import matchRoute from "../routes/match";
import billingRoute from "../routes/billing";
import type { Env, Variables } from "../types";

// Helper: build test app with auth middleware + matchRoute
function buildMatchApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("/api/*", clerkAuth, requireOrg);
  app.route("/api", matchRoute);
  return app;
}

// Helper: build test app with auth middleware + billingRoute
function buildBillingApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("/api/*", clerkAuth, requireOrg);
  app.route("/api", billingRoute);
  return app;
}

// Standard env bindings for test requests — includes all 3-tier price IDs
const TEST_ENV = {
  DATABASE_URL: "postgres://test",
  CLERK_SECRET_KEY: "sk_test",
  CLERK_PUBLISHABLE_KEY: "pk_test",
  ALLOWED_ORIGIN: "http://localhost:5173",
  STRIPE_SECRET_KEY: "sk_test_stripe",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_test",
  STRIPE_PRICE_ID_PRO: "price_pro_test",
  STRIPE_PRICE_ID_ENTERPRISE: "price_ent_test",
};

// --- POST /api/match usage metering tests ---

describe("POST /api/match — usage metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 for free-tier org under limit (first run of month)", async () => {
    const app = buildMatchApp();

    // sql.transaction call 1: plan check — no subscription row → defaults to free
    mockTransaction.mockResolvedValueOnce([
      [], // set_config result
      [], // subscriptions query — empty = no row → treat as free
    ]);
    // sql.transaction call 2: upsert + increment — returns 1 row → increment succeeded
    mockTransaction.mockResolvedValueOnce([
      [], // set_config result
      [], // INSERT ON CONFLICT DO NOTHING result
      [{ count: 1 }], // UPDATE RETURNING — 1 row = under limit, incremented OK
    ]);

    const mock = vi.mocked(withOrgContext);
    // Call order in match.ts: store count check (free, 3 stores limit), dead_stock, rou_data
    mock.mockResolvedValueOnce([{ cnt: 1 }]); // store count — 1 store <= 3 limit
    mock.mockResolvedValueOnce([]); // dead_stock
    mock.mockResolvedValueOnce([]); // rou_data

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 3 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // Usage transaction must have been called twice (plan check + upsert/increment)
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it("returns 429 for free-tier org at limit (count >= 1)", async () => {
    const app = buildMatchApp();

    // sql.transaction call 1: plan check — no subscription row → defaults to free
    mockTransaction.mockResolvedValueOnce([
      [],
      [], // empty → free
    ]);
    // sql.transaction call 2: upsert + increment — UPDATE returns 0 rows → limit exceeded
    mockTransaction.mockResolvedValueOnce([
      [],
      [], // INSERT ON CONFLICT DO NOTHING
      [], // UPDATE returns 0 rows — count already at limit
    ]);

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 3 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; upgrade_to: string };
    expect(body.error).toContain("Monthly match run limit reached");
    expect(body.upgrade_to).toBe("pro");
    // withOrgContext (data queries) must NOT be called — no matchTransfers execution
    expect(vi.mocked(withOrgContext)).not.toHaveBeenCalled();
  });

  it("returns 429 with upgrade_to='enterprise' for pro-tier org at limit (count >= 10)", async () => {
    const app = buildMatchApp();

    // sql.transaction call 1: plan check — pro tier
    mockTransaction.mockResolvedValueOnce([
      [],
      [{ plan_tier: "pro" }],
    ]);
    // sql.transaction call 2: upsert + increment — UPDATE returns 0 rows → limit exceeded
    mockTransaction.mockResolvedValueOnce([
      [],
      [],
      [], // UPDATE returns 0 rows — count at 10
    ]);

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 3 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; upgrade_to: string };
    expect(body.error).toContain("Monthly match run limit reached");
    expect(body.upgrade_to).toBe("enterprise");
    expect(vi.mocked(withOrgContext)).not.toHaveBeenCalled();
  });

  it("returns 403 with upgrade_to='pro' for free-tier org with >3 stores in rou_data", async () => {
    const app = buildMatchApp();

    // sql.transaction call 1: plan check — free tier (no row)
    mockTransaction.mockResolvedValueOnce([
      [],
      [],
    ]);
    // sql.transaction call 2: upsert + increment — succeeds
    mockTransaction.mockResolvedValueOnce([
      [],
      [],
      [{ count: 1 }],
    ]);

    const mock = vi.mocked(withOrgContext);
    // Store count check: free limit is 3, but org has 4 stores → gate fires
    mock.mockResolvedValueOnce([{ cnt: 4 }]);

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 3 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; upgrade_to: string };
    expect(body.error).toContain("stores");
    expect(body.upgrade_to).toBe("pro");
  });

  it("returns 403 with upgrade_to='enterprise' for pro-tier org with >10 stores in rou_data", async () => {
    const app = buildMatchApp();

    // sql.transaction call 1: plan check — pro tier
    mockTransaction.mockResolvedValueOnce([
      [],
      [{ plan_tier: "pro" }],
    ]);
    // sql.transaction call 2: upsert + increment — succeeds (pro limit is 10)
    mockTransaction.mockResolvedValueOnce([
      [],
      [],
      [{ count: 5 }],
    ]);

    const mock = vi.mocked(withOrgContext);
    // Store count check: pro limit is 10, but org has 11 stores → gate fires
    mock.mockResolvedValueOnce([{ cnt: 11 }]);

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 3 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; upgrade_to: string };
    expect(body.error).toContain("stores");
    expect(body.upgrade_to).toBe("enterprise");
  });

  it("returns 200 for enterprise org with no usage metering (bypasses all limits)", async () => {
    const app = buildMatchApp();

    // sql.transaction call 1 only: plan check returns enterprise
    mockTransaction.mockResolvedValueOnce([
      [],
      [{ plan_tier: "enterprise" }],
    ]);
    // Enterprise: NO second transaction call (no usage increment), NO store count check

    const mock = vi.mocked(withOrgContext);
    // Only dead_stock and rou_data — no store count call
    mock.mockResolvedValueOnce([]); // dead_stock
    mock.mockResolvedValueOnce([]); // rou_data

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 3 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // Only 1 transaction call (plan check), no usage increment or store count for enterprise
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // withOrgContext called only twice (dead_stock + rou_data), not for store count
    expect(vi.mocked(withOrgContext)).toHaveBeenCalledTimes(2);
  });

  it("maps legacy status='paid' to pro tier (backward compat)", async () => {
    const app = buildMatchApp();

    // sql.transaction call 1: plan check — returns 'paid' (legacy value, should map to 'pro')
    mockTransaction.mockResolvedValueOnce([
      [],
      [{ plan_tier: "paid" }],
    ]);
    // Pro tier → usage increment applies (pro limit = 10)
    mockTransaction.mockResolvedValueOnce([
      [],
      [],
      [{ count: 1 }], // under pro limit of 10
    ]);

    const mock = vi.mocked(withOrgContext);
    // Pro: store count check applies (limit 10)
    mock.mockResolvedValueOnce([{ cnt: 2 }]); // 2 stores <= 10 limit
    mock.mockResolvedValueOnce([]); // dead_stock
    mock.mockResolvedValueOnce([]); // rou_data

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 3 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // Two transactions: plan check + usage increment (pro tier has limit 10)
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it("reads plan_tier from subscriptions (not status column)", async () => {
    const app = buildMatchApp();

    // plan check returns plan_tier='free' — no status field present
    mockTransaction.mockResolvedValueOnce([
      [],
      [{ plan_tier: "free" }],
    ]);
    // Free tier usage increment — succeeds
    mockTransaction.mockResolvedValueOnce([
      [],
      [],
      [{ count: 1 }],
    ]);

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([{ cnt: 1 }]); // store count
    mock.mockResolvedValueOnce([]); // dead_stock
    mock.mockResolvedValueOnce([]); // rou_data

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 3 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // Verify plan check transaction called with SELECT plan_tier
    const planCheckCallback = mockTransaction.mock.calls[0][0];
    const mockTx = vi.fn((strings: TemplateStringsArray) => strings.join(""));
    const queries = planCheckCallback(mockTx);
    // The plan check should have 2 calls: set_config and SELECT plan_tier
    expect(queries).toHaveLength(2);
    const planQuery = queries[1] as string;
    expect(planQuery).toContain("plan_tier");
    expect(planQuery).not.toContain("status");
  });
});

// --- GET /api/usage tests ---

describe("GET /api/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { count: 1, limit: 1, plan_tier: 'free', store_count: 2 } for free-tier org", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    // Call 1: subscriptions query — free plan_tier
    mock.mockResolvedValueOnce([{ plan_tier: "free" }]);
    // Call 2: usage_meters query — count 1
    mock.mockResolvedValueOnce([{ count: 1 }]);
    // Call 3: store count from rou_data
    mock.mockResolvedValueOnce([{ cnt: 2 }]);

    const res = await app.request("/api/usage", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      limit: number;
      plan_tier: string;
      store_count: number;
    };
    expect(body.count).toBe(1);
    expect(body.limit).toBe(1);
    expect(body.plan_tier).toBe("free");
    expect(body.store_count).toBe(2);
  });

  it("returns { count: 5, limit: 10, plan_tier: 'pro', store_count: 3 } for pro-tier org", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([{ plan_tier: "pro" }]);
    mock.mockResolvedValueOnce([{ count: 5 }]);
    mock.mockResolvedValueOnce([{ cnt: 3 }]);

    const res = await app.request("/api/usage", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      limit: number;
      plan_tier: string;
      store_count: number;
    };
    expect(body.count).toBe(5);
    expect(body.limit).toBe(10);
    expect(body.plan_tier).toBe("pro");
    expect(body.store_count).toBe(3);
  });

  it("returns { count: 0, limit: -1, plan_tier: 'enterprise', store_count: 15 } for enterprise org", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([{ plan_tier: "enterprise" }]);
    mock.mockResolvedValueOnce([{ count: 0 }]);
    mock.mockResolvedValueOnce([{ cnt: 15 }]);

    const res = await app.request("/api/usage", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      limit: number;
      plan_tier: string;
      store_count: number;
    };
    expect(body.count).toBe(0);
    expect(body.limit).toBe(-1); // Infinity maps to -1
    expect(body.plan_tier).toBe("enterprise");
    expect(body.store_count).toBe(15);
  });

  it("defaults to plan_tier='free', limit=1 when no subscription row exists", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([]); // no subscription row
    mock.mockResolvedValueOnce([]); // no usage meter row
    mock.mockResolvedValueOnce([{ cnt: 0 }]); // no stores

    const res = await app.request("/api/usage", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      limit: number;
      plan_tier: string;
      store_count: number;
    };
    expect(body.count).toBe(0);
    expect(body.limit).toBe(1);
    expect(body.plan_tier).toBe("free");
    expect(body.store_count).toBe(0);
  });
});

// --- POST /api/billing/create-checkout tests ---

describe("POST /api/billing/create-checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default resolved value after clearAllMocks resets it
    mockSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay_test_abc123",
      customer: null,
    });
  });

  it("returns 200 with session URL for free org upgrading to pro", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    // Call 1: check existing subscription — no subscription
    mock.mockResolvedValueOnce([]);
    // Call 2: store stripe_customer_id (skipped when session.customer is null)

    const res = await app.request(
      "/api/billing/create-checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "pro" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://checkout.stripe.com/c/pay_test_abc123");
    // Verify correct price ID was used
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_pro_test", quantity: 1 }],
      }),
    );
  });

  it("returns 200 with session URL for free org upgrading to enterprise", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([]); // no existing subscription

    const res = await app.request(
      "/api/billing/create-checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "enterprise" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_ent_test", quantity: 1 }],
      }),
    );
  });

  it("BILLING-08: Pro->Enterprise upgrade uses existing customer and does not create duplicate subscription", async () => {
    const app = buildBillingApp();

    // Mock existing pro subscription
    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([
      {
        stripe_subscription_id: "sub_existing_pro",
        stripe_customer_id: "cus_existing",
      },
    ]);

    // Mock stripe.subscriptions.retrieve returning current subscription with item ID
    mockSubRetrieve.mockResolvedValueOnce({
      items: { data: [{ id: "si_item_123", price: { id: "price_pro_test" } }] },
    });

    // Mock session create for upgrade — returns customer
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/c/upgrade_session",
      customer: "cus_existing",
    });

    // Mock the stripe_customer_id store call
    mock.mockResolvedValueOnce([]); // upsert stripe_customer_id

    const res = await app.request(
      "/api/billing/create-checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "enterprise" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://checkout.stripe.com/c/upgrade_session");

    // Must have looked up existing subscription
    expect(mockSubRetrieve).toHaveBeenCalledWith("sub_existing_pro");

    // Must have created session with existing customer (not creating a new subscription from scratch)
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        line_items: [{ price: "price_ent_test", quantity: 1 }],
      }),
    );
  });

  it("stores stripe_customer_id in subscriptions before returning URL", async () => {
    const app = buildBillingApp();

    // Mock session returning a customer ID
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/c/pay_test_abc123",
      customer: "cus_newcustomer",
    });

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([]); // no existing subscription
    mock.mockResolvedValueOnce([]); // stripe_customer_id store call

    const res = await app.request(
      "/api/billing/create-checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "pro" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // withOrgContext called twice: subscription check + customer ID store
    expect(vi.mocked(withOrgContext)).toHaveBeenCalledTimes(2);
  });

  it("includes plan_tier in session metadata", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([]); // no existing subscription

    await app.request(
      "/api/billing/create-checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "enterprise" }),
      },
      TEST_ENV,
    );

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ plan_tier: "enterprise" }),
      }),
    );
  });

  it("passes correct success_url with session_id placeholder and cancel_url to Stripe", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([]); // no existing subscription

    await app.request(
      "/api/billing/create-checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "pro" }),
      },
      TEST_ENV,
    );

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: expect.stringContaining("/billing?checkout=success"),
        cancel_url: expect.stringContaining("/billing"),
      }),
    );
  });
});

// --- GET /api/billing/checkout-session/:sessionId tests (BILLING-09) ---

describe("GET /api/billing/checkout-session/:sessionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("BILLING-09: returns 200 with { plan_tier } and upserts subscriptions on paid session", async () => {
    const app = buildBillingApp();

    // Mock stripe.checkout.sessions.retrieve — payment confirmed, pro tier
    mockSessionsRetrieve.mockResolvedValueOnce({
      payment_status: "paid",
      metadata: { plan_tier: "pro", org_id: "org_test" },
      customer: "cus_123",
      subscription: "sub_456",
    });

    const mock = vi.mocked(withOrgContext);
    // UPSERT subscriptions
    mock.mockResolvedValueOnce([]);

    const res = await app.request(
      "/api/billing/checkout-session/cs_test_session123",
      { method: "GET" },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan_tier: string };
    expect(body.plan_tier).toBe("pro");
    // Must have called stripe.checkout.sessions.retrieve
    expect(mockSessionsRetrieve).toHaveBeenCalledWith("cs_test_session123");
    // Must have called withOrgContext to upsert plan_tier
    expect(vi.mocked(withOrgContext)).toHaveBeenCalledTimes(1);
  });

  it("returns 402 when payment_status is not 'paid'", async () => {
    const app = buildBillingApp();

    mockSessionsRetrieve.mockResolvedValueOnce({
      payment_status: "unpaid",
      metadata: { plan_tier: "pro", org_id: "org_test" },
      customer: null,
      subscription: null,
    });

    const res = await app.request(
      "/api/billing/checkout-session/cs_test_unpaid",
      { method: "GET" },
      TEST_ENV,
    );

    expect(res.status).toBe(402);
    // Must NOT call withOrgContext when payment not confirmed
    expect(vi.mocked(withOrgContext)).not.toHaveBeenCalled();
  });

  it("enterprise checkout session returns plan_tier='enterprise'", async () => {
    const app = buildBillingApp();

    mockSessionsRetrieve.mockResolvedValueOnce({
      payment_status: "paid",
      metadata: { plan_tier: "enterprise", org_id: "org_test" },
      customer: "cus_456",
      subscription: "sub_789",
    });

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([]);

    const res = await app.request(
      "/api/billing/checkout-session/cs_test_ent",
      { method: "GET" },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan_tier: string };
    expect(body.plan_tier).toBe("enterprise");
  });
});

// --- POST /api/billing/create-portal-session tests ---

describe("POST /api/billing/create-portal-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPortalCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session/bps_test",
    });
  });

  it("returns 200 with portal URL when stripe_customer_id exists", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([{ stripe_customer_id: "cus_existing" }]);

    const res = await app.request(
      "/api/billing/create-portal-session",
      { method: "POST" },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://billing.stripe.com/session/bps_test");
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
      }),
    );
  });

  it("returns 400 when no subscription row (no stripe_customer_id)", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([]); // no subscription row

    const res = await app.request(
      "/api/billing/create-portal-session",
      { method: "POST" },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when subscription row exists but stripe_customer_id is null", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockResolvedValueOnce([{ stripe_customer_id: null }]);

    const res = await app.request(
      "/api/billing/create-portal-session",
      { method: "POST" },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });
});
