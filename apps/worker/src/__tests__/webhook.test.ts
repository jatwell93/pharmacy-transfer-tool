import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock @neondatabase/serverless — webhook handler calls neon() directly for sql.transaction
const mockTransaction = vi.fn();
vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => ({ transaction: mockTransaction })),
}));

// Mock stripe — constructEventAsync and static helpers
// Use vi.hoisted so mockConstructEventAsync is available inside vi.mock factory (Workers pool)
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
};

// Build app with ONLY the webhook route (no auth middleware) —
// mirrors real index.ts where webhookRoute is mounted BEFORE app.use('/api/*', clerkAuth, requireOrg)
function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.route("/api", webhookRoute);
  return app;
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
      {
        method: "POST",
        body: "{}",
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Missing signature");
    // constructEventAsync must NOT be called if signature is absent
    expect(mockConstructEventAsync).not.toHaveBeenCalled();
  });

  it("returns 400 when stripe-signature is present but invalid", async () => {
    const app = buildApp();

    // Simulate constructEventAsync throwing on invalid signature
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

  it("returns 200 and updates subscriptions to paid on checkout.session.completed", async () => {
    const app = buildApp();

    // Mock verified event: checkout.session.completed
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { org_id: "org_abc" },
          customer: "cus_123",
          subscription: "sub_456",
        },
      },
    });

    // Mock transaction: [set_config result, upsert result]
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
    // Transaction must have been called to update subscriptions
    expect(mockTransaction).toHaveBeenCalledOnce();
    // Verify the SQL callback contains status = 'paid' by checking the transaction was invoked
    const txCallback = mockTransaction.mock.calls[0][0];
    // The callback is a function that receives a tx template tag — invoke it with a mock tx
    const mockTx = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) =>
      ({ sql: String.raw({ raw: strings }, ...values) }),
    );
    const queries = txCallback(mockTx);
    // Should produce 2 queries (set_config + upsert)
    expect(queries).toHaveLength(2);
    // Second query (upsert) should reference 'paid'
    const upsertQuery = queries[1] as { sql: string };
    expect(upsertQuery.sql).toContain("paid");
  });

  it("returns 200 and reverts subscriptions to free on customer.subscription.deleted", async () => {
    const app = buildApp();

    // Mock verified event: customer.subscription.deleted
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "customer.subscription.deleted",
      data: {
        object: {
          metadata: { org_id: "org_abc" },
        },
      },
    });

    // Mock transaction: [set_config result, update result]
    mockTransaction.mockResolvedValueOnce([[], []]);

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
    expect(mockTransaction).toHaveBeenCalledOnce();
    // Verify the SQL contains 'free'
    const txCallback = mockTransaction.mock.calls[0][0];
    const mockTx = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) =>
      ({ sql: String.raw({ raw: strings }, ...values) }),
    );
    const queries = txCallback(mockTx);
    expect(queries).toHaveLength(2);
    const updateQuery = queries[1] as { sql: string };
    expect(updateQuery.sql).toContain("free");
  });

  it("returns 200 and does NOT call transaction for unhandled event types", async () => {
    const app = buildApp();

    // Mock a verified but unhandled event type
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "invoice.paid",
      data: { object: {} },
    });

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
    // No DB change for unhandled events
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("does NOT require Authorization header — webhook is a public route", async () => {
    const app = buildApp();

    // Mock a valid event so handler proceeds normally
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "invoice.paid",
      data: { object: {} },
    });

    // POST with NO Authorization header (as Stripe sends it)
    const res = await app.request(
      "/api/stripe/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "t=12345,v1=valid_sig" },
        // Deliberately no Authorization header
        body: "{}",
      },
      TEST_ENV,
    );

    // Must not return 401 — the route has no auth middleware
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });
});
