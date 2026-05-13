# PharmIQ Stock Transfer — Retrospective

## Milestone: v1.1 — Reporting & Tiered Billing

**Shipped:** 2026-05-13
**Phases:** 5 | **Plans:** 8

### What Was Built

- Phase 11: Idempotent NEON v1.1 schema migration — cost_ex, plan_tier, stripe_price_id columns; paid→pro row migration
- Phase 12: Cost Ex parser with header-level absence detection + GET /api/dead-stock-summary FILTER aggregation endpoint
- Phase 13: Recharts 3.8.1 dead stock pie chart (VIZ-01) on UploadPage + PostMatchChart grouped bar (VIZ-02) + Net Units Recovered KPI (VIZ-03) on MatchPage
- Phase 14: CostReport panel — per-store $ cards, SOH % progress bar with amber/red benchmarks, recoverable value KPI
- Phase 15: 3-tier billing system — plans.ts constants, match.ts store gate + atomic run counter, billing.ts multi-price checkout + in-place upgrade + portal, webhook idempotency, 3-tier BillingPage (UAT 9/9 ✓)

### What Worked

- **TDD discipline on backend:** Phase 12 and Phase 14 backend work used RED → GREEN cycles, resulting in 109+ tests passing and zero regressions introduced across the entire test run
- **FILTER aggregation SQL:** Single-query `SUM(cost_ex * soh) FILTER (WHERE ...)` approach for the summary endpoint was elegant and performant — no N+1 queries, clean LEFT JOIN preserves stores with no dead stock
- **Synchronous checkout confirmation pattern:** Designing `GET /billing/checkout-session/:sessionId` as a synchronous fetch on the success redirect page completely eliminated the webhook race condition that would have caused upgrade UX issues (BILLING-09) — this was a proactive architectural decision that paid off immediately in UAT
- **Idempotency via stripe_event_id deduplication table:** The `INSERT ON CONFLICT DO NOTHING RETURNING id` pattern was clean and reliable — same pattern could be reused for any webhook event type
- **UAT as VERIFICATION substitute:** Phase 15's UAT.md with 9 human-verified tests covering all billing scenarios provided stronger evidence than many formal VERIFICATION.md files — practical verification over documentation ceremony

### What Was Inefficient

- **Stale checkboxes carried into milestone close:** REQUIREMENTS.md had 10 stale `[ ]` checkboxes (COST-03, COST-05, BILLING-05..12) that were implemented but not marked complete during execution. Required manual fix before archiving. Root cause: requirement checkbox updates weren't included in the "plan complete" checklist for Phases 14 and 15.
- **Missing VERIFICATION.md files for Phases 11 and 15:** Both phases had strong evidence (SUMMARY + live NEON output for Phase 11; UAT.md 9/9 for Phase 15) but lacked the formal VERIFICATION.md artifact. Minor ceremony gap, no functional impact.
- **Nyquist VALIDATION.md files never progressed from draft:** All 5 v1.1 VALIDATION.md files were created but never had per-task verification maps marked green. Adds noise to audit outputs.
- **Windows rollup optional dep issue:** `@rollup/rollup-win32-x64-msvc` missing caused `npm run build` to fail on Windows during Phase 13 — pre-existing npm bug, not caused by plan changes. A Vite config adjustment or `npm install --force` would have resolved it.

### Patterns Established

- **hasCostData as explicit signal** (not `totalValue === 0`): When a boolean flag can be computed from the DB, use it explicitly rather than inferring from derived values. Cleaner COST-04 implementation.
- **Prop-driven components for cost reporting:** CostReport receives all data as props (no internal hook calls) — testable in isolation, no duplicate API requests when mounted alongside other hooks
- **`isFinite(sohValue) && sohValue > 0` guard for user numeric input:** Structurally prevents Infinity% and NaN% before they can reach the render path
- **`upgrade_to` field in 429/403 responses:** Including the target tier in error responses let the frontend upgrade modal show tier-specific copy without client-side inference logic

### Key Lessons

- **Update requirement checkboxes immediately when a plan completes** — don't defer to a separate docs cleanup phase. One checkbox update per plan is trivial; 10 checkboxes at milestone close is friction.
- **Design for webhook race conditions upfront** — async webhooks are inherently unreliable for immediate UX feedback. Synchronous confirmation endpoints are worth the extra route.
- **UAT.md as first-class verification artifact** — for complex user flows (billing, upgrades, portal), a structured UAT with pass/fail per test case is more valuable than code-path verification alone.
- **Recharts on Windows Vite projects** — check for `@rollup/rollup-win32-x64-msvc` optional dep before running the first build after installing recharts on Windows.

### Cost Observations

- Model mix: primarily Claude Sonnet 4.6 (all phases)
- Sessions: ~8–10 across 5 phases over 28 days
- Notable: Schema migration (Phase 11) was the fastest phase (~8 minutes); Phase 15 3-tier billing was the most complex (2 plans, 36 tests, 7 files modified)

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.1 |
|--------|------|------|
| Phases | 10 | 5 |
| Plans | 18 | 8 |
| Requirements | 26 | 16 |
| Timeline | ~16 days | 28 days |
| Test suite growth | 89 tests | 109+ tests |
| UAT | Informal | Formal (9/9 Phase 15) |
| Docs tech debt at close | High (gap closure phases 7–9) | Low (stale checkboxes only) |

**Trend:** Phase count and complexity per phase increasing as the platform matures. v1.1 phases were deeper (billing, charts) vs v1.0 phases (infrastructure, algorithm). UAT formality improved significantly.
