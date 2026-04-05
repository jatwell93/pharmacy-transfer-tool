// FILE: apps/worker/src/routes/billing.ts
// This file defines billing-related API routes for the PharmIQ Stock Transfer Worker.
// GET /usage — returns { count, limit, plan } for the authenticated org (BILLING-02).
//              Reads from NEON subscriptions and usage_meters tables via withOrgContext.
// POST /billing/create-checkout — creates a Stripe Checkout session and returns { url } (BILLING-04).

import Stripe from 'stripe';
import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { withOrgContext } from '../db/client';

const billingRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// --- GET /usage ---

billingRoute.get('/usage', async (c) => {
  try {
    const orgId = c.get('orgId');
    const dbUrl = c.env.DATABASE_URL;
    const yearMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-04"

    // Fetch subscription status for this org
    const subRows = await withOrgContext<Array<{ status: string }>>(
      dbUrl,
      orgId,
      (tx) => tx`SELECT status FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`,
    );
    const plan = subRows[0]?.status === 'paid' ? 'paid' : 'free';
    const limit = plan === 'paid' ? -1 : 1; // -1 = unlimited

    // Fetch current month usage count from usage_meters
    const usageRows = await withOrgContext<Array<{ count: number }>>(
      dbUrl,
      orgId,
      (tx) => tx`
        SELECT count FROM usage_meters
        WHERE org_id = ${orgId} AND year_month = ${yearMonth}
        LIMIT 1
      `,
    );
    const count = usageRows[0]?.count ?? 0;

    return c.json({ count, limit, plan });
  } catch (err) {
    console.error('[billing] usage error:', err);
    return c.json({ error: 'Failed to load usage data' }, 500);
  }
});

// --- POST /billing/create-checkout ---

billingRoute.post('/billing/create-checkout', async (c) => {
  try {
    const orgId = c.get('orgId');

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: c.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${c.env.ALLOWED_ORIGIN}/billing?checkout=success`,
      cancel_url: `${c.env.ALLOWED_ORIGIN}/billing`,
      metadata: { org_id: orgId },
      subscription_data: {
        metadata: { org_id: orgId },
      },
    });

    return c.json({ url: session.url });
  } catch (err) {
    console.error('[billing] create-checkout error:', err);
    return c.json({ error: 'Failed to create checkout session' }, 500);
  }
});

export default billingRoute;
