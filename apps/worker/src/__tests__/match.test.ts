import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock @hono/clerk-auth — clerkMiddleware is a passthrough, getAuth returns
// a valid auth state with both userId and orgId to simulate authenticated requests.
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

// Mock neon from @neondatabase/serverless — match route uses neon() directly
// for the usage metering transaction (plan check + upsert/increment).
// Default behaviour: paid plan (skip usage enforcement) so existing tests are unaffected.
const mockMatchTransaction = vi.fn();
vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => ({ transaction: mockMatchTransaction })),
}));

import { withOrgContext } from "../db/client";
import { clerkAuth, requireOrg } from "../middleware/auth";
import matchRoute from "../routes/match";
import type { Env, Variables } from "../types";

// Helper: build a minimal Hono test app with auth middleware + matchRoute mounted
function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("/api/*", clerkAuth, requireOrg);
  app.route("/api", matchRoute);
  return app;
}

// Standard env bindings for test requests
const TEST_ENV = {
  DATABASE_URL: "postgres://test",
  CLERK_SECRET_KEY: "sk_test",
  CLERK_PUBLISHABLE_KEY: "pk_test",
  ALLOWED_ORIGIN: "http://localhost:5173",
};

// --- POST /api/match ---

describe("POST /api/match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: paid plan — usage check runs plan query only (1 transaction call),
    // then skips the upsert/increment entirely. This keeps all existing tests unaffected
    // by the usage metering logic added to match.ts in Phase 5.
    mockMatchTransaction.mockResolvedValue([
      [], // set_config result
      [{ status: "paid" }], // subscriptions query — paid = skip limit check
    ]);
  });

  it("returns 400 when monthsCoverTarget is missing from body", async () => {
    const app = buildApp();

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("monthsCoverTarget");
  });

  it("returns 400 when monthsCoverTarget is 0", async () => {
    const app = buildApp();

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 0 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when monthsCoverTarget is 25 (exceeds max)", async () => {
    const app = buildApp();

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 25 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
  });

  it("returns 200 with empty results when no dead-stock data exists", async () => {
    const app = buildApp();

    const mock = vi.mocked(withOrgContext);
    // Call 1: dead_stock query — returns empty array
    mock.mockResolvedValueOnce([]);
    // Call 2: rou_data query — returns empty array
    mock.mockResolvedValueOnce([]);

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
    const body = (await res.json()) as { results: unknown[]; warnings: unknown[] };
    expect(body.results).toEqual([]);
    expect(body.warnings).toEqual([]);
  });

  it("returns 200 with merged results from 2 stores", async () => {
    const app = buildApp();

    const mock = vi.mocked(withOrgContext);
    // Call 1: dead_stock query — 2 rows from different stores
    mock.mockResolvedValueOnce([
      { sku: "SKU1", description: "Item 1", soh: 100, store_name: "Store A" },
      { sku: "SKU2", description: "Item 2", soh: 50, store_name: "Store B" },
    ]);
    // Call 2: rou_data query — rows for cross-store matching
    // Note: rou_data rows do NOT include is_ranged (column does not exist in rou_data table)
    mock.mockResolvedValueOnce([
      { sku: "SKU1", description: "Item 1", rou: 20, soh: 10, store_name: "Store B" },
      { sku: "SKU2", description: "Item 2", rou: 15, soh: 5, store_name: "Store A" },
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

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<{ sourceStore: string }>;
      warnings: unknown[];
    };
    expect(body.results).toHaveLength(2);

    const sourceStores = body.results.map((r) => r.sourceStore);
    expect(sourceStores).toContain("Store A");
    expect(sourceStores).toContain("Store B");
  });

  it("deduplicates warnings across stores (same sku+field appears once)", async () => {
    const app = buildApp();

    const mock = vi.mocked(withOrgContext);
    // Call 1: dead_stock — 2 stores both have SKU_WARN with NaN soh
    mock.mockResolvedValueOnce([
      { sku: "SKU_WARN", description: "Problem Item", soh: NaN, store_name: "Store A" },
      { sku: "SKU_WARN", description: "Problem Item", soh: NaN, store_name: "Store B" },
    ]);
    // Call 2: rou_data — no matches needed (warning is about soh NaN in dead_stock)
    mock.mockResolvedValueOnce([
      { sku: "SKU_WARN", description: "Problem Item", rou: NaN, soh: 10, store_name: "Store C" },
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

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: unknown[];
      warnings: Array<{ sku: string; field: string }>;
    };
    // SKU_WARN::soh warning should appear only once despite two store runs producing it
    const sohWarnings = body.warnings.filter(
      (w) => w.sku === "SKU_WARN" && w.field === "soh",
    );
    expect(sohWarnings.length).toBe(1);
  });

  it("returns 500 on database error", async () => {
    const app = buildApp();

    const mock = vi.mocked(withOrgContext);
    mock.mockRejectedValueOnce(new Error("DB connection failed"));

    const res = await app.request(
      "/api/match",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsCoverTarget: 3 }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Match run failed");
  });
});
