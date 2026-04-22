import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock @neondatabase/serverless — webhook handler calls neon() to get sql, which is used as:
//   1. sql`...` (template tag) — for idempotency dedupe INSERT and direct SQL calls
//   2. sql.transaction(callback) — for checkout.session.completed upsert
// mockSql must be callable as a template tag AND expose .transaction.
const { mockSql, mockTransaction } = vi.hoisted(() => {
  const mockSql = vi.fn().mockResolvedValue([]);
  const mockTransaction = vi.fn();
  mockSql.transaction = mockTransaction;
  return { mockSql, mockTransaction };
});
vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => mockSql),
}));

// Mock stripe — constructEventAsync and static helpers
const { mockConstructEventAsync } = vi.hoisted(() => ({
  mockConstructEventAsync: vi.fn(),
}));
vi.mock("stripe", () => {
  function MockStripe() {
    return {
      webhooks: { constructEventAsync: mockConstructEventAsync },
    };
  }
  MockStripe.createFetchHttpClient = () => ({});
  MockStripe.createSubtleCryptoProvider = () => ({});
  return { default: MockStripe };
});

import webhookRoute from "../routes/webhook";
import type { Env, Variables } from "../types";

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

// Build app with ONLY the webhook route (no auth middleware) —
// mirrors real index.ts where webhookRoute is mounted BEFORE app.use('/api/*', clerkAuth, requireOrg)
function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.route("/api", webhookRoute);
  return app;
}

// Helper: mock the dedupe INSERT as a first-time event (returns 1 row → proceed)
function mockDedupeFirstTime() {
  mockSql.mockResolvedValueOnce([{ id: "evt-uuid-123" }]);
}

// Helper: mock the dedupe INSERT as a duplicate event (returns 0 rows → early return)
function mockDedupeDuplicate() {
  mockSql.mockResolvedValueOnce([]);
}

// --- Stripe Webhook handler tests ---

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 with 'Missing signature' when stripe-signature header is absent", async () => {
    const app = buildApp();

    const res = await app.request(
      "/api/stripe/webhook",
      { method: "POST", body: "{}" },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Missing signature");
    expect(mockConstructEventAsync).not.toHaveBeenCalled();
  });

  it("returns 400 when stripe-signature is present but invalid", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockRejectedValueOnce(
      new Error("No signatures found matching the expected signature for payload"),
    );

    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=invalid,v1=bad" },
        body: "{}",
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Invalid signature");
  });

  it("returns 200 and updates subscriptions with plan_tier on checkout.session.completed", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_checkout_001",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { org_id: "org_abc", plan_tier: "pro" },
          customer: "cus_123",
          subscription: "sub_456",
        },
      },
    });

    // First mockSql call: dedupe INSERT → first-time event (1 row returned)
    mockDedupeFirstTime();
    // sql.transaction call for the subscriptions upsert
    mockTransaction.mockResolvedValueOnce([[], []]);

    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        body: JSON.stringify({ type: "checkout.session.completed" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();

    // Verify the transaction upsert SQL contains both 'paid' and 'plan_tier'
    const txCallback = mockTransaction.mock.calls[0][0];
    const mockTx = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) =>
      ({ sql: String.raw({ raw: strings }, ...values) }),
    );
    const queries = txCallback(mockTx);
    expect(queries).toHaveLength(2);
    const upsertQuery = queries[1] as { sql: string };
    expect(upsertQuery.sql).toContain("paid");
    expect(upsertQuery.sql).toContain("plan_tier");
  });

  it("returns 200 and resets status and plan_tier to free on customer.subscription.deleted", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_deleted_001",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_789",
          metadata: { org_id: "org_abc" },
          customer: "cus_123",
        },
      },
    });

    // First call: dedupe INSERT → first-time
    mockDedupeFirstTime();
    // Subsequent calls: default mockResolvedValue([]) handles the UPDATE

    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        body: JSON.stringify({ type: "customer.subscription.deleted" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockSql).toHaveBeenCalled();

    // Find the UPDATE call — must set both status and plan_tier to 'free'
    const allCalls = mockSql.mock.calls as Array<[TemplateStringsArray, ...unknown[]]>;
    const updateCall = allCalls.find(([strings]) =>
      strings.join("").includes("status") && strings.join("").includes("free"),
    );
    expect(updateCall).toBeDefined();
    const updateSql = updateCall![0].join("");
    expect(updateSql).toContain("status");
    expect(updateSql).toContain("plan_tier");
    expect(updateSql).toContain("free");
  });

  it("returns 200 and does NOT call transaction for unhandled event types", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_invoice_001",
      type: "invoice.paid",
      data: { object: {} },
    });

    // Dedupe: first-time
    mockDedupeFirstTime();

    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        body: JSON.stringify({ type: "invoice.paid" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("does NOT require Authorization header — webhook is a public route", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_invoice_002",
      type: "invoice.paid",
      data: { object: {} },
    });

    mockDedupeFirstTime();

    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        body: "{}",
      },
      TEST_ENV,
    );

    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });

  // --- Idempotency tests (BILLING-10) ---

  it("returns 200 immediately without DB changes for a duplicate event (idempotency)", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_dup_001",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { org_id: "org_abc", plan_tier: "pro" },
          customer: "cus_123",
          subscription: "sub_456",
        },
      },
    });

    // Dedupe INSERT returns 0 rows → already processed
    mockDedupeDuplicate();

    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        body: JSON.stringify({ type: "checkout.session.completed" }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // transaction must NOT be called — handler returned early after dedupe check
    expect(mockTransaction).not.toHaveBeenCalled();
    // sql was called exactly once (the dedupe INSERT only)
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("processes event on first delivery, skips on second (duplicate event fired twice)", async () => {
    const app = buildApp();

    // --- First delivery ---
    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_idempotent_001",
      type: "invoice.paid",
      data: { object: {} },
    });
    mockDedupeFirstTime(); // returns 1 row → event not yet seen

    const res1 = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=sig" },
        body: "{}",
      },
      TEST_ENV,
    );
    expect(res1.status).toBe(200);
    const sqlCallsAfterFirst = mockSql.mock.calls.length;

    // --- Second delivery (same event ID) ---
    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_idempotent_001", // same event ID
      type: "invoice.paid",
      data: { object: {} },
    });
    mockDedupeDuplicate(); // returns 0 rows → duplicate, early return

    const res2 = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=2,v1=sig" },
        body: "{}",
      },
      TEST_ENV,
    );
    expect(res2.status).toBe(200);
    // Second delivery should only add exactly 1 more sql call (the dedupe INSERT)
    const sqlCallsAfterSecond = mockSql.mock.calls.length;
    expect(sqlCallsAfterSecond - sqlCallsAfterFirst).toBe(1);
    // No transaction calls on either delivery (invoice.paid is unhandled)
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("dedupe INSERT uses direct sql tag (no set_config) — non-RLS connection path", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_dedupe_direct_001",
      type: "invoice.paid",
      data: { object: {} },
    });

    mockDedupeFirstTime();

    await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        body: "{}",
      },
      TEST_ENV,
    );

    // Verify the first sql call is the dedupe INSERT (no set_config)
    const firstCall = mockSql.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const firstSql = firstCall[0].join("");
    expect(firstSql).toContain("processed_webhook_events");
    expect(firstSql).toContain("stripe_event_id");
    // Must NOT contain set_config (that would indicate an RLS context call)
    expect(firstSql).not.toContain("set_config");
  });

  // --- customer.subscription.updated tests (BILLING-10) ---

  it("writes plan_tier='enterprise' on customer.subscription.updated with enterprise price ID", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_sub_updated_ent",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_ent_001",
          metadata: { org_id: "org_abc" },
          items: {
            data: [{ price: { id: "price_ent_test" } }],
          },
        },
      },
    });

    // Dedupe: first-time
    mockDedupeFirstTime();
    // UPDATE subscriptions: default mockResolvedValue([]) handles it

    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        body: "{}",
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(mockTransaction).not.toHaveBeenCalled();

    // Find the UPDATE call and verify plan_tier='enterprise'
    const allCalls = mockSql.mock.calls as Array<[TemplateStringsArray, ...unknown[]]>;
    const updateCall = allCalls.find(([strings]) =>
      strings.join("").includes("plan_tier"),
    );
    expect(updateCall).toBeDefined();
    // The value 'enterprise' is passed as a parameter — check mockSql was called with it
    const updateValues = updateCall!.slice(1);
    expect(updateValues).toContain("enterprise");
  });

  it("writes plan_tier='pro' on customer.subscription.updated with pro price ID", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_sub_updated_pro",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_pro_001",
          metadata: { org_id: "org_abc" },
          items: {
            data: [{ price: { id: "price_pro_test" } }],
          },
        },
      },
    });

    mockDedupeFirstTime();

    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        body: "{}",
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const allCalls = mockSql.mock.calls as Array<[TemplateStringsArray, ...unknown[]]>;
    const updateCall = allCalls.find(([strings]) =>
      strings.join("").includes("plan_tier"),
    );
    expect(updateCall).toBeDefined();
    const updateValues = updateCall!.slice(1);
    expect(updateValues).toContain("pro");
  });

  it("falls back to DB lookup when subscription.updated has no org_id in metadata", async () => {
    const app = buildApp();

    mockConstructEventAsync.mockResolvedValueOnce({
      id: "evt_sub_updated_fallback",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_fallback_001",
          metadata: {}, // no org_id in metadata
          items: {
            data: [{ price: { id: "price_pro_test" } }],
          },
        },
      },
    });

    // Dedupe: first-time
    mockDedupeFirstTime();
    // Fallback DB lookup: SELECT org_id FROM subscriptions WHERE stripe_subscription_id = ...
    mockSql.mockResolvedValueOnce([{ org_id: "org_fallback" }]);
    // UPDATE subscriptions
    // default mockResolvedValue([]) handles it

    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        body: "{}",
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    // sql called: dedupe + lookup + update = 3 times
    expect(mockSql).toHaveBeenCalledTimes(3);
  });
});
