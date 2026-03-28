---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (Worker) + Playwright (E2E Pages) |
| **Config file** | `apps/worker/vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npm run test --prefix apps/worker` |
| **Full suite command** | `npm run test --prefix apps/worker && npx playwright test --project=chromium` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --prefix apps/worker`
- **After every plan wave:** Run `npm run test --prefix apps/worker && npx playwright test --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | AUTH-01 | unit | `npm run test --prefix apps/worker` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | AUTH-02 | unit | `npm run test --prefix apps/worker` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | AUTH-03 | unit | `npm run test --prefix apps/worker` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | AUTH-01 | e2e | `npx playwright test --project=chromium` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/worker/src/__tests__/auth.test.ts` — stubs for AUTH-01, AUTH-02, AUTH-03 (401/403 cases)
- [ ] `apps/worker/vitest.config.ts` — vitest config with miniflare environment
- [ ] `e2e/auth.spec.ts` — Playwright stub for sign-in flow (AUTH-01)

*Existing infrastructure covers nothing — new monorepo, Wave 0 must install test tooling.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clerk sign-in redirects to dashboard | AUTH-01 | Requires live Clerk app + browser session | Open /sign-in in browser, sign in with Google, verify redirect to / |
| NEON RLS blocks cross-org rows | AUTH-02 | Requires two Clerk orgs + NEON SQL access | Create two orgs, insert row for org-A, verify org-B query returns empty |
| JWT with no org returns 403 | AUTH-03 | Requires Clerk user without org membership | Create user with no org, call /api/health, verify 403 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
