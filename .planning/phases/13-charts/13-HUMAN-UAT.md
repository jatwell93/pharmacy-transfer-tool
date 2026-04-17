---
status: partial
phase: 13-charts
source: [13-VERIFICATION.md]
started: 2026-04-17T00:00:00Z
updated: 2026-04-17T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Pie chart visual rendering
expected: Pie slices render with PharmIQ brand colours (#0F766E teal, #D97706 amber), external SVG labels show "StoreName: unitCount" positioned outside slices, tooltip appears on hover showing store name, unit count, and percentage
result: [pending]

### 2. Empty state display
expected: Before any upload, UploadPage shows "Upload dead stock data to see distribution here." in the chart section; layout is clean and not broken
result: [pending]

### 3. Dark mode — pie chart
expected: Tooltip background and text resolve correctly via CSS variables in dark mode; labels are readable; no hard-coded white/black colours break the theme
result: [pending]

### 4. Chart redraw on re-upload
expected: Uploading a new dead stock file triggers both store-card refresh and chart re-render without a page reload; pie slices update to reflect new data
result: [pending]

### 5. PostMatchChart gate
expected: MatchPage shows no chart before the first match run; after running a match with results, the "Transfer Impact" section appears with the grouped bar chart and KPI card
result: [pending]

### 6. Bar chart correctness
expected: Each source store has two bars (Before amber, After teal); After values are lower than Before; Math.max(0,...) clamp means no negative bars even for stores sending out all stock; KPI card shows correct net units recovered total
result: [pending]

### 7. Dark mode — bar chart
expected: Bar fills, axis labels, tooltip, and KPI card text all render correctly in dark mode; no elements become invisible or overlap due to colour issues
result: [pending]

### 8. REQUIREMENTS.md checkboxes
expected: VIZ-01, VIZ-02, VIZ-03 entries in .planning/REQUIREMENTS.md are marked [x] and status updated to "Complete"
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
