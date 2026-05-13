# Phase 15: 3-Tier Billing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 15-3-tier-billing
**Areas discussed:** BillingPage redesign, Customer Portal integration, Tier-aware upgrade copy, Checkout success redirect UX

---

## BillingPage Redesign

| Option | Description | Selected |
|--------|-------------|----------|
| Price + limits only | Name, price/mo, match run limit, store limit. Clean and scannable. | ✓ |
| Price + limits + feature bullets | Marketing-style with 3-4 feature lines per card | |
| Price + limits + usage stats inline | Embed current usage inside current plan card | |

**User's choice:** Price + limits only

---

| Option | Description | Selected |
|--------|-------------|----------|
| Teal border + 'Current plan' badge | 2px teal border and badge at top of active card | ✓ |
| Filled teal background on current card | Teal background, white text — high contrast | |
| Teal border only, no badge | Minimal — just the border | |

**User's choice:** Teal border + 'Current plan' badge

---

| Option | Description | Selected |
|--------|-------------|----------|
| Upgrade CTA on each card below the limits | Free: 'Upgrade to Pro', Pro: 'Upgrade to Enterprise', Enterprise: disabled | ✓ |
| Single action area below cards | Cards display-only, buttons in a separate row | |
| Cards are display-only, no CTAs | Upgrade prompts only at match time | |

**User's choice:** Upgrade CTA on each card below the limits

---

| Option | Description | Selected |
|--------|-------------|----------|
| Separate usage summary above the pricing cards | Compact row at top: "Match runs: 3/10 this month • Stores: 7/10" | ✓ |
| Embedded in the current plan card | Stats inside highlighted card only | |
| Below the pricing cards | Footer-style summary | |

**User's choice:** Separate usage summary above the pricing cards

---

## Customer Portal Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Below pricing cards, paid users only | Text link/button only when plan_tier = 'pro' or 'enterprise' | ✓ |
| Inside the current plan card, always visible | Always visible but functional only for paid users | |
| On the current plan card, paid users only | Link inside current-plan card for paid users | |

**User's choice:** Below pricing cards, paid users only

---

| Option | Description | Selected |
|--------|-------------|----------|
| New Worker endpoint POST /billing/create-portal-session | Worker creates portal session with stripe_customer_id, returns URL | ✓ |
| Hardcoded Stripe Portal URL | Shareable URL per account — not scoped to specific customer | |

**User's choice:** New Worker endpoint POST /billing/create-portal-session

---

## Tier-Aware Upgrade Copy

| Option | Description | Selected |
|--------|-------------|----------|
| Backend includes upgrade_to hint in 429/403 response body | Worker returns { error: '...', upgrade_to: 'pro' \| 'enterprise' } | ✓ |
| Frontend infers from usage.plan | 'free' → Pro, 'pro' → Enterprise — no new backend field | |
| Two separate error messages, frontend pattern-matches | Message string differs per tier | |

**User's choice:** Backend includes upgrade_to hint in 429/403 response body

---

| Option | Description | Selected |
|--------|-------------|----------|
| Title changes, single checkout button per tier | Modal title and copy change based on upgrade_to; CTA calls create-checkout with target tier | ✓ |
| Generic 'You've reached your limit' modal, links to BillingPage | Generic copy, link to /billing | |
| Separate modals for match-run limit vs store-count limit | Different modals per limit type | |

**User's choice:** Title changes, single checkout button per tier

---

## Checkout Success Redirect UX

| Option | Description | Selected |
|--------|-------------|----------|
| BillingPage renders with a loading spinner in place of plan cards | "Confirming your upgrade..." while fetching session | ✓ |
| Redirect to BillingPage immediately, fetch runs in background | Instant render, plan updates 1-2s later | |
| Show a full-page success screen, then redirect | Dedicated success route | |

**User's choice:** BillingPage renders with loading spinner

---

| Option | Description | Selected |
|--------|-------------|----------|
| Show error message with retry link | "Upgrade confirmation failed — please refresh or contact support." | ✓ |
| Fall back silently to current plan display | Render as if checkout didn't happen | |
| Redirect to BillingPage without checkout param, rely on webhook | Strip param, let webhook sync async | |

**User's choice:** Show error message with retry link

---

| Option | Description | Selected |
|--------|-------------|----------|
| Toast notification: "You're now on PharmIQ Pro" | Brief toast (3s, dismissable) after plan confirmed | ✓ |
| No toast — new plan highlighting is enough | Card highlight communicates the upgrade | |
| Success banner inside BillingPage | Green dismissable banner at top of page | |

**User's choice:** Toast notification

---

## Claude's Discretion

- Toast implementation details (local state + setTimeout vs library)
- Card layout dimensions and responsive behaviour
- Loading spinner style
- Error state styling for session fetch failure
