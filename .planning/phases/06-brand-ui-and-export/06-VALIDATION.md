---
phase: 6
slug: brand-ui-and-export
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (via Create React App) |
| **Config file** | none — CRA built-in |
| **Quick run command** | `cd dead-stock-tranfer-app && npm test -- --watchAll=false --passWithNoTests` |
| **Full suite command** | `cd dead-stock-tranfer-app && npm test -- --watchAll=false` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd dead-stock-tranfer-app && npm test -- --watchAll=false --passWithNoTests`
- **After every plan wave:** Run `cd dead-stock-tranfer-app && npm test -- --watchAll=false`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | BRAND-01 | — | N/A | visual/manual | inspect DOM for CSS variables | ✅ existing | ⬜ pending |
| 6-01-02 | 01 | 1 | BRAND-01 | — | N/A | unit | `npm test -- --watchAll=false` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 1 | BRAND-02 | — | localStorage read-only (no XSS) | unit | `npm test -- --watchAll=false` | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 2 | RESULTS-02 | — | PDF contains only sanitized data | manual | visual inspection of PDF output | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `dead-stock-tranfer-app/src/App.test.js` — stubs for BRAND-01, BRAND-02
- [ ] Theme toggle test: renders with `.dark` class when localStorage theme = 'dark'
- [ ] Brand color test: CSS variables present in computed style

*Existing CRA test infrastructure covers scaffolding; no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF export contains full results table | RESULTS-02 | Binary file output, visual check required | Click Export PDF, open file, verify all match rows present |
| Brand colors render correctly | BRAND-01 | Visual/design check | Open app, inspect palette against spec (#0F766E, #D97706, #0F172A) |
| Dark mode FOUC prevention | BRAND-02 | Requires browser render timing | Hard reload page with dark preference set; verify no flash |
| Dark mode persists across sessions | BRAND-02 | Requires browser session lifecycle | Set dark, close tab, reopen — verify dark persists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
