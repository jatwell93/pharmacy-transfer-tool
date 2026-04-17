# Phase 13: Charts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 13-charts
**Areas discussed:** PostMatchChart aggregation logic, Pie chart label style, UploadPage chart placement

---

## PostMatchChart Aggregation Logic

| Option | Description | Selected |
|--------|-------------|----------|
| Source stores only, units out only | After = totalUnits − units transferred OUT. Only source stores charted. Cleanest interpretation of dead stock reduction. | ✓ |
| All summary stores, units out only | Every store in summary shown, even with zero transfers (Before = After). | |
| Bidirectional — out minus in | After = totalUnits − out + in. Destination stores' bars go up. | |

**User's choice:** Source stores only, units out only

---

| Option | Description | Selected |
|--------|-------------|----------|
| Show as source store, deduct outgoing only | After = totalUnits − outgoing. Ignore incoming transfers. Consistent with source-only logic. | ✓ |
| Show with bidirectional net (out − in) | After = totalUnits − outgoing + incoming. More accurate but edge case. | |

**Question:** If a store appears as both source AND destination, how should it appear?
**User's choice:** Show it as a source store, deduct only its outgoing units

---

| Option | Description | Selected |
|--------|-------------|----------|
| Clamp to 0 | Math.max(0, before − outgoing). Negative dead stock is nonsensical. | ✓ |
| Show as-is (allow negative) | Display actual computed value even if negative. | |
| Exclude that store from the chart | Drop stores where After < 0. | |

**Question:** What happens if After units goes negative?
**User's choice:** Clamp to 0

---

## Pie Chart Label Style

| Option | Description | Selected |
|--------|-------------|----------|
| External labels on each slice | Store name + unit count outside the pie, connected by a line. Clear at a glance. | ✓ |
| Legend panel beside/below the chart | Color-coded list of store names + counts. Better for many stores. | |
| Tooltip only | No labels by default — hover to see. Accessibility concern. | |

**User's choice:** External labels on each slice

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, tooltip too | Hover shows store name, unit count, and percentage. Labels for at-a-glance, tooltip for precision. | ✓ |
| No tooltip — labels are enough | External labels already show all info. | |

**Question:** Should the pie chart also show a tooltip on hover?
**User's choice:** Yes, tooltip too

---

## UploadPage Chart Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible, empty state when no data | Chart section always rendered; shows empty state message if no dead stock uploaded. | ✓ |
| Only when at least one store has data | Conditionally rendered — page layout shifts when data arrives. | |

**User's choice:** Always visible, empty state when no data

---

| Option | Description | Selected |
|--------|-------------|----------|
| Full width below the store grid | Full content width, consistent with store grid above. | ✓ |
| Half-width beside the store grid on wider screens | Two-column layout on desktop. Requires new layout wrapper. | |

**User's choice:** Full width below the store grid

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, a small section heading above the chart | "Dead Stock by Store" label orients users, especially below the fold. | ✓ |
| No heading — chart stands alone | Chart title/labels are self-explanatory. | |

**User's choice:** Yes, a small section heading above the chart

---

## Claude's Discretion

- `renderCustomizedLabel` implementation detail for external labels
- Recharts `react-is` override if needed
- Loading skeleton/spinner while `useDeadStockSummary` fetches
- KPI card styling
- PostMatchChart loading state when summary hasn't resolved after match completes

## Deferred Ideas

None — discussion stayed within phase scope.
