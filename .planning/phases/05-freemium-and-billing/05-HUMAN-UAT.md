---
status: partial
phase: 05-freemium-and-billing
source: [05-VERIFICATION.md]
started: 2026-04-06T01:31:41Z
updated: 2026-04-06T01:31:41Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Lock button visual state (free org at limit)
expected: When a free org has used their 1 match run for the month, the "Run Match" button is amber/locked and disabled before any attempt to click it
result: [pending]

### 2. Upgrade modal appears on 429
expected: Clicking the locked Run Match button (or receiving a 429 from the API) triggers the upgrade modal overlay with a clear upgrade CTA
result: [pending]

### 3. Stripe Checkout redirect
expected: Clicking "Upgrade" in the modal calls POST /api/billing/create-checkout, receives a Stripe Checkout URL, and redirects the browser via window.location.href
result: [pending]

### 4. Webhook plan activation end-to-end
expected: Completing a Stripe Checkout session (checkout.session.completed) updates the org's subscriptions row to status='paid' in NEON; the org can then run matches without limit
result: [pending]

### 5. Subscription cancellation end-to-end
expected: A customer.subscription.deleted webhook event reverts the org's subscriptions row to status='free' in NEON; the org is again subject to the 1 run/month limit
result: [pending]

### 6. Usage counter live refresh
expected: After a successful match run, the usage counter on the Match page updates to reflect the new count without requiring a page reload
result: [pending]

### 7. BillingPage rendering for free vs paid org
expected: Free org sees plan name, usage stats (X of 1 used), and an Upgrade CTA. Paid org sees "Paid plan — unlimited runs" with no upgrade prompt.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
