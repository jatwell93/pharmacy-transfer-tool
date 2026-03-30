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
import uploadRoute from "../routes/upload";

// Helper: build a minimal Hono test app with auth middleware + uploadRoute mounted
function buildApp() {
  const app = new Hono<{
    Bindings: { DATABASE_URL: string; ALLOWED_ORIGIN: string };
    Variables: { orgId: string };
  }>();
  app.use("/api/*", clerkAuth, requireOrg);
  app.route("/api", uploadRoute);
  return app;
}

// Standard env bindings for test requests
const TEST_ENV = { DATABASE_URL: "postgres://test", ALLOWED_ORIGIN: "http://localhost:5173" };

// --- POST /api/upload ---

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when storeName is missing", async () => {
    const app = buildApp();

    // FormData with a file but no storeName
    const form = new FormData();
    form.append("rouFile", new File(["sku,rou,soh\nABC,1,5"], "rou.csv", { type: "text/csv" }));

    const res = await app.request("/api/upload", { method: "POST", body: form }, TEST_ENV);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("storeName is required");
  });

  it("returns 400 when no files provided", async () => {
    const app = buildApp();

    const form = new FormData();
    form.append("storeName", "TestStore");

    const res = await app.request("/api/upload", { method: "POST", body: form }, TEST_ENV);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("At least one file must be provided");
  });

  it("returns 413 when rouFile exceeds 5 MB", async () => {
    const app = buildApp();

    // Create a File whose content is actually > 5 MB so the .size property reflects it.
    // 6 MB of repeated 'a' characters — realistic size for a large FRED export.
    const bigContent = "a".repeat(6 * 1024 * 1024);
    const bigFile = new File([bigContent], "big.csv", { type: "text/csv" });

    const form = new FormData();
    form.append("storeName", "TestStore");
    form.append("rouFile", bigFile);

    const res = await app.request("/api/upload", { method: "POST", body: form }, TEST_ENV);

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string; field: string };
    expect(body.error).toContain("File too large");
    expect(body.field).toBe("rouFile");
  });

  it("returns 413 when dsFile exceeds 5 MB", async () => {
    const app = buildApp();

    const bigContent = "a".repeat(6 * 1024 * 1024);
    const bigFile = new File([bigContent], "big.csv", { type: "text/csv" });

    const form = new FormData();
    form.append("storeName", "TestStore");
    form.append("dsFile", bigFile);

    const res = await app.request("/api/upload", { method: "POST", body: form }, TEST_ENV);

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string; field: string };
    expect(body.error).toContain("File too large");
    expect(body.field).toBe("dsFile");
  });

  it("returns 200 with ok:true for valid ROU upload", async () => {
    const app = buildApp();

    const mockedWithOrgContext = vi.mocked(withOrgContext);
    // Call sequence: org upsert, SELECT (no store), INSERT store, DELETE rou_data, INSERT rou_data
    mockedWithOrgContext
      .mockResolvedValueOnce(undefined)                    // org upsert — INSERT INTO orgs ON CONFLICT DO NOTHING
      .mockResolvedValueOnce([])                           // SELECT stores → not found
      .mockResolvedValueOnce([{ id: "store-uuid-123" }])   // INSERT stores RETURNING id
      .mockResolvedValueOnce(undefined)                    // DELETE rou_data
      .mockResolvedValueOnce(undefined);                   // INSERT rou_data

    // Minimal valid CSV with required headers
    const csvContent = "Item Code,ROU Value,SOH\nABC123,2.5,10\n";
    const rouFile = new File([csvContent], "rou.csv", { type: "text/csv" });

    const form = new FormData();
    form.append("storeName", "TestStore");
    form.append("rouFile", rouFile);

    const res = await app.request("/api/upload", { method: "POST", body: form }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; storeId: string; storeName: string };
    expect(body.ok).toBe(true);
    expect(body.storeId).toBe("store-uuid-123");
    expect(body.storeName).toBe("TestStore");
  });

  it("returns 200 with ok:true for valid dead-stock upload to existing store", async () => {
    const app = buildApp();

    const mockedWithOrgContext = vi.mocked(withOrgContext);
    // Call sequence: org upsert, SELECT (found existing store), DELETE dead_stock, INSERT dead_stock
    mockedWithOrgContext
      .mockResolvedValueOnce(undefined)                    // org upsert — INSERT INTO orgs ON CONFLICT DO NOTHING
      .mockResolvedValueOnce([{ id: "store-uuid-456" }])   // SELECT stores → found
      .mockResolvedValueOnce(undefined)                    // DELETE dead_stock
      .mockResolvedValueOnce(undefined);                   // INSERT dead_stock

    const csvContent = "Item Code,SOH,Ranged\nXYZ789,5,checked\n";
    const dsFile = new File([csvContent], "dead-stock.csv", { type: "text/csv" });

    const form = new FormData();
    form.append("storeName", "ExistingStore");
    form.append("dsFile", dsFile);

    const res = await app.request("/api/upload", { method: "POST", body: form }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; storeId: string; storeName: string };
    expect(body.ok).toBe(true);
    expect(body.storeId).toBe("store-uuid-456");
    expect(body.storeName).toBe("ExistingStore");
  });
});

// --- GET /api/stores ---

describe("GET /api/stores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stores array with camelCase keys", async () => {
    const app = buildApp();

    const mockedWithOrgContext = vi.mocked(withOrgContext);
    // GET /stores makes exactly 1 withOrgContext call — the LEFT JOIN query
    mockedWithOrgContext.mockResolvedValueOnce([
      {
        id: "store-uuid-001",
        name: "Balwyn",
        store_number: "S01",
        created_at: "2026-03-01T10:00:00.000Z",
        rou_uploaded_at: "2026-03-29T14:32:00.000Z",
        ds_uploaded_at: "2026-03-28T09:15:00.000Z",
      },
    ]);

    const res = await app.request("/api/stores", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stores: Array<{
        id: string;
        name: string;
        storeNumber: string | null;
        createdAt: string;
        rouUploadedAt: string | null;
        dsUploadedAt: string | null;
      }>;
    };
    expect(Array.isArray(body.stores)).toBe(true);
    expect(body.stores).toHaveLength(1);

    const store = body.stores[0];
    expect(store.id).toBe("store-uuid-001");
    expect(store.name).toBe("Balwyn");
    expect(store.storeNumber).toBe("S01");
    expect(store.createdAt).toBeDefined();
    expect(store.rouUploadedAt).toBe("2026-03-29T14:32:00.000Z");
    expect(store.dsUploadedAt).toBe("2026-03-28T09:15:00.000Z");
  });

  it("returns empty stores array when no stores exist", async () => {
    const app = buildApp();

    const mockedWithOrgContext = vi.mocked(withOrgContext);
    // GET /stores makes exactly 1 withOrgContext call — returns empty result
    mockedWithOrgContext.mockResolvedValueOnce([]);

    const res = await app.request("/api/stores", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stores: unknown[] };
    expect(body.stores).toEqual([]);
  });

  it("returns null rouUploadedAt and dsUploadedAt for stores with no uploads", async () => {
    const app = buildApp();

    const mockedWithOrgContext = vi.mocked(withOrgContext);
    // GET /stores makes exactly 1 withOrgContext call — store with null timestamps
    mockedWithOrgContext.mockResolvedValueOnce([
      {
        id: "store-uuid-002",
        name: "Carnegie",
        store_number: null,
        created_at: "2026-03-01T10:00:00.000Z",
        rou_uploaded_at: null,
        ds_uploaded_at: null,
      },
    ]);

    const res = await app.request("/api/stores", { method: "GET" }, TEST_ENV);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stores: Array<{ rouUploadedAt: string | null; dsUploadedAt: string | null }>;
    };
    expect(body.stores[0].rouUploadedAt).toBeNull();
    expect(body.stores[0].dsUploadedAt).toBeNull();
  });
});
