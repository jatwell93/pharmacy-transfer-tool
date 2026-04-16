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

import { withOrgContext } from "../db/client";
import { clerkAuth, requireOrg } from "../middleware/auth";
import summaryRoute from "../routes/dead-stock-summary";

// Helper: build a minimal Hono test app with auth middleware + summaryRoute mounted
function buildApp() {
  const app = new Hono<{
    Bindings: { DATABASE_URL: string; ALLOWED_ORIGIN: string };
    Variables: { orgId: string };
  }>();
  app.use("/api/*", clerkAuth, requireOrg);
  app.route("/api", summaryRoute);
  return app;
}

// Standard env bindings for test requests
const TEST_ENV = { DATABASE_URL: "postgres://test", ALLOWED_ORIGIN: "http://localhost:5173" };

// Typed reference to the mocked withOrgContext for easy mock setup
const mockedWithOrgContext = withOrgContext as ReturnType<typeof vi.fn>;

describe("GET /api/dead-stock-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: happy path — cost data present for all stores (D-06)
  it("returns 200 with per-store totals when cost data exists for all stores", async () => {
    const app = buildApp();
    mockedWithOrgContext.mockResolvedValueOnce([
      { name: "Balwyn",   total_units: 245, total_value: 1102.5, has_cost_data: true },
      { name: "Carnegie", total_units: 80,  total_value: 360,    has_cost_data: true },
    ]);

    const res = await app.request("/api/dead-stock-summary", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stores: Array<{ name: string; totalUnits: number; totalValue: number; hasCostData: boolean }> };
    expect(body.stores.length).toBe(2);
    expect(body.stores[0].name).toBe("Balwyn");
    expect(body.stores[0].totalUnits).toBe(245);
    expect(body.stores[0].totalValue).toBe(1102.5);
    expect(body.stores[0].hasCostData).toBe(true);
    expect(body.stores[1].name).toBe("Carnegie");
    expect(body.stores[1].totalUnits).toBe(80);
    expect(body.stores[1].totalValue).toBe(360);
    expect(body.stores[1].hasCostData).toBe(true);
  });

  // Test 2: no cost data — COST-04 condition: every hasCostData === false, totalValue === 0, no error
  it("returns 200 with hasCostData=false and totalValue=0 for all stores when no cost data exists (COST-04)", async () => {
    const app = buildApp();
    mockedWithOrgContext.mockResolvedValueOnce([
      { name: "Balwyn",   total_units: 245, total_value: 0, has_cost_data: false },
      { name: "Carnegie", total_units: 80,  total_value: 0, has_cost_data: false },
    ]);

    const res = await app.request("/api/dead-stock-summary", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stores: Array<{ hasCostData: boolean; totalValue: number }> };
    expect(body.stores.every((s: { hasCostData: boolean }) => s.hasCostData === false)).toBe(true);
    expect(body.stores.every((s: { totalValue: number }) => s.totalValue === 0)).toBe(true);
  });

  // Test 3: mixed — some stores have cost data, others don't
  it("returns 200 with mixed hasCostData and 0 totalValue for stores missing cost (mixed scenario)", async () => {
    const app = buildApp();
    mockedWithOrgContext.mockResolvedValueOnce([
      { name: "Balwyn",   total_units: 100, total_value: 500, has_cost_data: true  },
      { name: "Carnegie", total_units: 50,  total_value: 0,   has_cost_data: false },
    ]);

    const res = await app.request("/api/dead-stock-summary", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stores: Array<{ name: string; hasCostData: boolean; totalValue: number }> };
    expect(body.stores[0].hasCostData).toBe(true);
    expect(body.stores[1].hasCostData).toBe(false);
    // totalValue === 0, not undefined, not NaN
    expect(body.stores[1].totalValue).toBe(0);
    expect(Number.isNaN(body.stores[1].totalValue)).toBe(false);
  });

  // Test 4: empty store list — org has no stores
  it("returns 200 with an empty stores array when org has no stores", async () => {
    const app = buildApp();
    mockedWithOrgContext.mockResolvedValueOnce([]);

    const res = await app.request("/api/dead-stock-summary", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stores: unknown[] };
    expect(Array.isArray(body.stores)).toBe(true);
    expect(body.stores).toEqual([]);
  });

  // Test 5: defensive boolean coercion — has_cost_data returned as string "true" (Pitfall 5)
  it("coerces string has_cost_data to a JS boolean (Pitfall 5 — NEON may serialize booleans as strings)", async () => {
    const app = buildApp();
    mockedWithOrgContext.mockResolvedValueOnce([
      { name: "Balwyn", total_units: 10, total_value: 50, has_cost_data: "true" as unknown as boolean },
    ]);

    const res = await app.request("/api/dead-stock-summary", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stores: Array<{ hasCostData: unknown }> };
    expect(typeof body.stores[0].hasCostData).toBe("boolean");
    expect(body.stores[0].hasCostData).toBe(true);
  });

  // Test 6: defensive numeric coercion — total_units/total_value as strings (some PG drivers serialize numerics as strings)
  it("coerces string total_units and total_value to JS numbers (defensive NEON driver numeric serialization)", async () => {
    const app = buildApp();
    mockedWithOrgContext.mockResolvedValueOnce([
      { name: "Balwyn", total_units: "245" as unknown as number, total_value: "1102.5" as unknown as number, has_cost_data: true },
    ]);

    const res = await app.request("/api/dead-stock-summary", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stores: Array<{ totalUnits: unknown; totalValue: unknown }> };
    expect(typeof body.stores[0].totalUnits).toBe("number");
    expect(body.stores[0].totalUnits).toBe(245);
    expect(typeof body.stores[0].totalValue).toBe("number");
    expect(body.stores[0].totalValue).toBe(1102.5);
  });

  // Test 7: DB error — should return 500 with a static error string (no DB internals leaked)
  it("returns 500 with a static error string when the DB throws (T-12-11 — no internals leaked)", async () => {
    const app = buildApp();
    mockedWithOrgContext.mockRejectedValueOnce(new Error("connection failed"));

    const res = await app.request("/api/dead-stock-summary", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: unknown };
    expect(typeof body.error).toBe("string");
    // Must NOT leak "connection failed" or any DB internals
    expect(body.error).not.toContain("connection failed");
  });
});
