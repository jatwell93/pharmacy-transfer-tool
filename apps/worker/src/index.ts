import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { clerkAuth, requireOrg } from './middleware/auth';
import healthRoute from './routes/health';
import uploadRoute from './routes/upload';
import matchRoute from './routes/match';
import billingRoute from './routes/billing';
import webhookRoute from './routes/webhook';
import type { Env, Variables } from './types';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply CORS middleware for all routes
app.use('*', cors({
  origin: (origin, c) => c.env.ALLOWED_ORIGIN,
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Mount webhook route FIRST (before auth middleware) — public route, no Clerk JWT.
// Stripe sends no Authorization header; mounting after auth middleware causes 401 on all webhook calls.
app.route('/', webhookRoute);

// Apply two-stage auth middleware to all /api/* routes:
// Stage 1 (clerkAuth): verifies Clerk JWT with authorizedParties — returns 401 if invalid/missing
// Stage 2 (requireOrg): checks orgId from verified JWT — returns 403 if absent
app.use('/api/*', clerkAuth, requireOrg);

// Mount authenticated routes (protected by Clerk middleware above)
app.route('/api', healthRoute);
app.route('/api', uploadRoute);
app.route('/api', matchRoute);
app.route('/api', billingRoute);

export default app;
