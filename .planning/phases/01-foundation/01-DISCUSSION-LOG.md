# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 01-foundation
**Areas discussed:** Repo structure, NEON schema scope, Clerk setup, Authenticated shell UI

---

## Repo Structure

| Option | Description | Selected |
|--------|-------------|----------|
| New apps/ monorepo | `apps/worker/` + `apps/web/` alongside existing prototype dirs | ✓ |
| Replace existing dirs | Rename and rebuild in-place, archive old code | |
| Root-level flat structure | Worker at root, `pages/` dir for frontend | |

**User's choice:** New `apps/` monorepo — existing prototype directories stay for reference.

---

## NEON Schema Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All tables upfront | All 6 phases of tables in Phase 1 with RLS | ✓ |
| Phase 1 skeleton only | Just `orgs` table now, future phases add their own | |

**User's choice:** All tables for all 6 phases in Phase 1 — full schema upfront, no future migrations.

---

## Clerk Setup

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated Clerk app | Separate from companion app, own keys/JWT templates | ✓ |
| Reuse companion app instance | Shared Clerk app, new JWT template only | |

**User's choice:** New dedicated Clerk application for stock transfer.

**Social providers:**

| Option | Selected |
|--------|----------|
| Google | ✓ |
| Microsoft | ✓ |
| Email only (no social) | ✓ (email + password as third option) |

**User's choice:** All three — Google, Microsoft, and email + password.

---

## Authenticated Shell UI

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal — Clerk components only | Unstyled `<SignIn />`, plain 'you're in' placeholder | |
| Branded shell + nav skeleton | PharmIQ colours + sidebar with disabled nav stubs | ✓ |
| No UI in Phase 1 | Pure infra, no Pages app, test via curl | |

**User's choice:** Branded shell — PharmIQ teal/amber/navy, Space Grotesk, sidebar with Upload/Match/Billing (disabled) + Settings + Sign out.

**Nav items:**

| Option | Description | Selected |
|--------|-------------|----------|
| Roadmap-driven stubs | Upload, Match, Billing (disabled) + Settings + Sign out | ✓ |
| Minimal — sign out only | No nav items until features are built | |

**User's choice:** Roadmap-driven stubs — sidebar pre-wired to future phase features, all disabled until built.

---

## Claude's Discretion

- React component structure within `apps/web/`
- Hono middleware composition and error shapes
- `@neondatabase/serverless` HTTP driver (vs Hyperdrive — deferred per STATE.md)
- Wrangler binding names for secrets
- NEON column types, indexes, constraint names
- Clerk JWT verification approach in Worker

## Deferred Ideas

None.
