# Phase 5: Freemium and Billing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 05-freemium-and-billing
**Areas discussed:** Upgrade prompt UX, Usage counter placement, Billing page scope, Stripe portal vs checkout-only

---

## Upgrade Prompt UX

| Option | Description | Selected |
|--------|-------------|----------|
| Modal overlay | Pops up over Match page explaining the limit, Upgrade CTA. Can't be missed. | ✓ |
| Inline banner | Banner appears above results area. Less disruptive but easier to overlook. | |
| Redirect to /billing | Navigating away loses match context. | |

**User's choice:** Modal overlay
**Notes:** User specifically raised concern that a modal could be bypassed via browser DevTools to reveal results. Clarified that the 429 is returned BEFORE `matchTransfers()` executes — there are no results in the response to expose. Server-side enforcement is the security guarantee, not the modal.

---

## Pre-emptive Run Match Disable

| Option | Description | Selected |
|--------|-------------|----------|
| Disable button + show usage | If frontend knows limit is reached, disable Run Match pre-emptively. | ✓ |
| Let them click and get modal | Run Match stays active; modal appears on 429. | |

**User's choice:** Disable button + show usage (pre-emptive)

---

## Usage Counter Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Match page only | Counter in control bar next to Run Match. | ✓ |
| Billing page only | Counter on /billing. Match page has no visible usage. | |
| Both | Match page control bar AND Billing page. | |

**User's choice:** Match page only

---

## Usage Data Fetch Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| GET /api/usage on page mount | Separate endpoint, fetched when Match page loads. | ✓ |
| Piggybacked on match response | POST /match always returns usage. | |
| Included in 429 only | Usage only visible after hitting limit. | |

**User's choice:** GET /api/usage on Match page load

---

## Billing Page Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal — plan + usage + Upgrade CTA | Simple, focused. | ✓ |
| Standard — plan + usage + Stripe portal link | Adds self-serve management for paid users. | |
| Skip it — no /billing route in Phase 5 | Deferred. | |

**User's choice:** Minimal

---

## Stripe Integration Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Checkout only, admin manages via Stripe dashboard | Simple v1. No Customer Portal. | ✓ |
| Checkout + Stripe Customer Portal link | Self-serve cancel/manage from app. | |

**User's choice:** Checkout only

---

## Webhook Endpoint Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| POST /api/stripe/webhook — public, verify Stripe-Signature | Standard Stripe pattern. | ✓ |
| Separate routes per event type | More granular, more routes. | |

**User's choice:** Single public endpoint with Stripe-Signature verification

---

## Subscription Cancellation Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Immediately on cancellation webhook | Simplest. Reverts as soon as Stripe notifies. | |
| At end of billing period | Access remains paid until period ends. Fairer to users. | ✓ |

**User's choice:** At end of billing period

---

## Claude's Discretion

- Exact SQL upsert pattern for `usage_meters`
- Whether `limit` is stored per row or derived from subscription status
- Stripe Checkout session parameters (price ID, success/cancel URLs)
- Modal design details (copy, width, overlay)
- Loading/error states for usage counter
- Whether price ID lives in env vars or hardcoded

## Deferred Ideas

- Stripe Customer Portal — self-serve subscription management — v2
- Payment failure / dunning handling — v2
- Usage history log — v2
