// FILE: apps/worker/src/routes/webhook.ts
// This file defines the Stripe webhook handler for the PharmIQ Stock Transfer Worker.
// POST /stripe/webhook — PUBLIC route (no Clerk auth). Verifies Stripe-Signature header
// using constructEventAsync (async WebCrypto required for Cloudflare Workers).
//
// Handled events:
//   checkout.session.completed    → upsert subscriptions with plan_tier from metadata (BILLING-05)
//   customer.subscription.updated → write plan_tier based on price ID (BILLING-10)
//   customer.subscription.deleted → reset status and plan_tier to 'free'
//
// Idempotency: all events are deduplicated via processed_webhook_events table (BILLING-10).
// The dedupe INSERT uses direct neon() sql tag — NOT withOrgContext/set_config — because
// processed_webhook_events has a permissive RLS policy (webhook_all) that allows non-RLS access.
//
// IMPORTANT: This route MUST be mounted in index.ts BEFORE app.use('/api/*', clerkAuth, requireOrg).
// Hono middleware applies in registration order — mounting after auth middleware causes 401 on all
// Stripe webhook requests (which carry no Clerk JWT).

import Stripe from 'stripe';
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import type { Env } from '../types';

const webhookRoute = new Hono<{ Bindings: Env }>();

// Create WebCrypto provider once at module scope (required for Workers async crypto)
const webCrypto = Stripe.createSubtleCryptoProvider();

webhookRoute.post('/stripe/webhook', async (c) => {
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Check for stripe-signature header before reading body (fast rejection)
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.text('Missing signature', 400);
  }

  // Read raw body ONCE — body stream is consumed on first read; do not call c.req.text() again
  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      webCrypto,
    );
  } catch (err) {
    console.error('[webhook] signature verification failed:', err);
    return c.text('Invalid signature', 400);
  }

  const sql = neon(c.env.DATABASE_URL);

  // --- Idempotency guard (BILLING-10) ---
  // Uses direct sql tag (no set_config) — processed_webhook_events has a permissive RLS policy.
  const dedupeResult = await sql`
    INSERT INTO processed_webhook_events (stripe_event_id)
    VALUES (${event.id})
    ON CONFLICT (stripe_event_id) DO NOTHING
    RETURNING id
  `;
  if (dedupeResult.length === 0) {
    // Event already processed — return 200 immediately without re-applying DB changes
    return c.text('', 200);
  }

  // --- Handle checkout.session.completed → activate paid plan with tier ---
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orgId = session.metadata?.org_id;
    const tier = session.metadata?.plan_tier || 'pro';
    if (orgId) {
      const claims = JSON.stringify({ org_id: orgId });
      await sql.transaction((tx) => [
        tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
        tx`INSERT INTO subscriptions (org_id, stripe_customer_id, stripe_subscription_id, status, plan_tier)
           VALUES (${orgId}, ${session.customer as string}, ${session.subscription as string}, 'paid', ${tier})
           ON CONFLICT (org_id) DO UPDATE
           SET stripe_customer_id = EXCLUDED.stripe_customer_id,
               stripe_subscription_id = EXCLUDED.stripe_subscription_id,
               status = 'paid',
               plan_tier = ${tier},
               updated_at = NOW()`,
      ]);
    }
  }

  // --- Handle customer.subscription.updated → update plan_tier from price ID (BILLING-10) ---
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    let orgId = sub.metadata?.org_id;
    if (!orgId) {
      const rows = await sql`SELECT org_id FROM subscriptions WHERE stripe_subscription_id = ${sub.id} LIMIT 1`;
      orgId = rows[0]?.org_id;
    }
    if (orgId) {
      const priceId = sub.items?.data?.[0]?.price?.id;
      let newTier = 'pro'; // default for paid subscriptions
      if (priceId === c.env.STRIPE_PRICE_ID_ENTERPRISE) {
        newTier = 'enterprise';
      } else if (priceId === c.env.STRIPE_PRICE_ID_PRO) {
        newTier = 'pro';
      }
      await sql`
        UPDATE subscriptions
        SET plan_tier = ${newTier},
            stripe_price_id = ${priceId ?? null},
            status = 'paid',
            updated_at = NOW()
        WHERE org_id = ${orgId}
      `;
    }
  }

  // --- Handle customer.subscription.deleted → revert to free plan ---
  // Per D-15: plan reverts only on actual deletion, not on cancellation notice.
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    // Prefer metadata org_id, but fall back to DB lookup by stripe_subscription_id
    // (Stripe does not always propagate subscription_data.metadata reliably).
    let orgId = sub.metadata?.org_id;
    if (!orgId) {
      const rows = await sql`SELECT org_id FROM subscriptions WHERE stripe_subscription_id = ${sub.id} LIMIT 1`;
      orgId = rows[0]?.org_id;
    }
    if (!orgId && sub.customer) {
      const rows = await sql`SELECT org_id FROM subscriptions WHERE stripe_customer_id = ${sub.customer as string} LIMIT 1`;
      orgId = rows[0]?.org_id;
    }
    console.log('[webhook] subscription.deleted — sub.id:', sub.id, 'orgId resolved:', orgId);
    if (orgId) {
      await sql`UPDATE subscriptions SET status = 'free', plan_tier = 'free', updated_at = NOW() WHERE org_id = ${orgId}`;
    }
  }

  // Acknowledge all other event types with 200 (no DB change)
  return c.text('', 200);
});

export default webhookRoute;
