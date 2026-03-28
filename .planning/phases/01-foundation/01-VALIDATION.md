---
phase: 1
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (Worker) |
| **Config file** | `apps/worker/vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npm run test --prefix apps/worker` |
| **Full suite command** | `npm run test --prefix apps/worker` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --prefix apps/worker`
- **After every plan wave:** Run `npm run test --prefix apps/worker`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | AUTH-01 | unit | `npm run test --prefix apps/worker` | W0 | pending |
| 1-01-02 | 01 | 1 | AUTH-02 | unit | `npm run test --prefix apps/worker` | W0 | pending |
| 1-01-03 | 01 | 1 | AUTH-03 | unit | `npm run test --prefix apps/worker` | W0 | pending |
| 1-02-01 | 02 | 1 | AUTH-01 | manual | Plan 01-03 Task 2 checkpoint | n/a | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `apps/worker/src/__tests__/auth.test.ts` — stubs for AUTH-01, AUTH-02, AUTH-03 (401/403 cases)
- [ ] `apps/worker/vitest.config.ts` — vitest config with miniflare environment

*Note: E2E Playwright tests for AUTH-01 (sign-in flow) are not included in Wave 0. AUTH-01 is a live Clerk integration that requires browser + real Clerk app — it is covered by the manual checkpoint in Plan 01-03 Task 2, which verifies the full sign-in flow in-browser. Adding a Playwright stub would require Clerk test credentials and a running dev server, which is outside the scope of Phase 1 scaffolding.*

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
