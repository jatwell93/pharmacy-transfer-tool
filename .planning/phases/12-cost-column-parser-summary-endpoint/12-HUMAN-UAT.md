---
status: partial
phase: 12-cost-column-parser-summary-endpoint
source: [12-VERIFICATION.md]
started: 2026-04-17T00:00:00Z
updated: 2026-04-17T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Upload FRED Stock Valuation XLSX with Cost Ex column — verify NEON writes
expected: cost_ex values are non-null and match the Cost Ex column in the uploaded file. Query: `SELECT sku, cost_ex FROM dead_stock WHERE org_id = '<your-org>' LIMIT 5`
result: [pending]

### 2. Upload dead-stock report WITHOUT Cost Ex column — verify NULL writes
expected: COUNT(*) > 0, COUNT(cost_ex) = 0 (all NULLs); upload completes with no error and body.warnings === []. Query: `SELECT COUNT(*), COUNT(cost_ex) FROM dead_stock WHERE org_id = '<your-org>'`
result: [pending]

### 3. Authenticated GET /api/dead-stock-summary against deployed Worker
expected: Response shape `{ stores: [{ name, totalUnits, totalValue, hasCostData }] }` with correct aggregated figures; hasCostData === false and totalValue === 0 for stores without cost data
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
