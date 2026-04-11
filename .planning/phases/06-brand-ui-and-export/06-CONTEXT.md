# Phase 6: Brand, UI and Export - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply final brand polish — dark mode with localStorage persistence, a useful Dashboard home screen, and a branded PharmIQ favicon — and add client-side PDF export of match results using `@react-pdf/renderer`.

This phase does NOT include: CSV or XLSX export (deferred to v2), Stripe Customer Portal, any new matching logic changes, or responsive/mobile layout.

</domain>

<decisions>
## Implementation Decisions

### Dark Mode

- **D-01:** Implementation approach is **CSS variables refactor**. Inline hardcoded hex values throughout components (`bg-[#0F766E]`, `text-[#475569]`, `border-[#E2E8F0]`, etc.) are replaced with `var(--color-*)` references. A `:root.dark { }` block in `index.css` defines the dark variants for every token. This is a one-time refactor that makes dark mode work globally without touching dark mode logic in each component.
- **D-02:** Dark mode is toggled by adding/removing a `.dark` class on `<html>` (or `<body>`). Tailwind v4's `@variant dark` mechanism picks this up automatically.
- **D-03:** The toggle button lives in the **header, top-right, alongside the Clerk `<UserButton />`**. It shows a sun/moon icon (lucide-react `Sun` / `Moon`). Always visible on every page.
- **D-04:** Dark mode preference persists via **localStorage** (`key: 'theme'`, values: `'dark'` | `'light'`). Read on app load in `main.tsx` (before React renders) to prevent flash. Write on toggle.

### PDF Export

- **D-05:** Library: **`@react-pdf/renderer`** (matches RESULTS-02 spec). Installed as a bundled dependency — no CDN dependency.
- **D-06:** PDF rows: **best-match rows only** (one row per dead-stock SKU, showing the top destination match). Expanded sub-matches are not included. Matches the default collapsed table view.
- **D-07:** PDF branding: **PharmIQ wordmark + report title + date + org name** in a header section. Header text: "PharmIQ — Dead-Stock Transfer Report". Subheader line: org name (from Clerk) + generation date (ISO format).
- **D-08:** PDF orientation: **landscape**. 8 columns fit comfortably across a landscape A4/letter page.
- **D-09:** Export button: in the **Match Results page header row, top-right**, alongside the page title. Button label: "Export PDF". Only enabled when `results.length > 0`. Uses amber `#D97706` as a secondary action (teal is Run Match, amber is Export — visual hierarchy).
- **D-10:** PDF columns: same 8 as the on-screen table — SKU, Description, Source Store, Destination Store, Qty to Transfer, Dest ROU, Months Cover, Sell-Through Time.

### Brand Gaps

- **D-11:** **Favicon**: Replace the Vite placeholder (`/vite.svg`) with a PharmIQ-branded SVG favicon. Use a simple teal (`#0F766E`) hex-chart or initial mark — must work at 32×32px. Update `index.html` `<link rel="icon">` accordingly.
- **D-12:** **Browser tab title**: Update from "PharmIQ Dead-Stock Optimizer" to "PharmIQ — Dead-Stock Optimizer" (em-dash separator, consistent with brand guide tone).
- **D-13:** **Dashboard home screen** (`/`): Currently a placeholder. Claude's discretion — design a minimal, useful screen that orients both new users (no uploads yet) and returning users (stores uploaded, ready to run match). Should link clearly to Upload and Match pages.

### Claude's Discretion

- Exact dark color palette values (dark background, dark surface, dark border, dark text variants)
- Whether to introduce a thin `ThemeProvider` context or manage theme in `main.tsx` directly
- Dashboard home screen design — CTA cards, stat summary, empty state copy, layout
- Font weights used in the PDF (system fonts or embedded subset of Inter/Space Grotesk)
- Whether PDF generation is synchronous (download on click) or shows a brief loading state
- Exact SVG path for the favicon icon mark

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brand & Design
- `brand-identity-pharma-apps/brand-identity/brand-guidelines.md` — PharmIQ brand guide: colour palette, typography (Space Grotesk + Inter), tone, logo usage, favicon guidance. Required reading before any brand work.

### Requirements
- `.planning/REQUIREMENTS.md` §Brand & UI — BRAND-01 (palette + typography), BRAND-02 (dark mode)
- `.planning/REQUIREMENTS.md` §Results & Export — RESULTS-02 (PDF export via @react-pdf/renderer)
- `.planning/ROADMAP.md` §Phase 6 — goal and success criteria

### Existing Web App (integration points)
- `apps/web/src/index.css` — CSS variables already defined (`:root` block); dark mode extends this file with a `:root.dark {}` block
- `apps/web/index.html` — font loading (`<link>` to Google Fonts for Space Grotesk + Inter); favicon `<link>` to update
- `apps/web/src/components/AppShell.tsx` — header where dark mode toggle is added; sidebar nav structure
- `apps/web/src/pages/MatchPage.tsx` — results table and page header where Export PDF button is added
- `apps/web/src/pages/Dashboard.tsx` — currently a placeholder; needs redesign
- `apps/web/package.json` — `@react-pdf/renderer` must be added as a dependency

### Prior Phase Context
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-08 (brand palette + fonts applied in Phase 1 shell)
- `.planning/phases/04-matching-algorithm/04-CONTEXT.md` — D-07–D-10 (results table structure and column definitions)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/index.css` — CSS variables for brand tokens already defined (`--color-teal`, `--color-amber`, `--color-navy`, etc.); dark mode extends this with `:root.dark {}` overrides
- `apps/web/src/components/AppShell.tsx` — header component; dark mode toggle and theme-aware classes go here
- `apps/web/src/pages/MatchPage.tsx` — full results table with 8 columns; `results` array is the PDF data source; page header is where the Export button goes
- `lucide-react` (already installed) — `Sun`, `Moon` icons for the dark mode toggle; no new icon dependency needed

### Established Patterns
- Inline hardcoded hex values (`bg-[#0F766E]`, `text-[#475569]`) throughout all components — Phase 6 refactors these to `var(--color-*)` as part of dark mode work
- Tailwind v4 (`@import "tailwindcss"`) — supports `@variant dark` for CSS-variable-based theming
- Page structure: `AppShell` wrapper → page header row → control bar → content area (established across Upload, Match, Billing pages)
- Amber `#D97706` used for secondary actions (Upgrade button) — Export PDF button follows this pattern

### Integration Points
- `index.html` → favicon `<link>` and `<title>` tag updates
- `index.css` → add `:root.dark {}` CSS variable block alongside existing `:root` block
- `main.tsx` → read localStorage `theme` before React hydrates to prevent FOUC (flash of unstyled content)
- `AppShell.tsx` → add toggle button in header; pass/read theme state
- `MatchPage.tsx` → add Export PDF button in page header; integrate `@react-pdf/renderer` PDF generation on click
- `Dashboard.tsx` → replace placeholder content with useful landing screen

</code_context>

<specifics>
## Specific Ideas

- Dark mode toggle should use `Sun` and `Moon` from lucide-react (already installed) — no new icon dependency
- Export PDF button: amber colour (`#D97706`) to visually distinguish it from the teal "Run Match" primary action — clear hierarchy
- PDF should use "Dead-Stock Transfer Report" as the document title (aligns with brand guide's product tagline "Turn Dead Stock Into Cash Flow")
- Favicon: teal hex-chart mark at 32×32px — simple enough to read at small sizes, consistent with brand guide logo description

</specifics>

<deferred>
## Deferred Ideas

- CSV export of match results — v2 (in REQUIREMENTS.md v2 backlog)
- XLSX export of match results — v2
- Responsive/tablet layout — v2
- Stripe Customer Portal link on Billing page — future phase
- Dashboard analytics (match run history, stores-uploaded count trends) — v2

</deferred>

---

*Phase: 06-brand-ui-and-export*
*Context gathered: 2026-04-11*
