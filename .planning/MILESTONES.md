# PharmIQ Stock Transfer — Milestones

## v1.1 — Reporting & Tiered Billing

**Shipped:** 2026-05-13
**Phases:** 11–15 (5 phases, 8 plans)
**Commits:** 86 | **Files changed:** 93 | **Lines:** +16,811 / −2,123
**Timeline:** 2026-04-15 → 2026-05-13 (28 days)
**UAT:** 9/9 passed (Phase 15)

### Delivered

Gave pharmacy managers visual insight into their dead stock position and unlocked revenue growth with 3 pricing tiers:

1. **NEON v1.1 schema migration** — cost_ex (DOUBLE PRECISION), plan_tier (NOT NULL DEFAULT 'free'), stripe_price_id columns added; existing paid→pro row migration; idempotent DDL
2. **Cost Ex parser + summary endpoint** — dead stock upload accepts optional Cost Ex column with header-level detection; GET /api/dead-stock-summary returns per-store totalUnits/totalValue/hasCostData via FILTER aggregation SQL
3. **Dead stock charts** — Recharts 3.8.1 PieChart (VIZ-01) on UploadPage showing units per store; PostMatchChart grouped bar (VIZ-02) and Net Units Recovered KPI card (VIZ-03) on MatchPage
4. **Cost Report UI** — CostReport panel with per-store dead stock $ cards, SOH $ input, dead stock % progress bar (amber 10–25%, red >25%), recoverable value KPI post-match (COST-03, COST-05)
5. **3-tier billing system** — plans.ts constants (Free/Pro/Enterprise); atomic store-gate + run-limit enforcement in match.ts; multi-price Stripe Checkout + in-place Pro→Enterprise upgrade (BILLING-08); synchronous checkout confirmation eliminating webhook race (BILLING-09); webhook idempotency via stripe_event_id; 3-tier BillingPage (UAT 9/9 ✓)

### Requirements

- 16/16 v1.1 requirements: all complete (VIZ-01..03, COST-01..05, BILLING-05..12)
- 26/26 v1 requirements: all complete (carried from v1.0)

### Archives

- `.planning/milestones/v1.1-ROADMAP.md`
- `.planning/milestones/v1.1-REQUIREMENTS.md`
- `.planning/milestones/v1.1-MILESTONE-AUDIT.md`

### Known Tech Debt at Close

- Phase 11 and Phase 15 VERIFICATION.md files missing — documentation artifacts only; Phase 11 SUMMARY confirms live NEON migration; Phase 15 UAT.md 9/9 provides sufficient evidence
- All 5 v1.1 VALIDATION.md files remain in `status: draft` — Nyquist task-level verification maps not marked during execution; no functional impact

---

## v1.0 — MVP

**Shipped:** 2026-04-13
**Phases:** 1–10 (10 phases, 18 plans)

### Delivered

Full-stack rebuild of the PharmIQ Stock Transfer tool from Django+SQLite prototype onto Cloudflare Workers + NEON Postgres + Clerk production stack:

1. Infrastructure, Clerk auth, NEON schema with RLS, authenticated API skeleton
2. Algorithm audit — Django matching logic documented with full test cases
3. Multi-store FRED CSV/XLSX upload pipeline with SheetJS, NEON bulk insert, store card grid UI
4. TypeScript matching algorithm port with months-cover cap and virtualized results table
5. Freemium billing — atomic Postgres usage counter, Stripe Checkout, webhook handler
6. PharmIQ brand design system (teal/amber/navy), dark mode, PDF export via @react-pdf/renderer
7. is_ranged schema fix — ROU uploads now store ranged status; match results show ranged-first sort
8. Phase 04 formal verification — VERIFICATION.md with evidence for all 8 MATCH/RESULTS requirements
9. Requirements and roadmap documentation sync — all 26 v1 requirements confirmed Complete
10. Schema + DX fixes — schema.sql accuracy, .dev.vars.example completeness, webhook test fixes

### Archives

- `.planning/milestones/v1.0-ROADMAP.md` (if archived)

---

*Last updated: 2026-05-13 after v1.1 milestone*
