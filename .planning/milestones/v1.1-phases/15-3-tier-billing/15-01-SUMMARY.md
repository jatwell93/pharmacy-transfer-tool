---
plan: 15-01
phase: 15-3-tier-billing
status: completed
started: 2026-04-22
completed: 2026-04-22
self_check: PASSED
---

## What Was Built

3-tier billing backend for PharmIQ Stock Transfer. Three atomic commits covering all tasks.

## Key Files

### key-files
created:
  - apps/worker/src/lib/plans.ts
modified:
  - apps/worker/src/types.ts
  - apps/worker/src/routes/match.ts
  - apps/worker/src/routes/billing.ts
  - apps/worker/src/routes/webhook.ts
  - apps/worker/src/db/schema.sql
  - apps/worker/src/__tests__/billing.test.ts
  - apps/worker/src/__tests__/webhook.test.ts

## Task Outcomes

### Task 1: plans.ts, types.ts, match.ts
- `lib/plans.ts`: `PlanTier` type + `PLAN_LIMITS` constant (free: 1/3, pro: 10/10, enterprise: ∞/∞)
- `types.ts`: added `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` to `Env`
- `match.ts`: reads `plan_tier` from subscriptions (not legacy `status`), enforces match-run limit atomically via `UPDATE ... WHERE count < limit RETURNING count`, store-count gate via `COUNT(DISTINCT store_id)`, both 429 and 403 include `upgrade_to` field; enterprise bypasses all limits; backward compat maps `'paid'` → `'pro'`

### Task 2: billing.ts full rewrite
- `GET /usage`: returns `{ count, limit, plan_tier, store_count }` — reads `plan_tier` from subscriptions, `COUNT(DISTINCT store_id)` from rou_data, limit is `-1` for enterprise (Infinity)
- `POST /billing/create-checkout`: accepts `{ tier }` body, selects `STRIPE_PRICE_ID_PRO` or `STRIPE_PRICE_ID_ENTERPRISE`, detects existing subscription (BILLING-08 — Pro→Enterprise avoids duplicate subscription by passing existing `customer` to Stripe), stores `stripe_customer_id` before redirect, includes `plan_tier` in session metadata
- `GET /billing/checkout-session/:sessionId`: synchronous checkout confirmation (BILLING-09) — retrieves session from Stripe, checks `payment_status === 'paid'`, upserts `plan_tier` into subscriptions, returns `{ plan_tier }`. Eliminates webhook timing race on success redirect.
- `POST /billing/create-portal-session`: looks up `stripe_customer_id`, returns Stripe Customer Portal URL or 400 if no subscription

### Task 3: webhook.ts + schema.sql
- `schema.sql`: added `processed_webhook_events` table with `stripe_event_id UNIQUE`, index, permissive RLS policy (`webhook_all FOR ALL USING (true)`) so non-RLS neon() connection can INSERT, grant to pharmiq_app
- `webhook.ts`: idempotency guard via `INSERT INTO processed_webhook_events ON CONFLICT DO NOTHING RETURNING id` — uses direct `sql` tag (no `set_config`); returns 200 immediately if duplicate
- `checkout.session.completed`: now writes `plan_tier` from session metadata alongside `status='paid'`
- `customer.subscription.updated` (new): resolves orgId from metadata or DB fallback, maps price ID to tier via `STRIPE_PRICE_ID_PRO`/`STRIPE_PRICE_ID_ENTERPRISE`, updates `plan_tier` and `stripe_price_id`
- `customer.subscription.deleted`: now resets both `status='free'` and `plan_tier='free'`

## Test Results

36 tests across 8 suites — all passed.
- `billing.test.ts`: covers /usage (plan_tier, store_count, all 3 tiers), create-checkout (tier routing, BILLING-08 Pro→Enterprise upgrade, stripe_customer_id storage, metadata), checkout-session confirm (BILLING-09, 402 on unpaid), create-portal-session (200 with URL, 400 no customer)
- `webhook.test.ts`: covers signature validation, checkout.session.completed (plan_tier in upsert), subscription.deleted (plan_tier='free'), subscription.updated (enterprise + pro price mapping, metadata fallback), idempotency (duplicate returns 200 with no DB side effects, dedupe uses direct sql tag not set_config)

## Deviations

None. Implemented exactly per plan spec.
