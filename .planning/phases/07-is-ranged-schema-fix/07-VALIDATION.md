---
phase: 7
slug: is-ranged-schema-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `apps/worker/vitest.config.ts` |
| **Quick run command** | `cd apps/worker && npm test -- --reporter=verbose` |
| **Full suite command** | `cd apps/worker && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/worker && npm test -- --reporter=verbose`
- **After every plan wave:** Run `cd apps/worker && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | MATCH-06 | — | N/A | unit | `cd apps/worker && npm test -- parser.test.ts` | ✅ (new tests in existing file) | ⬜ pending |
| 7-01-02 | 01 | 1 | MATCH-05, MATCH-06 | — | N/A | migration | manual — NEON SQL editor | ❌ manual step | ⬜ pending |
| 7-01-03 | 01 | 1 | MATCH-06 | — | N/A | integration | `cd apps/worker && npm test -- upload.test.ts` | ✅ (new tests in existing file) | ⬜ pending |
| 7-01-04 | 01 | 1 | MATCH-05 | — | N/A | integration | `cd apps/worker && npm test -- match.test.ts` | ✅ (new tests in existing file) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. All new tests are additions to existing test files (`parser.test.ts`, `upload.test.ts`, `match.test.ts`) — no new test files needed.

*Wave 0 gap: None.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `ALTER TABLE rou_data ADD COLUMN is_ranged BOOLEAN DEFAULT false` applied to live NEON | MATCH-05, MATCH-06 | DDL requires `neondb_owner` role; Worker uses `pharmiq_app` (non-DDL) | Run via NEON SQL editor or `psql` with `neondb_owner` credentials; verify with `\d rou_data` showing `is_ranged boolean` column |

---

## Pre-existing Failures (Not Phase 7 Scope)

`webhook.test.ts > returns 200 and reverts subscriptions to free on customer.subscription.deleted` — fails with 500 response. Pre-existing before Phase 7. Do not treat as a Phase 7 regression.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
