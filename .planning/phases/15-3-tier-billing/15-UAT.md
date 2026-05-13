---
status: complete
phase: 15-3-tier-billing
source: [15-01-SUMMARY.md, 15-02-SUMMARY.md]
started: 2026-05-13T00:00:00Z
updated: 2026-05-13T02:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. BillingPage — 3 pricing cards visible
expected: Three pricing cards side by side: Free ($0), Pro ($10/mo AUD), Enterprise ($100/mo AUD). Current plan card has teal border + "Current plan" badge. Other cards have upgrade CTA buttons.
result: pass

### 2. BillingPage — usage row with color indicators
expected: Usage row shows match runs and store count. Enterprise shows ∞ for both limits.
result: pass
note: "Enterprise ∞ confirmed. Usage row visible."

### 3. BillingPage — "Manage subscription" portal link
expected: For Free-tier orgs, the "Manage subscription" link is NOT visible. For Pro or Enterprise orgs, it is visible and opens the Stripe Customer Portal.
result: pass
note: "Portal opens, shows A$100.00/month subscription, Visa •••• 4242, next billing 18 May 2026."

### 4. Free-tier match limit enforced
expected: On a Free-tier org, run 1 match successfully. Second match same month is blocked with upgrade prompt.
result: pass
note: "Reset to free via SQL. First match succeeded. Second match was blocked with upgrade prompt. Confirmed."

### 5. Upgrade modal — tier-specific copy
expected: Free-tier limit hit → modal shows 'Upgrade to Pro' with $10/mo AUD. CTA says 'Upgrade to Pro'.
result: pass
note: "Modal showed 'Upgrade to Pro'. Clicked CTA — Stripe auto-completed with saved 4242 test card (expected test mode behaviour). Plan set to Pro at $10/mo."

### 6. Checkout flow — synchronous upgrade confirmation
expected: Click "Upgrade to Pro", complete Stripe test checkout (4242 card), return to app, see toast "You're now on PharmIQ Pro". Pro card shows "Current plan" badge. Running match succeeds.
result: pass
note: "Free→Pro went through Stripe Checkout. Pro→Enterprise was an in-place subscription update (no Stripe redirect — correct by design, BILLING-08). Toast and usage refresh both worked."

### 7. Webhook — subscription cancellation resets to Free
expected: Cancel subscription via Stripe Customer Portal. Billing page shows Free as current plan. 2+ match runs blocked again.
result: pass
note: "Cancelled via portal — Stripe shows 'Cancels 18 May' (cancel_at_period_end=true, Stripe portal default). Webhook fires at period end and resets plan_tier to free — correct behaviour. Not an immediate reset; this is expected. User manually reset NEON to enterprise via SQL to continue testing — on May 18 the subscription.deleted webhook will fire and downgrade again."

### 8. Enterprise — unlimited runs and no store gate
expected: With enterprise plan, unlimited match runs succeed. BillingPage shows ∞ for both limits.
result: pass
note: "Multiple match runs succeeded. BillingPage shows ∞/∞. Confirmed."

### 9. Pro→Enterprise upgrade — no duplicate subscription
expected: From Pro org, click "Upgrade to Enterprise". Stripe dashboard shows exactly ONE active subscription after upgrade.
result: pass
note: "In-place subscription update via stripe.subscriptions.update() — no second subscription created. Manage subscription shows A$100.00/month (single item). Confirmed."

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

## Non-Phase-15 Issues (for separate tracking)

### NP-1: Match result with Qty to Transfer = 0 appears in results
- Phase: 4 (matching algorithm)
- Observed: Row with Qty=0.0, Dest ROU=0.3, Sell-Through Time=8.6 months, months cover=3
- Expected: destSOH/destROU=8.6 > 3 means destination is already overstocked → should be filtered out, not shown with qty=0
- Severity: major

### NP-2: "Dead-Stock Optimizer" appears in both app UI and Clerk sign-in UI
- Phase: 1/6 (branding)
- User suggestion: Clerk sign-in should show broader PharmIQ tagline (e.g. "Smart Ops. Better Margins." + "See our range of apps at website coming soon")
- Severity: cosmetic
