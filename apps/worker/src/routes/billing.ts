// FILE: apps/worker/src/routes/billing.ts
// This file defines billing-related API routes for the PharmIQ Stock Transfer Worker.
//
// GET  /usage                              — returns { count, limit, plan_tier, store_count } (BILLING-02)
// POST /billing/create-checkout            — creates Stripe Checkout session (tier-aware, Pro->Enterprise upgrade detection) (BILLING-04, BILLING-08)
// GET  /billing/checkout-session/:sessionId — synchronous checkout confirmation; upserts plan_tier (BILLING-09)
// POST /billing/create-portal-session      — returns Stripe Customer Portal URL (D-06)

import Stripe from 'stripe';
import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { withOrgContext } from '../db/client';
import { PLAN_LIMITS, type PlanTier } from '../lib/plans';

const billingRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// --- GET /usage ---

billingRoute.get('/usage', async (c) => {
  try {
    const orgId = c.get('orgId');
    const dbUrl = c.env.DATABASE_URL;
    const yearMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-04"

    // Fetch plan_tier (not legacy status) from subscriptions
    const subRows = await withOrgContext<Array<{ plan_tier: string }>>(
      dbUrl,
      orgId,
      (tx) => tx`SELECT plan_tier FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`,
    );
    const rawTier = subRows[0]?.plan_tier ?? 'free';
    // Backward compat: map 'paid' (legacy value) to 'pro'
    const planTier: PlanTier = rawTier === 'paid' ? 'pro' : (rawTier as PlanTier);
    const limits = PLAN_LIMITS[planTier] ?? PLAN_LIMITS.free;
    const limit = limits.matchRuns === Infinity ? -1 : limits.matchRuns;

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

    // Fetch distinct store count from rou_data
    const storeRows = await withOrgContext<Array<{ cnt: number }>>(
      dbUrl,
      orgId,
      (tx) => tx`SELECT COUNT(DISTINCT store_id)::int AS cnt FROM rou_data WHERE org_id = ${orgId}`,
    );
    const store_count = storeRows[0]?.cnt ?? 0;

    return c.json({ count, limit, plan_tier: planTier, store_count });
  } catch (err) {
    console.error('[billing] usage error:', err);
    return c.json({ error: 'Failed to load usage data' }, 500);
  }
});

// --- POST /billing/create-checkout ---

billingRoute.post('/billing/create-checkout', async (c) => {
  try {
    const orgId = c.get('orgId');
    const dbUrl = c.env.DATABASE_URL;
    const body = await c.req.json<{ tier?: string }>();
    const tier = body.tier === 'enterprise' ? 'enterprise' : 'pro'; // default to pro

    const priceId = tier === 'enterprise'
      ? c.env.STRIPE_PRICE_ID_ENTERPRISE
      : c.env.STRIPE_PRICE_ID_PRO;

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    // --- BILLING-08: Check for existing subscription to prevent duplicate subscriptions ---
    const existingRows = await withOrgContext<Array<{
      stripe_subscription_id: string | null;
      stripe_customer_id: string | null;
    }>>(
      dbUrl,
      orgId,
      (tx) => tx`SELECT stripe_subscription_id, stripe_customer_id FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`,
    );
    const existingSub = existingRows[0];

    let session;
    if (existingSub?.stripe_subscription_id) {
      // Existing subscription found (e.g., Pro->Enterprise upgrade).
      // Retrieve the subscription to get the current item ID.
      await stripe.subscriptions.retrieve(existingSub.stripe_subscription_id);

      // Use Stripe Checkout with the existing customer to upgrade.
      // Including customer prevents creating a duplicate subscription.
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: existingSub.stripe_customer_id ?? undefined,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${c.env.ALLOWED_ORIGIN}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${c.env.ALLOWED_ORIGIN}/billing`,
        metadata: { org_id: orgId, plan_tier: tier },
        subscription_data: {
          metadata: { org_id: orgId, plan_tier: tier },
        },
      });
    } else {
      // No existing subscription — standard new checkout (Free->Pro or Free->Enterprise)
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${c.env.ALLOWED_ORIGIN}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${c.env.ALLOWED_ORIGIN}/billing`,
        metadata: { org_id: orgId, plan_tier: tier },
        subscription_data: {
          metadata: { org_id: orgId, plan_tier: tier },
        },
      });
    }

    // Store stripe_customer_id NOW (before redirect) so portal and upgrade flows can use it
    if (session.customer) {
      await withOrgContext(
        dbUrl,
        orgId,
        (tx) => tx`
          INSERT INTO subscriptions (org_id, stripe_customer_id, status, plan_tier)
          VALUES (${orgId}, ${session.customer as string}, 'free', 'free')
          ON CONFLICT (org_id) DO UPDATE
          SET stripe_customer_id = ${session.customer as string},
              updated_at = NOW()
        `,
      );
    }

    return c.json({ url: session.url });
  } catch (err) {
    console.error('[billing] create-checkout error:', err);
    return c.json({ error: 'Failed to create checkout session' }, 500);
  }
});

// --- GET /billing/checkout-session/:sessionId (BILLING-09) ---
// Synchronous checkout confirmation — called by frontend on success redirect.
// Eliminates webhook timing race by immediately confirming payment and upserting plan_tier.

billingRoute.get('/billing/checkout-session/:sessionId', async (c) => {
  try {
    const orgId = c.get('orgId');
    const dbUrl = c.env.DATABASE_URL;
    const sessionId = c.req.param('sessionId');

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return c.json({ error: 'Payment not confirmed' }, 402);
    }

    const tier = session.metadata?.plan_tier || 'pro';

    // Upsert plan_tier into subscriptions synchronously (same write the webhook does)
    await withOrgContext(
      dbUrl,
      orgId,
      (tx) => tx`
        INSERT INTO subscriptions (org_id, stripe_customer_id, stripe_subscription_id, status, plan_tier)
        VALUES (${orgId}, ${session.customer as string}, ${session.subscription as string}, 'paid', ${tier})
        ON CONFLICT (org_id) DO UPDATE
        SET stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            status = 'paid',
            plan_tier = ${tier},
            updated_at = NOW()
      `,
    );

    return c.json({ plan_tier: tier });
  } catch (err) {
    console.error('[billing] checkout-session confirm error:', err);
    return c.json({ error: 'Failed to confirm checkout session' }, 500);
  }
});

// --- POST /billing/create-portal-session ---

billingRoute.post('/billing/create-portal-session', async (c) => {
  try {
    const orgId = c.get('orgId');
    const dbUrl = c.env.DATABASE_URL;

    const rows = await withOrgContext<Array<{ stripe_customer_id: string | null }>>(
      dbUrl,
      orgId,
      (tx) => tx`SELECT stripe_customer_id FROM subscriptions WHERE org_id = ${orgId} LIMIT 1`,
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) {
      return c.json({ error: 'No active subscription found' }, 400);
    }

    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${c.env.ALLOWED_ORIGIN}/billing`,
    });

    return c.json({ url: portalSession.url });
  } catch (err) {
    console.error('[billing] create-portal-session error:', err);
    return c.json({ error: 'Failed to create portal session' }, 500);
  }
});

export default billingRoute;
