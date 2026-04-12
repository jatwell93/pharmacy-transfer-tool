# Phase 9: docs-sync - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Close documentation drift across REQUIREMENTS.md and ROADMAP.md. Seven requirements (BILLING-01..04, BRAND-01, BRAND-02, RESULTS-02) were implemented and code-verified in Phases 5 and 6 but still show `[ ]` and Pending in documentation. Additionally, ROADMAP.md progress table rows for Phases 4–8 do not reflect their completed state.

This phase does NOT include: any new feature work, new matching logic, UI changes, or Stripe integration changes. It is purely documentation sync + one npm prerequisite to confirm the Phase 6 build gap is resolved.

</domain>

<decisions>
## Implementation Decisions

### Build Prerequisite

- **D-01:** Run `cd apps/web && npm install` before confirming build success. Phase 6 VERIFICATION.md flagged that `@react-pdf/renderer@4.4.1` is missing from `node_modules` (package-lock.json updated but install never ran). `npm run build` fails until the package is installed. Mark RESULTS-02 `[x]` only after build exits 0.

### REQUIREMENTS.md Checkbox Updates

- **D-02:** Update the following 7 requirements from `[ ]` to `[x]`:
  - `BILLING-01` — atomic Postgres usage counter (Phase 5)
  - `BILLING-02` — usage meter display (Phase 5)
  - `BILLING-03` — upgrade prompt on limit hit (Phase 5)
  - `BILLING-04` — Stripe subscription integration (Phase 5)
  - `BRAND-01` — PharmIQ brand guide compliance (Phase 6)
  - `BRAND-02` — dark mode toggle with localStorage (Phase 6)
  - `RESULTS-02` — PDF export via @react-pdf/renderer (Phase 6) — only after build passes (D-01)

### Traceability Table Corrections

- **D-03:** In the REQUIREMENTS.md traceability table, correct the Phase column for each of the 7 requirements to their actual implementation phase (not Phase 9):
  - `BILLING-01..04` → `Phase 5 — Freemium and Billing`
  - `BRAND-01`, `BRAND-02` → `Phase 6 — Brand, UI and Export`
  - `RESULTS-02` → `Phase 6 — Brand, UI and Export`
  - Change Status from `Pending` to `Complete` for all 7 rows
- **D-04:** All 26 v1 requirements should show `Complete` in the traceability table when done.

### ROADMAP.md Progress Table

- **D-05:** Update progress table rows for **all completed phases (4–8)**, not just 4–6. Phases 7 and 8 are also complete but show incorrect status. Update each row to show:
  - Phase 4: `Complete` with completion date
  - Phase 5: `Complete` with completion date
  - Phase 6: `Complete` with completion date
  - Phase 7: `Complete` with completion date
  - Phase 8: `Complete` with completion date
- **D-06:** Use dates from git log / VERIFICATION.md frontmatter for accuracy. Phase 5: 2026-04-12, Phase 6: 2026-04-12, Phase 7: 2026-04-12, Phase 8: 2026-04-12.
- **D-07:** Update plan checkbox counts in the ROADMAP phase detail sections to reflect actual completed plans (Phases 4, 5, 6 plan checkboxes may be stale).

### Claude's Discretion

- Exact completion dates where git log and VERIFICATION.md disagree — use VERIFICATION.md frontmatter as source of truth
- Whether to update Phase 9's own ROADMAP row to "Not started → In Progress" while executing
- Formatting of ROADMAP table rows (date format, plan count display)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Traceability
- `.planning/REQUIREMENTS.md` — The file being updated; contains checkboxes, traceability table, and v1/v2 requirement lists
- `.planning/ROADMAP.md` — The file being updated; contains per-phase descriptions, plan checkboxes, and the Progress table

### Phase Verification Records (source of truth for completion dates and verified status)
- `.planning/phases/05-freemium-and-billing/05-VERIFICATION.md` — Phase 5 verified 2026-04-06, score 13/13
- `.planning/phases/06-brand-ui-and-export/VERIFICATION.md` — Phase 6 verified 2026-04-12, `gaps_found` (build gap — see D-01)
- `.planning/phases/07-is-ranged-schema-fix/` — Phase 7 completion artifacts
- `.planning/phases/08-phase04-verification/08-VERIFICATION.md` — Phase 8 verified 2026-04-12, score 4/4

### Build Gap Reference
- `.planning/phases/06-brand-ui-and-export/VERIFICATION.md` §gaps — Documents the `@react-pdf/renderer` missing from node_modules; explains the `npm install` prerequisite in D-01

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No code changes in this phase — documentation only plus `npm install`

### Established Patterns
- REQUIREMENTS.md checkbox format: `- [x] **REQ-ID**: Description`
- ROADMAP.md progress table format: `| Phase name | N/N | Complete | YYYY-MM-DD |`
- Traceability table format: `| REQ-ID | Phase N — phase-name | Complete |`

### Integration Points
- `apps/web/package.json` — contains `@react-pdf/renderer@4.4.1` in dependencies (installed via `npm install`)
- `apps/web/` — working directory for `npm run build` verification

</code_context>

<specifics>
## Specific Ideas

- Build must be confirmed passing before RESULTS-02 gets its `[x]` — don't pre-mark it
- Traceability rows should point to where work actually happened (Phases 5, 6) — not the documentation sync phase
- All 26 requirements should show `Complete` at the end — that's the success signal

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-docs-sync*
*Context gathered: 2026-04-12*
