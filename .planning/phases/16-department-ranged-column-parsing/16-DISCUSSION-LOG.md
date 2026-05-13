# Phase 16: Department + Ranged Column Parsing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 16-Department + Ranged Column Parsing
**Areas discussed:** Department header aliases, Ranged column display, Column placement, Schema migration

---

## Department Header Aliases

| Option | Description | Selected |
|--------|-------------|----------|
| "Department" (standard) | Most common FRED export label. Aliases: "Department", "Dept", "Dept.", "Drug Dept", "Product Department". | ✓ |
| "Category" variant | Some FRED configs export "Category", "Product Category", "Drug Category", "Cat". | |
| Both — include all | Include aliases for both Department and Category variants. | |
| I'm not sure — check a real export | Open a FRED dead stock export and look at the actual column header. | |

**User's choice:** "Department" (standard)
**Notes:** User confirmed FRED exports use "Department" as the column header. Department aliases locked to: "Department", "Dept", "Dept.", "Drug Dept", "Product Department".

| Option | Description | Selected |
|--------|-------------|----------|
| Empty string "" | Consistent with how Description behaves when absent. | ✓ |
| null | More semantically correct — explicitly signals "not provided". | |
| "—" placeholder | Always shows something in the column. | |

**User's choice:** Empty string ""
**Notes:** Missing department column → `department: ""`. Consistent with existing `description` fallback behaviour.

---

## Ranged Column Display

| Option | Description | Selected |
|--------|-------------|----------|
| Colored pill badge | Teal "Ranged" pill / muted grey "Non-ranged". Scannable, brand-consistent. | |
| Checkmark / dash | "✓" for ranged, "—" for non-ranged. Compact. | ✓ |
| "Yes" / "No" text | Plain text. Simple but wider. | |

**User's choice:** Checkmark / dash
**Notes:** `✓` / `—` characters — no icon library import needed.

| Option | Description | Selected |
|--------|-------------|----------|
| Main row only | Ranged status belongs to the source SKU, not the destination. Sub-rows stay compact. | ✓ |
| Show in sub-rows too | Same value repeated in every sub-row — redundant. | |

**User's choice:** Main row only
**Notes:** Ranged appears only in main result rows. Sub-match rows leave the Ranged cell empty.

---

## Column Placement

| Option | Description | Selected |
|--------|-------------|----------|
| After Description | SKU \| Description \| Department \| Ranged \| Source Store \| Dest Store \| Qty \| ROU \| Months \| Sell-Through | ✓ |
| After Source Store | SKU \| Description \| Source Store \| Dest Store \| Department \| Ranged \| ... | |
| At the end | ... \| Sell-Through \| Department \| Ranged | |

**User's choice:** After Description
**Notes:** Groups all item identity fields (SKU, Description, Department, Ranged) together for at-a-glance scanning.

| Option | Description | Selected |
|--------|-------------|----------|
| 1fr (flex, same as Description) | Free-text dept names truncate with ellipsis. | ✓ |
| 140px (fixed) | Predictable width, prevents layout shift. | |
| You decide | Claude picks best fit. | |

**User's choice:** 1fr (flex)
**Notes:** Department column = `1fr`. Ranged column = `60px` fixed (Claude's discretion — single character content).

---

## Schema Migration

| Option | Description | Selected |
|--------|-------------|----------|
| Update schema.sql + migration comment in upload.ts | Follows Phase 7/10 pattern. Manual ALTER TABLE in NEON SQL editor before deploy. | ✓ |
| Separate migration file (migrations/016-add-department.sql) | Cleaner long-term but new convention not used yet. | |
| IF NOT EXISTS guard in upload route at startup | No manual step but adds DDL to hot path; app role lacks DDL rights. | |

**User's choice:** Update schema.sql + add migration comment in upload.ts
**Notes:** Follows established Phase 7/10 pattern. Must be run as `neondb_owner`, not `pharmiq_app`.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — add both isRanged and department to MatchResult | is_ranged already in DB; one query change, no additional migration. | ✓ |
| Only department needs migration work | Would defer TABLE-02 (isRanged in results). | |

**User's choice:** Yes — both isRanged and department added to MatchResult

---

## Claude's Discretion

- Ranged column fixed width: `60px` — single character (`✓` or `—`) needs no more width.
- Grid template string: `grid-cols-[36px_1fr_1.2fr_1fr_60px_1fr_1fr_100px_80px_100px_100px]` — Claude to determine exact proportions based on content.

## Deferred Ideas

- Phase 17 will add filter controls for Ranged and Department — column definitions here must be stable first.
- Sub-match row Department/Ranged display (if needed): requires `parentDepartment` and `parentIsRanged` on `FlatItem` union type — deferred to Phase 17 or later.
