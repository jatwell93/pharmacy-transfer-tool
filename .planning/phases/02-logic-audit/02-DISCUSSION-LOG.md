# Phase 2: Logic Audit - Discussion Log

**Date:** 2026-03-29
**Phase:** 02-logic-audit

---

## Gray Areas Selected

User selected all 3 areas: TypeScript function interface, months-cover cap scope, spec format and location.

---

## Area 1: TypeScript Function Interface

**Q: What should the matching function accept as input?**
Options: Parsed arrays / Raw CSV buffers / You decide
**Selected:** Parsed arrays (Recommended)
→ `matchTransfers(deadStock: DeadStockItem[], rouData: RouItem[], opts): Match[]` — pure computation, no I/O

**Q: What does each DeadStockItem carry in?**
Options: Match Django fields / Drop cost / You decide
**Selected:** Match Django fields (Recommended)
→ `{ sku, soh, description, cost }` — exactly what the FRED dead-stock export provides

---

## Area 2: Months-Cover Cap Scope

**Q: Should Phase 2's TypeScript function include the months-cover cap?**
Options: Include it in Phase 2 / Defer to Phase 4
**Selected:** Include it in Phase 2 (Recommended)
→ Phase 2 delivers the complete algorithm; Phase 4 wires it into the API + builds the UI

**Q: Should Phase 2 write tests for the cap formula (MATCH-03 and MATCH-04)?**
Options: Yes — full coverage / No — spec-only for cap
**Selected:** Yes — full coverage (Recommended)
→ Phase 4's planner sees cap tests already passing and focuses on the API layer

---

## Area 3: Spec Format and Location

**Q: Where should ALGORITHM-SPEC.md live?**
Options: apps/worker/src/ / .planning/phases/ / docs/ at root
**Selected:** apps/worker/src/ (Recommended)
→ Co-located with the code it describes, readable by downstream agents and human developers

**Q: What must the spec include?**
Options: All 5 required sections / Algorithm sections only
**Selected:** All 5 required sections (Recommended)
→ Sell-through filter, months-cover cap formula, ranged sort order, is_ranged parsing, NaN/missing-value edge cases — each with a worked example and Django bug noted

---

*Discussion log generated: 2026-03-29*
