import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

// Stage 1: verify Clerk JWT — returns 401 if invalid/missing
// Uses authorizedParties from ALLOWED_ORIGIN env var to validate azp claim (RESEARCH Pitfall 6).
// Without authorizedParties, @clerk/backend will reject tokens with "Invalid azp" error in production.
export const clerkAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  return clerkMiddleware({
    secretKey: c.env.CLERK_SECRET_KEY,
    publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
    authorizedParties: [c.env.ALLOWED_ORIGIN],
  })(c, next);
});

// Stage 2: require active org — returns 403 if orgId absent
export const requireOrg = createMiddleware<{ Bindings: Env; Variables: { orgId: string } }>(
  async (c, next) => {
    const auth = getAuth(c);
    if (!auth?.userId) {
      // clerkMiddleware should have caught this, but belt-and-suspenders
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (!auth?.orgId) {
      return c.json({ error: 'Active Clerk organisation required' }, 403);
    }
    // Store on context for downstream handlers
    c.set('orgId', auth.orgId);
    await next();
  }
);
