// FILE: apps/worker/src/routes/webhook.ts
// This file defines the Stripe webhook handler for the PharmIQ Stock Transfer Worker.
// POST /stripe/webhook — PUBLIC route (no Clerk auth). Verifies Stripe-Signature header
// using constructEventAsync (async WebCrypto required for Cloudflare Workers).
//
// Handled events (BILLING-04):
//   checkout.session.completed  → set org subscriptions.status to 'paid'
//   customer.subscription.deleted → set org subscriptions.status to 'free'
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

  // --- Handle checkout.session.completed → activate paid plan ---
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orgId = session.metadata?.org_id;
    if (orgId) {
      const claims = JSON.stringify({ org_id: orgId });
      await sql.transaction((tx) => [
        tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
        tx`INSERT INTO subscriptions (org_id, stripe_customer_id, stripe_subscription_id, status)
           VALUES (${orgId}, ${session.customer as string}, ${session.subscription as string}, 'paid')
           ON CONFLICT (org_id) DO UPDATE
           SET stripe_customer_id = EXCLUDED.stripe_customer_id,
               stripe_subscription_id = EXCLUDED.stripe_subscription_id,
               status = 'paid',
               updated_at = NOW()`,
      ]);
    }
  }

  // --- Handle customer.subscription.deleted → revert to free plan ---
  // Per D-15: access remains paid until billing period ends;
  // plan reverts only on actual deletion, not on cancellation notice.
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const orgId = sub.metadata?.org_id;
    if (orgId) {
      const claims = JSON.stringify({ org_id: orgId });
      await sql.transaction((tx) => [
        tx`SELECT set_config('request.jwt.claims', ${claims}, true)`,
        tx`UPDATE subscriptions SET status = 'free', updated_at = NOW()
           WHERE org_id = ${orgId}`,
      ]);
    }
  }

  // Acknowledge all other event types with 200 (no DB change)
  return c.text('', 200);
});

export default webhookRoute;
