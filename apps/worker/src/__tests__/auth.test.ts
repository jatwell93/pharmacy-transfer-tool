import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock @hono/clerk-auth so we can control what getAuth() returns in each test.
// clerkMiddleware is a passthrough that accepts an options object (including authorizedParties)
// to match the production signature. getAuth returns the per-test mock value.
const mockGetAuth = vi.fn();

vi.mock('@hono/clerk-auth', () => ({
  clerkMiddleware: (_opts?: unknown) => {
    // Return a passthrough middleware — token validation is not tested here;
    // we test that our requireOrg middleware handles the auth state correctly.
    return async (_c: unknown, next: () => Promise<void>) => {
      await next();
    };
  },
  getAuth: (c: unknown) => mockGetAuth(c),
}));

// Import AFTER the mock is registered so the mock applies
import { clerkAuth, requireOrg } from '../middleware/auth';

function buildApp(authState: { userId: string | null; orgId: string | null } | null) {
  mockGetAuth.mockReturnValue(authState);

  const app = new Hono<{ Bindings: { ALLOWED_ORIGIN: string }; Variables: { orgId: string } }>();

  // Simulate the auth middleware chain on /api/*
  app.use('/api/*', clerkAuth, requireOrg);

  app.get('/api/health', (c) => {
    return c.json({ orgId: c.get('orgId') });
  });

  return app;
}

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when getAuth returns no userId (no auth header / invalid JWT)', async () => {
    const app = buildApp({ userId: null, orgId: null });

    const res = await app.request('/api/health', {
      method: 'GET',
    }, { ALLOWED_ORIGIN: 'http://localhost:5173' });

    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  it('returns 403 with "Active Clerk organisation required" when userId present but no orgId', async () => {
    const app = buildApp({ userId: 'user_123', orgId: null });

    const res = await app.request('/api/health', {
      method: 'GET',
    }, { ALLOWED_ORIGIN: 'http://localhost:5173' });

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Active Clerk organisation required');
  });

  it('returns 200 and passes orgId through when both userId and orgId are present', async () => {
    const app = buildApp({ userId: 'user_123', orgId: 'org_456' });

    const res = await app.request('/api/health', {
      method: 'GET',
    }, { ALLOWED_ORIGIN: 'http://localhost:5173' });

    expect(res.status).toBe(200);
    const body = await res.json() as { orgId: string };
    expect(body.orgId).toBe('org_456');
  });
});
