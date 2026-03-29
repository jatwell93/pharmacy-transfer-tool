import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

// Mock @hono/clerk-auth for integration test — clerkMiddleware is a passthrough,
// getAuth returns a valid auth state with both userId and orgId to simulate an
// authenticated request with an active org.
vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: (_opts?: unknown) => {
    return async (_c: unknown, next: () => Promise<void>) => {
      await next();
    };
  },
  getAuth: () => ({
    userId: "user_123",
    orgId: "org_456",
  }),
}));

import { clerkAuth, requireOrg } from "../middleware/auth";
import healthRoute from "../routes/health";

describe("GET /api/health integration", () => {
  it("returns 200 with orgId in JSON body when authenticated with an active org", async () => {
    const app = new Hono<{
      Bindings: { ALLOWED_ORIGIN: string };
      Variables: { orgId: string };
    }>();

    // Wire the same middleware chain used in production (src/index.ts)
    app.use("/api/*", clerkAuth, requireOrg);
    app.route("/api", healthRoute);

    const res = await app.request(
      "/api/health",
      {
        method: "GET",
      },
      { ALLOWED_ORIGIN: "http://localhost:5173" },
    );

    expect(res.status).toBe(200);

    // Verify Content-Type is JSON
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/json");

    // Verify body contains the orgId from the mocked auth state
    const body = (await res.json()) as { orgId: string };
    expect(body.orgId).toBe("org_456");
  });
});
