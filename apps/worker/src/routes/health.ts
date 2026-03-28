import { Hono } from 'hono';
import type { Env, Variables } from '../types';

const healthRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /health — smoke-test route returning the verified orgId
// This route is behind the auth middleware chain, so reaching it proves auth passed (AUTH-02).
healthRoute.get('/health', (c) => {
  const orgId = c.get('orgId');
  return c.json({ orgId });
});

export default healthRoute;
