import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

// Stage 1: verify Clerk JWT — returns 401 if invalid/missing
// Uses authorizedParties from ALLOWED_ORIGIN env var to validate azp claim (RESEARCH Pitfall 6).
// Without authorizedParties, @clerk/backend will reject tokens with "Invalid azp" error in production.
export const clerkAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  // authorizedParties validates the azp claim in the JWT.
  // Include both common Vite dev ports so whichever one Vite picks works.
  const extraParties = c.env.ALLOWED_ORIGIN.includes('localhost')
    ? ['http://localhost:5173', 'http://localhost:5174']
    : [];
  try {
    return await clerkMiddleware({
      secretKey: c.env.CLERK_SECRET_KEY,
      publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
      authorizedParties: [c.env.ALLOWED_ORIGIN, ...extraParties],
    })(c, next);
  } catch (err) {
    console.error('[auth] clerkMiddleware threw:', err);
    return c.json({ error: 'Authentication error' }, 401);
  }
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
