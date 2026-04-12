---
phase: 10
slug: fix-schema-sql-dev-vars-example-webhook-test-ts-failure-subs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest via `@cloudflare/vitest-pool-workers` |
| **Config file** | `apps/worker/vitest.config.ts` |
| **Quick run command** | `cd apps/worker && npm test` |
| **Full suite command** | `cd apps/worker && npm test` |
| **Estimated runtime** | ~18 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npm test`
- **After every plan wave:** Run `cd apps/worker && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~18 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | schema.sql stores has store_number | — | N/A | static grep | `grep "store_number" apps/worker/src/db/schema.sql` | ❌ post-fix | ⬜ pending |
| 10-01-02 | 01 | 1 | schema.sql subscriptions DEFAULT 'free' | — | N/A | static grep | `grep "DEFAULT 'free'" apps/worker/src/db/schema.sql` | ❌ post-fix | ⬜ pending |
| 10-01-03 | 01 | 1 | .dev.vars.example has STRIPE_SECRET_KEY | — | placeholder value only | static grep | `grep "STRIPE_SECRET_KEY" apps/worker/.dev.vars.example` | ❌ post-fix | ⬜ pending |
| 10-01-04 | 01 | 1 | .dev.vars.example has STRIPE_WEBHOOK_SECRET | — | placeholder value only | static grep | `grep "STRIPE_WEBHOOK_SECRET" apps/worker/.dev.vars.example` | ❌ post-fix | ⬜ pending |
| 10-01-05 | 01 | 1 | .dev.vars.example has STRIPE_PRICE_ID | — | placeholder value only | static grep | `grep "STRIPE_PRICE_ID" apps/worker/.dev.vars.example` | ❌ post-fix | ⬜ pending |
| 10-01-06 | 01 | 1 | No regression — all 89 tests pass | — | N/A | full suite | `cd apps/worker && npm test` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

*No new test files needed — all changes are static file edits verified by grep + existing test suite.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| wrangler.jsonc comment block lists all 7 secrets | DX config | No automated check for comments | Open `apps/worker/wrangler.jsonc` and confirm 7 `wrangler secret put` lines present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 18s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
