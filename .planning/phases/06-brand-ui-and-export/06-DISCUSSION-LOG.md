# Phase 6: Brand, UI and Export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 06-brand-ui-and-export
**Areas discussed:** Dark mode implementation, PDF export content & library, Brand gaps

---

## Dark mode implementation

| Option | Description | Selected |
|--------|-------------|----------|
| CSS variables (refactor) | Refactor inline hex values to var(--color-*); define :root.dark {} in index.css | ✓ |
| Tailwind dark: prefix | Add dark: classes alongside every existing class — no refactor needed | |
| Claude's discretion | Pick whichever approach is cleanest | |

**Toggle placement:**

| Option | Description | Selected |
|--------|-------------|----------|
| Header (top-right, next to UserButton) | Always visible on every page; sun/moon icon | ✓ |
| Sidebar footer (next to Settings) | Keeps header minimal; slightly less discoverable | |

**Persistence:**

| Option | Description | Selected |
|--------|-------------|----------|
| localStorage | Matches existing prototype. Read on load, write on toggle | ✓ |
| System preference default + localStorage override | Respects prefers-color-scheme on first visit, then localStorage | |

**User's choice:** CSS variables refactor, header toggle, localStorage persistence

---

## PDF export content & library

| Option | Description | Selected |
|--------|-------------|----------|
| @react-pdf/renderer | Matches RESULTS-02 spec. Bundled, no CDN. React-style PDF layout | ✓ |
| jsPDF + AutoTable | Simpler, lighter (~200KB). Proven in prototype | |

**PDF rows:**

| Option | Description | Selected |
|--------|-------------|----------|
| Best-match rows only (one per SKU) | Matches default collapsed view. Clean, concise | ✓ |
| All rows including expanded sub-matches | Full picture but longer document | |
| Claude's discretion | Pick most useful default | |

**PDF branding:**

| Option | Description | Selected |
|--------|-------------|----------|
| PharmIQ header + date + org name | Professional, shareable | ✓ |
| Minimal — title and date only | Simpler to implement | |
| Claude's discretion | Pick right level of branding | |

**PDF layout:**

| Option | Description | Selected |
|--------|-------------|----------|
| Landscape + Export button in Match page header | 8 columns fit comfortably; button top-right, enabled when results exist | ✓ |
| Portrait + Export button in control bar | More standard orientation but cramped for 8 columns | |

**User's choice:** @react-pdf/renderer, best-match rows only, PharmIQ header + date + org name, landscape with Export button in page header

---

## Brand gaps

**Favicon:**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — replace Vite placeholder with PharmIQ favicon | Teal hex-chart or PharmIQ initial mark at 32×32px | ✓ |
| Not needed for v1 | Leave placeholder; focus on functional brand compliance | |

**Pages needing polish:**

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard / landing page needs work | Currently a placeholder — needs useful content | ✓ |
| Everything except dark mode and PDF looks fine | App shell, upload, match, billing are consistent | |
| Claude's discretion | Audit all pages and fix inconsistencies | |

**Dashboard design:**

| Option | Description | Selected |
|--------|-------------|----------|
| Quick-action cards (Upload + Run Match) | Two CTA cards for primary workflows | |
| Summary stats + quick-actions | Store count, last match date, CTAs | |
| Claude's discretion | Minimal, useful screen for new and returning users | ✓ |

**User's choice:** Replace favicon, Dashboard needs redesign (Claude's discretion for design), other pages are on-brand.

---

## Claude's Discretion

- Exact dark color palette values
- Theme management approach (ThemeProvider context vs main.tsx)
- Dashboard home screen design and content
- PDF font strategy (system fonts vs embedded subset)
- Favicon SVG path / icon mark design

## Deferred Ideas

- CSV export — v2
- XLSX export — v2
- Responsive/tablet layout — v2
- Stripe Customer Portal — future phase
