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
    // Default: enterprise plan — Infinity limits bypass all metering/store-count gates
    // (1 transaction call only). Phase 15 changed match.ts to read plan_tier (not status);
    // 'enterprise' resolves to PLAN_LIMITS.enterprise with matchRuns=Infinity, skipping
    // the second sql.transaction() call entirely and keeping all existing tests unaffected.
    mockMatchTransaction.mockResolvedValue([
      [], // set_config result
      [{ plan_tier: "enterprise" }], // subscriptions query — enterprise = skip all limits
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
    // Call 2: rou_data query — rows for cross-store matching (includes is_ranged after Phase 7 fix)
    mock.mockResolvedValueOnce([
      { sku: "SKU1", description: "Item 1", rou: 20, soh: 10, is_ranged: false, store_name: "Store B" },
      { sku: "SKU2", description: "Item 2", rou: 15, soh: 5, is_ranged: false, store_name: "Store A" },
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
      { sku: "SKU_WARN", description: "Problem Item", rou: NaN, soh: 10, is_ranged: false, store_name: "Store C" },
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

  it("returns results with ranged items sorted first when is_ranged=true in rou_data", async () => {
    const app = buildApp();
    const mock = vi.mocked(withOrgContext);
    // Call 1: dead_stock — SKU1 at Store A with soh=10
    // minRequiredRou = 10/12 ≈ 0.83 — both destination ROUs (5 and 3) pass the sell-through filter
    mock.mockResolvedValueOnce([
      { sku: "SKU1", description: "Item 1", soh: 10, store_name: "Store A" },
    ]);
    // Call 2: rou_data — SKU1 at two destination stores:
    //   Store B: non-ranged, higher ROU (5)
    //   Store C: ranged, lower ROU (3) — must sort FIRST due to is_ranged=true
    mock.mockResolvedValueOnce([
      { sku: "SKU1", description: "Item 1", rou: 5, soh: 5, is_ranged: false, store_name: "Store B" },
      { sku: "SKU1", description: "Item 1", rou: 3, soh: 5, is_ranged: true,  store_name: "Store C" },
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
      results: Array<{ sourceStore: string; bestMatch: { store: string; isRanged: boolean } }>;
      warnings: unknown[];
    };
    expect(body.results).toHaveLength(1);
    // Store C (ranged, rou=3) must be bestMatch despite lower ROU than Store B (non-ranged, rou=5)
    expect(body.results[0].bestMatch.store).toBe("Store C");
    expect(body.results[0].bestMatch.isRanged).toBe(true);
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

  it("returns MatchResult.cost equal to cost_ex when dead_stock row has cost_ex value", async () => {
    const app = buildApp();
    const mock = vi.mocked(withOrgContext);
    // Call 1: dead_stock — SKU1 with cost_ex: 5.99
    mock.mockResolvedValueOnce([
      { sku: "SKU1", description: "Item 1", soh: 10, store_name: "Store A", cost_ex: 5.99 },
    ]);
    // Call 2: rou_data — SKU1 at Store B so a match is produced
    mock.mockResolvedValueOnce([
      { sku: "SKU1", description: "Item 1", rou: 5, soh: 0, is_ranged: false, store_name: "Store B" },
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
      results: Array<{ cost: number }>;
      warnings: unknown[];
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].cost).toBe(5.99);
  });

  it("returns MatchResult.cost of 0 when dead_stock row has cost_ex: null", async () => {
    const app = buildApp();
    const mock = vi.mocked(withOrgContext);
    // Call 1: dead_stock — SKU1 with cost_ex: null (no cost data uploaded)
    mock.mockResolvedValueOnce([
      { sku: "SKU1", description: "Item 1", soh: 10, store_name: "Store A", cost_ex: null },
    ]);
    // Call 2: rou_data — SKU1 at Store B so a match is produced
    mock.mockResolvedValueOnce([
      { sku: "SKU1", description: "Item 1", rou: 5, soh: 0, is_ranged: false, store_name: "Store B" },
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
      results: Array<{ cost: number }>;
      warnings: unknown[];
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].cost).toBe(0);
  });
});
