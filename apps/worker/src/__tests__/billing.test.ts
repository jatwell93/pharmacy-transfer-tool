import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

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

// Standard env bindings for test requests
const TEST_ENV = {
  DATABASE_URL: "postgres://test",
  CLERK_SECRET_KEY: "sk_test",
  CLERK_PUBLISHABLE_KEY: "pk_test",
  ALLOWED_ORIGIN: "http://localhost:5173",
  STRIPE_SECRET_KEY: "sk_test_stripe",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_test",
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
    // After usage check succeeds, match route fetches dead_stock and rou_data
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

    // sql.transaction call 1: plan check — subscription row with status 'free'
    mockTransaction.mockResolvedValueOnce([
      [],
      [{ status: "free" }],
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
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Monthly match run limit reached");
    // withOrgContext (data queries) must NOT be called — no matchTransfers execution
    expect(vi.mocked(withOrgContext)).not.toHaveBeenCalled();
  });

  it("returns 200 for free-tier org with explicit 'free' status under limit", async () => {
    const app = buildMatchApp();

    // sql.transaction call 1: plan check — explicit free status
    mockTransaction.mockResolvedValueOnce([
      [],
      [{ status: "free" }],
    ]);
    // sql.transaction call 2: upsert + increment — succeeds
    mockTransaction.mockResolvedValueOnce([
      [],
      [],
      [{ count: 1 }],
    ]);

    const mock = vi.mocked(withOrgContext);
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
  });

  it("returns 200 for paid-tier org without usage check", async () => {
    const app = buildMatchApp();

    // sql.transaction call 1 only: plan check returns paid status
    // No second transaction call for paid orgs
    mockTransaction.mockResolvedValueOnce([
      [],
      [{ status: "paid" }],
    ]);

    const mock = vi.mocked(withOrgContext);
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
    // Only 1 transaction call (plan check), no second call for usage increment
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});

// --- GET /api/usage tests ---

describe("GET /api/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { count: 1, limit: 1, plan: 'free' } for free-tier org with 1 run", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    // Call 1: subscriptions query — free status
    mock.mockResolvedValueOnce([{ status: "free" }]);
    // Call 2: usage_meters query — count 1
    mock.mockResolvedValueOnce([{ count: 1 }]);

    const res = await app.request("/api/usage", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; limit: number; plan: string };
    expect(body.count).toBe(1);
    expect(body.limit).toBe(1);
    expect(body.plan).toBe("free");
  });

  it("returns { count: 0, limit: -1, plan: 'paid' } for paid-tier org", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    // Call 1: subscriptions query — paid status
    mock.mockResolvedValueOnce([{ status: "paid" }]);
    // Call 2: usage_meters query — count 0
    mock.mockResolvedValueOnce([{ count: 0 }]);

    const res = await app.request("/api/usage", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; limit: number; plan: string };
    expect(body.count).toBe(0);
    expect(body.limit).toBe(-1);
    expect(body.plan).toBe("paid");
  });

  it("defaults to { count: 0, limit: 1, plan: 'free' } when no subscription row exists", async () => {
    const app = buildBillingApp();

    const mock = vi.mocked(withOrgContext);
    // Call 1: subscriptions query — empty (no row)
    mock.mockResolvedValueOnce([]);
    // Call 2: usage_meters query — empty (no row)
    mock.mockResolvedValueOnce([]);

    const res = await app.request("/api/usage", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; limit: number; plan: string };
    expect(body.count).toBe(0);
    expect(body.limit).toBe(1);
    expect(body.plan).toBe("free");
  });
});
