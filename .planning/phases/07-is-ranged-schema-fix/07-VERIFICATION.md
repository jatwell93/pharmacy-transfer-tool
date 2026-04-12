---
phase: 07-is-ranged-schema-fix
verified: 2026-04-12T16:36:00Z
status: passed
score: 7/7 must-haves verified
---

# Phase 7: Fix is_ranged Schema and Pipeline Verification Report

**Phase Goal:** Fix the INT-01 architectural gap — rou_data has no is_ranged column, so RouItem.isRanged is always false and matchTransfers ranged-first sort never activates. Close MATCH-05 (results sorted ranged-first) and MATCH-06 (is_ranged parsing accepts all truthy variants end-to-end via the ROU pipeline).
**Verified:** 2026-04-12T16:36:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | parseRouFile produces RouRow objects with isRanged:true when the Ranged column contains 'checked', 'yes', 'true', '1', or 'y' (case-insensitive) | VERIFIED | parser.ts lines 237-241 use RANGED_TRUTHY.has() with lowercase; parser.test.ts lines 158-182 assert all 5 truthy variants produce true |
| 2 | parseRouFile produces RouRow objects with isRanged:false when the Ranged column is absent or contains any other value | VERIFIED | parser.ts line 241 returns false if rangedCol===undefined; parser.test.ts lines 184-190 assert absent column defaults false; test lines 179-181 assert "", "no", "false" produce false |
| 3 | ROU upload route stores is_ranged for each row in rou_data — not hardcoded false | VERIFIED | upload.ts line 124: `const ranged = rows.map((r) => r.isRanged)`; line 130: INSERT column list includes is_ranged; line 136: `unnest(${ranged}::boolean[])` |
| 4 | POST /api/match constructs RouItem objects with isRanged read from rou_data.is_ranged — not hardcoded false | VERIFIED | match.ts line 109: `is_ranged: boolean` in withOrgContext type; line 116: `rd.is_ranged` in SELECT; line 131: `isRanged: r.is_ranged` — no `isRanged: false` hardcode remains |
| 5 | When rou_data rows include is_ranged:true, matchTransfers ranged-first sort activates and ranged items appear before non-ranged items regardless of ROU value | VERIFIED | match.test.ts lines 214-249: Store C (ranged, ROU=3) sorts as bestMatch before Store B (non-ranged, ROU=5); test passes in full suite run (88 passing) |
| 6 | rou_data table definition in schema.sql includes is_ranged BOOLEAN NOT NULL DEFAULT false | VERIFIED | schema.sql line 35: `is_ranged   BOOLEAN NOT NULL DEFAULT false` inside rou_data CREATE TABLE block |
| 7 | Full test suite passes: cd apps/worker && npm test exits 0 (excluding pre-existing webhook.test.ts failure) | VERIFIED | Suite output: 88 passing, 1 failing (webhook.test.ts "returns 200 and reverts subscriptions to free on customer.subscription.deleted" — pre-existing, unrelated to Phase 7) |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/worker/src/lib/parser.ts` | RouRow interface with isRanged field; parseRouFile with RANGED_TRUTHY parsing | VERIFIED | Line 16: `isRanged: boolean` in RouRow. Lines 237-241: RANGED_TRUTHY.has() call. Line 243: result.push includes isRanged |
| `apps/worker/src/routes/upload.ts` | ROU UNNEST INSERT including is_ranged column | VERIFIED | Line 124: const ranged array extracted. Line 130: is_ranged in INSERT column list. Line 136: unnest(${ranged}::boolean[]) |
| `apps/worker/src/routes/match.ts` | rouRows SELECT including rd.is_ranged; RouItem construction reading r.is_ranged | VERIFIED | Line 109: is_ranged: boolean in type. Line 116: rd.is_ranged in SELECT. Line 131: isRanged: r.is_ranged in map |
| `apps/worker/src/db/schema.sql` | rou_data table definition with is_ranged column | VERIFIED | Line 35: `is_ranged   BOOLEAN NOT NULL DEFAULT false` — correct spelling, NOT NULL, DEFAULT false |
| `apps/worker/src/__tests__/parser.test.ts` | Tests for parseRouFile isRanged parsing — all RANGED_TRUTHY variants | VERIFIED | Lines 158-182: "parses all RANGED_TRUTHY variants as isRanged:true and others as false". Lines 184-190: "defaults isRanged to false when Ranged column is absent from ROU file" |
| `apps/worker/src/__tests__/upload.test.ts` | Test that ROU upload stores is_ranged=true for rows with Ranged=checked | VERIFIED | Lines 142-168: "returns 200 with ok:true for valid ROU upload with Ranged column" — CSV includes Ranged=checked, asserts status 200 ok:true |
| `apps/worker/src/__tests__/match.test.ts` | Test asserting ranged-first sort activates via match route when is_ranged=true | VERIFIED | Lines 214-249: "returns results with ranged items sorted first when is_ranged=true in rou_data" — bestMatch.store===Store C, bestMatch.isRanged===true |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `apps/worker/src/lib/parser.ts` | RANGED_TRUTHY set | colMap['Ranged'] lookup — RANGED_TRUTHY.has() | WIRED | Lines 237-241: `const rangedCol = colMap["Ranged"]`; `RANGED_TRUTHY.has((row[rangedCol]?.trim() ?? "").toLowerCase())` — exact mirror of parseDeadStockFile pattern |
| `apps/worker/src/routes/upload.ts` | rou_data INSERT | rows.map((r) => r.isRanged) -> unnest(${ranged}::boolean[]) | WIRED | Line 124: const ranged extracted. Line 130: is_ranged in column list. Line 136: unnest cast — parameterized, no string injection |
| `apps/worker/src/routes/match.ts` | RouItem.isRanged | SELECT rd.is_ranged -> r.is_ranged in .map() | WIRED | Line 116: `rd.is_ranged` in SELECT; Line 131: `isRanged: r.is_ranged` — hardcoded false fully removed |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `match.ts` RouItem construction | isRanged (RouItem[]) | `withOrgContext` query SELECT rd.is_ranged FROM rou_data | Yes — reads from DB column populated by upload route via UNNEST boolean array | FLOWING |
| `upload.ts` ROU INSERT | ranged (boolean[]) | rows.map((r) => r.isRanged) from parseRouFile | Yes — parseRouFile parses Ranged column using RANGED_TRUTHY, not hardcoded | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes with 88 passing and 1 pre-existing failure | `cd apps/worker && npm test` | 88 passing, 1 failing (webhook.test.ts) | PASS |
| RANGED_TRUTHY variants test passes | confirmed in suite output | parser.test.ts describe passes | PASS |
| Ranged-first sort test passes | confirmed in suite output | match.test.ts "returns results with ranged items sorted first" passes in 88 passing count | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| MATCH-05 | 07-01-PLAN.md | Results are sorted ranged-first, then by ROU descending within each group | SATISFIED | match.ts reads isRanged from DB; match.test.ts ranged-first sort test passes; matchTransfers sort logic already existed and now receives real isRanged values |
| MATCH-06 | 07-01-PLAN.md | is_ranged parsing accepts all truthy variants: checked, yes, true, 1, y (case-insensitive) — not just "checked" | SATISFIED | parser.ts RANGED_TRUTHY set at line 43; parseRouFile uses it lines 237-241; parser.test.ts tests all 5 variants including mixed case (Yes, TRUE) at lines 158-182 |

No orphaned requirements for Phase 7 — REQUIREMENTS.md traceability table confirms MATCH-05 and MATCH-06 are assigned to Phase 7 with status Complete.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No hardcoded `isRanged: false` in match.ts, no TODO/FIXME/placeholder in modified files, no empty implementations in the is_ranged pipeline | — | — |

Specific checks run:
- match.ts: `isRanged: false` — NOT FOUND (removed in Phase 7, replaced with `isRanged: r.is_ranged`)
- match.ts: Critical comment "do NOT select is_ranged from rou_data" — NOT FOUND (removed)
- upload.ts: Missing is_ranged in INSERT — NOT FOUND (column present)
- schema.sql: is_ranged absent from rou_data — NOT FOUND (column present at line 35)

---

### Human Verification Required

None. All phase 7 success criteria are verifiable programmatically via the test suite. The live NEON ALTER TABLE migration was confirmed complete by the user during execution (documented in SUMMARY.md) and is a deployment prerequisite, not a code verification item.

---

## Gaps Summary

No gaps. All 7 must-have truths are verified. The full test suite confirms end-to-end behaviour at 88 passing, 1 pre-existing failure (webhook.test.ts unrelated to Phase 7 work).

The INT-01 architectural gap is closed:
- `rou_data` schema now includes `is_ranged BOOLEAN NOT NULL DEFAULT false`
- ROU upload stores `is_ranged` per row via UNNEST boolean array
- `match.ts` reads `isRanged: r.is_ranged` from DB (not hardcoded false)
- Ranged-first sort activates end-to-end when ROU files contain ranged items

MATCH-05 and MATCH-06 are satisfied and marked `[x]` in REQUIREMENTS.md.

---

_Verified: 2026-04-12T16:36:00Z_
_Verifier: Claude (gsd-verifier)_
