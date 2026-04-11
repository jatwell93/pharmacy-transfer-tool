# Phase 6: Brand, UI and Export — Research

**Researched:** 2026-04-11
**Domain:** React theming (Tailwind v4 dark mode), @react-pdf/renderer, SVG favicon, Vite, Cloudflare Pages
**Confidence:** HIGH (all key claims verified against official docs or npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dark Mode**
- D-01: CSS variables refactor — inline hardcoded hex values replaced with `var(--color-*)` references; `:root.dark {}` block defines dark variants
- D-02: Dark mode toggled by adding/removing `.dark` class on `<html>` element
- D-03: Toggle button lives in the header, top-right, alongside Clerk `<UserButton />` — shows `Sun`/`Moon` from lucide-react
- D-04: Preference persists via `localStorage` (key: `'theme'`, values: `'dark'` | `'light'`); read in `main.tsx` before React renders to prevent FOUC

**PDF Export**
- D-05: Library: `@react-pdf/renderer` — installed as bundled dependency, no CDN
- D-06: PDF rows: best-match rows only (one row per dead-stock SKU)
- D-07: PDF branding: PharmIQ wordmark + report title + date + org name in header; "PharmIQ — Dead-Stock Transfer Report"
- D-08: PDF orientation: landscape
- D-09: Export button in Match Results page header row, top-right; label "Export PDF"; enabled only when `results.length > 0`; amber `#D97706`
- D-10: PDF columns: same 8 as on-screen table — SKU, Description, Source Store, Destination Store, Qty to Transfer, Dest ROU, Months Cover, Sell-Through Time

**Brand Gaps**
- D-11: Favicon: replace `/vite.svg` with a PharmIQ-branded SVG favicon — teal `#0F766E` hex-chart/initial mark at 32×32px
- D-12: Browser tab title: "PharmIQ — Dead-Stock Optimizer" (em-dash separator)
- D-13: Dashboard home screen (`/`): currently a placeholder — useful landing screen for new and returning users

### Claude's Discretion

- Exact dark color palette values (dark background, dark surface, dark border, dark text variants)
- Whether to introduce a thin ThemeProvider context or manage theme in `main.tsx` directly
- Dashboard home screen design — CTA cards, stat summary, empty state copy, layout
- Font weights used in the PDF (system fonts or embedded subset of Inter/Space Grotesk)
- Whether PDF generation is synchronous (download on click) or shows a brief loading state
- Exact SVG path for the favicon icon mark

### Deferred Ideas (OUT OF SCOPE)

- CSV export of match results
- XLSX export of match results
- Responsive/tablet layout
- Stripe Customer Portal link on Billing page
- Dashboard analytics (match run history, stores-uploaded count trends)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRAND-01 | UI implements PharmIQ brand guide — teal `#0F766E` primary, amber `#D97706` accent, navy `#0F172A` dark base, Space Grotesk (headings) + Inter (body) | CSS variables already defined in `index.css`; dark mode extends with `:root.dark {}` using brand guide dark values; fonts already loaded in `index.html` |
| BRAND-02 | Dark mode toggle with localStorage persistence | Tailwind v4 `@custom-variant dark` enables class-based dark mode; inline script in `index.html` prevents FOUC; `localStorage` key `'theme'` pattern documented |
| RESULTS-02 | User can export match results as a PDF (client-side via @react-pdf/renderer) | `@react-pdf/renderer` 4.4.1 verified on npm; `PDFDownloadLink` component handles client-side download; `MatchResult[]` type already defined in `useMatchRun.ts` |
</phase_requirements>

---

## Summary

Phase 6 delivers the final brand polish for the PharmIQ Stock Transfer app. Three distinct work streams exist: (1) dark mode via CSS variables + Tailwind v4 class toggling, (2) PDF export via `@react-pdf/renderer`, and (3) minor brand gap fixes (favicon, title, Dashboard placeholder).

The existing codebase is already well-prepared. CSS variables are defined in `index.css` with all brand tokens. Google Fonts are loaded in `index.html`. All components use hardcoded hex values (`bg-[#0F766E]` style), which will be refactored to `var(--color-*)` references. The dark palette needs a `:root.dark {}` block added to `index.css` — the brand guide specifies only the page background (`#0F172A` navy) for dark mode, leaving surface, border, and text dark variants as Claude's Discretion.

`@react-pdf/renderer` 4.4.1 is the current stable release and supports React 19. It is not yet installed. The library works with Vite 6 without special configuration for the use case here (browser-only, no web worker). `PDFDownloadLink` is the correct client-side download primitive. PDF layout uses flexbox (no CSS Grid), which is well-suited for the 8-column results table.

**Primary recommendation:** Dark mode first (small, safe CSS change), then PDF export (new dependency), then Dashboard + brand gaps (new UI work). Sequence reduces risk.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-pdf/renderer` | 4.4.1 | Client-side PDF generation | Official decision D-05; React renderer model; landscape A4 support; no server needed |
| `tailwindcss` | 4.2.2 (installed) | Utility CSS; dark mode via `@custom-variant` | Already in project; v4 `@custom-variant dark` enables class-toggle dark mode |
| `lucide-react` | 1.8.0 (installed) | Sun/Moon icons for dark mode toggle | Already installed per D-03; no new dependency |

[VERIFIED: npm registry] All versions confirmed via `npm view` on 2026-04-11.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@clerk/react` | 6.2.1 (installed) | `useOrganization` hook for org name in PDF header | Already installed; provides org name for D-07 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@react-pdf/renderer` | jsPDF + jsPDF-AutoTable (CDN) | Old approach from original prototype; creates CDN runtime dependency; `@react-pdf/renderer` is bundled and React-native |
| `@react-pdf/renderer` | `html2canvas` + jsPDF | Screenshot-based, fragile layout; not print-quality |
| Tailwind dark: utilities | Manual dark CSS classes | Dark utilities work with CSS variables equally well — decision D-01 prefers CSS variables for global coverage |

**Installation:**

```bash
cd apps/web && npm install @react-pdf/renderer
```

**Version verification:**

```bash
npm view @react-pdf/renderer version
# Confirmed: 4.4.1 on 2026-04-11
```

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes are in-place edits to existing files plus one new file:

```
apps/web/
├── index.html                  # Update: title (D-12), favicon link (D-11), FOUC script (D-04)
├── public/
│   └── favicon.svg             # NEW: PharmIQ teal hex-chart SVG mark
├── src/
│   ├── index.css               # Update: add @custom-variant dark + :root.dark {} block (D-01, D-02)
│   ├── main.tsx                # Update: FOUC prevention — read localStorage before render (D-04)
│   ├── components/
│   │   ├── AppShell.tsx        # Update: dark mode toggle button in header (D-03)
│   │   └── TransferReportPDF.tsx  # NEW: @react-pdf/renderer document component (RESULTS-02)
│   └── pages/
│       ├── MatchPage.tsx       # Update: Export PDF button + PDFDownloadLink wiring (D-09, D-10)
│       └── Dashboard.tsx       # Update: replace placeholder with useful landing (D-13)
```

[VERIFIED: codebase grep] All existing file paths confirmed present in `apps/web/src/`.

### Pattern 1: CSS Variables Dark Mode (Tailwind v4)

**What:** Add `@custom-variant dark` to `index.css` to enable class-based dark mode. Add `:root.dark {}` block overriding all `--color-*` tokens. Toggle `.dark` class on `<html>` from React.

**When to use:** Global theming where every surface must flip simultaneously without touching individual component files.

```css
/* apps/web/src/index.css — additions */

/* Source: https://tailwindcss.com/docs/dark-mode */
@custom-variant dark (&:where(.dark, .dark *));

:root.dark {
  --color-surface:       #0F172A;   /* Navy — brand guide dark page bg */
  --color-surface-gray:  #1E293B;   /* Slate-800 — dark card/sidebar */
  --color-border-light:  #334155;   /* Slate-700 — dark dividers */
  --color-border-mid:    #475569;   /* Slate-600 — dark form fields */
  --color-text-primary:  #F8FAFC;   /* Near-white — dark headings */
  --color-text-secondary:#CBD5E1;   /* Slate-300 — dark body text */
  --color-text-muted:    #64748B;   /* Slate-500 — dark captions */
  /* Brand colors stay the same in dark mode — teal, amber, navy are brand anchors */
}
```

**Note on dark palette selection (Claude's Discretion):** The brand guide specifies only `#0F172A` navy for the dark page background. The surface, border, and text dark variants above derive from the Tailwind Slate scale (consistent with the light mode palette which already uses Slate-derived neutrals). These are [ASSUMED] values — see Assumptions Log.

### Pattern 2: FOUC Prevention (inline script)

**What:** A tiny render-blocking script in `index.html <head>` reads `localStorage.theme` and applies `.dark` to `<html>` before React hydrates. Prevents the white flash on page load for dark mode users.

**When to use:** Any SPA with client-side theme persistence.

```html
<!-- apps/web/index.html — inside <head>, before fonts -->
<!-- Source: https://tailwindcss.com/docs/dark-mode (JS toggle example) -->
<script>
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch(e) {}
</script>
```

**Critical:** Keep it tiny — it's render-blocking. No ES6+ features (no const, no arrow functions) — this runs before Babel. Wrap in try/catch for private-browsing environments where `localStorage` throws. [VERIFIED: MDN + multiple community sources]

### Pattern 3: Dark Mode Toggle in React

**What:** Read/write `localStorage` + toggle `.dark` class on `document.documentElement`. No React context needed unless more components need to read the state.

```tsx
// apps/web/src/components/AppShell.tsx — additions
// Source: https://tailwindcss.com/docs/dark-mode

const [isDark, setIsDark] = useState(
  () => localStorage.getItem('theme') === 'dark'
);

function handleThemeToggle() {
  const next = !isDark;
  setIsDark(next);
  if (next) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }
}

// In header JSX (alongside UserButton):
<button onClick={handleThemeToggle} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
  {isDark ? <Sun size={18} /> : <Moon size={18} />}
</button>
```

**ThemeProvider vs. direct DOM:** For this app, direct `localStorage` + `document.documentElement` manipulation in `AppShell.tsx` is sufficient. A `ThemeProvider` context is only needed if child components need to read the boolean — currently none do (all dark styling via CSS variables). [ASSUMED — assess after dark-mode refactor to confirm no child needs the boolean]

### Pattern 4: @react-pdf/renderer Landscape Report

**What:** A React component using `@react-pdf/renderer` primitives — no HTML/CSS, only flexbox-based `View`/`Text` layout. Render via `PDFDownloadLink` for synchronous client-side download.

```tsx
// apps/web/src/components/TransferReportPDF.tsx
// Source: https://react-pdf.org/components

import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import type { MatchResult } from '../hooks/useMatchRun';

// Register fonts — TTF/WOFF only (no variable fonts)
// Source: https://react-pdf.org/fonts
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuPUlfCA.woff', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuPUlfBBc-.woff', fontWeight: 600 },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: 'Inter', fontSize: 9 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 14, fontWeight: 600, color: '#0F766E' },
  subtitle: { fontSize: 9, color: '#475569', marginTop: 2 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 6, paddingHorizontal: 4, borderBottom: '1px solid #E2E8F0' },
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottom: '1px solid #E2E8F0' },
  col: { flex: 1, fontSize: 8, color: '#0F172A' },
  colHeader: { flex: 1, fontSize: 8, fontWeight: 600, color: '#475569' },
});

interface TransferReportPDFProps {
  results: MatchResult[];
  orgName: string;
}

export function TransferReportPDF({ results, orgName }: TransferReportPDFProps) {
  return (
    <Document title="PharmIQ — Dead-Stock Transfer Report">
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>PharmIQ — Dead-Stock Transfer Report</Text>
            <Text style={styles.subtitle}>{orgName} · Generated {new Date().toISOString().split('T')[0]}</Text>
          </View>
        </View>
        {/* Table header */}
        <View style={styles.tableHeader}>
          {['SKU', 'Description', 'Source Store', 'Destination Store', 'Qty', 'Dest ROU', 'Months Cover', 'Sell-Through'].map(h => (
            <Text key={h} style={styles.colHeader}>{h}</Text>
          ))}
        </View>
        {/* Rows */}
        {results.map(r => (
          <View key={`${r.sku}-${r.sourceStore}`} style={styles.row}>
            <Text style={styles.col}>{r.sku}</Text>
            <Text style={styles.col}>{r.description}</Text>
            <Text style={styles.col}>{r.sourceStore}</Text>
            <Text style={styles.col}>{r.bestMatch.store}</Text>
            <Text style={styles.col}>{r.bestMatch.qtyToTransfer.toFixed(1)}</Text>
            <Text style={styles.col}>{r.bestMatch.rou.toFixed(1)}</Text>
            <Text style={styles.col}>{r.bestMatch.monthsCover}</Text>
            <Text style={styles.col}>{r.bestMatch.sellThrough.toFixed(1)} mo</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
```

**PDFDownloadLink usage in MatchPage.tsx:**

```tsx
// Source: https://react-pdf.org/components
import { PDFDownloadLink } from '@react-pdf/renderer';
import { TransferReportPDF } from '../components/TransferReportPDF';

// In page header JSX:
<PDFDownloadLink
  document={<TransferReportPDF results={results} orgName={orgName} />}
  fileName={`pharmiq-transfer-report-${new Date().toISOString().split('T')[0]}.pdf`}
>
  {({ loading }) => (
    <button
      disabled={loading || results.length === 0}
      className="bg-[#D97706] text-white text-[13px] font-semibold rounded-md px-4 min-h-[44px] ..."
    >
      {loading ? 'Preparing...' : 'Export PDF'}
    </button>
  )}
</PDFDownloadLink>
```

**Note on `orgName`:** Use `useOrganization()` from `@clerk/react` to get `organization?.name` in `MatchPage.tsx`. `@clerk/react` is already installed. [VERIFIED: codebase — `@clerk/react` 6.2.1 in `apps/web/package.json`]

### Pattern 5: SVG Favicon

**What:** An inline SVG with a simple geometric mark in teal `#0F766E`. Modern browsers support SVG favicons natively. Replace the Vite placeholder.

```html
<!-- apps/web/public/favicon.svg -->
<!-- Source: https://www.w3tutorials.net/blog/favicon-standard-2024-svg-ico-png-and-dimensions/ -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- Hexagon frame (hex-chart motif from brand guide) -->
  <polygon points="16,2 28,9 28,23 16,30 4,23 4,9"
           fill="none" stroke="#0F766E" stroke-width="2.5"/>
  <!-- "P" letterform or bar-chart bars — keep geometry minimal at 32x32 -->
  <rect x="10" y="10" width="3" height="12" fill="#0F766E"/>
  <rect x="15" y="14" width="3" height="8" fill="#14B8A6"/>
  <rect x="20" y="8" width="3" height="14" fill="#0F766E"/>
</svg>
```

**Note:** The exact SVG path is Claude's Discretion. The above is a starter reference showing the hex-chart motif from the brand guide. The key constraint is readability at 32×32px — keep shape count minimal (≤ 4 elements). [ASSUMED — exact icon mark not specified in brand guidelines]

### Anti-Patterns to Avoid

- **Loading @react-pdf/renderer conditionally at click time via dynamic `import()`:** The library is large but loading it lazily inside a click handler causes a visible delay on first export. Load it at module level and let Vite handle code-splitting naturally via `React.lazy` if bundle size is a concern.
- **Using `@react-pdf/renderer` `PDFViewer` in production:** `PDFViewer` embeds an iframe PDF preview — unnecessary here; `PDFDownloadLink` gives a direct download.
- **Hardcoding hex values in new dark-mode code:** The entire point of the CSS variables refactor is to stop doing this. All new dark-mode styles go through `var(--color-*)`.
- **Using `window.matchMedia('(prefers-color-scheme: dark)')` as the primary toggle:** Decision D-04 specifies `localStorage` persistence. The FOUC script reads `localStorage`, not `prefers-color-scheme`. Don't override user's explicit choice with system preference.
- **Registering variable fonts with Font.register:** `@react-pdf/renderer` supports TTF and WOFF only — not WOFF2, not variable fonts. Register separate font objects for each weight. [VERIFIED: react-pdf.org/fonts]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Custom canvas/jsPDF DOM capture | `@react-pdf/renderer` | PDF layout engine handles page breaks, font embedding, cross-browser binary blob |
| Dark mode state | Custom event bus or Redux slice | CSS variables + `document.documentElement.classList` | CSS variables propagate instantly; no React re-render needed to switch theme |
| Font loading in PDF | Embed base64 in JS | `Font.register({ src: url })` | react-pdf fetches and embeds at render time; handles format negotiation |

**Key insight:** PDF generation is a solved problem in the React ecosystem. `@react-pdf/renderer` handles the hard parts — binary blob creation, font embedding, page geometry, cross-browser download triggers. The only custom work is the layout component (flexbox `View`/`Text` arrangement).

---

## Common Pitfalls

### Pitfall 1: FOUC (Flash of Unstyled Content) on Dark Mode Load

**What goes wrong:** User has `theme: 'dark'` in localStorage. React reads it in `useEffect` → sets `.dark` class → page briefly shows in light mode first.

**Why it happens:** `useEffect` fires after the DOM paints. Any theme reading inside React is too late to prevent the first render.

**How to avoid:** Inline script in `index.html <head>` (Pattern 2 above). Runs before React bundle loads. Keep it < 100 chars, render-blocking is intentional.

**Warning signs:** Browser shows white flash when navigating to site in dark mode.

[VERIFIED: multiple community sources + Tailwind docs JS toggle example]

### Pitfall 2: @react-pdf/renderer Font Loading Failures in Production

**What goes wrong:** Fonts registered via `Font.register({ src: googleFontsGstatc URL })` work in dev but fail in production if the Cloudflare Pages deployment has a restrictive CSP or if gstatic.com is blocked.

**Why it happens:** react-pdf fetches fonts at render time from the network. If the origin is blocked, PDF renders in a fallback system font with no error thrown.

**How to avoid:** Two strategies:
1. **Use system fonts only** (simplest, no network dependency): Don't call `Font.register()`. PDF uses Helvetica/Times system fonts. Slightly less branded but 100% reliable.
2. **Bundle font files**: Copy TTF files into `apps/web/public/fonts/` and use a path like `src: '/fonts/inter-regular.ttf'`. Vite serves these at the same origin — no CORS issues.

**Recommendation:** Start with system fonts for the first implementation. The PDF content (numbers, store names) is what matters, not the typeface. If the customer requests brand fonts in PDF, use bundled TTF files.

**Warning signs:** PDF exports but text looks like Arial/Helvetica instead of Inter.

[ASSUMED: Cloudflare Pages CSP defaults not verified — apply caution]

### Pitfall 3: @react-pdf/renderer `PDFDownloadLink` Re-Renders

**What goes wrong:** `PDFDownloadLink` re-generates the PDF on every render of `MatchPage`, even when results haven't changed. This is CPU-heavy for large result sets.

**Why it happens:** The `document` prop receives a new JSX element on every render.

**How to avoid:** Wrap the PDF document in `useMemo`:

```tsx
const pdfDocument = useMemo(
  () => <TransferReportPDF results={results} orgName={orgName} />,
  [results, orgName]
);

<PDFDownloadLink document={pdfDocument} fileName="...">
```

**Warning signs:** Noticeable CPU spike when typing in the months-cover input field.

[CITED: react-pdf.org/advanced — "document re-computation can be an expensive operation"]

### Pitfall 4: Inline Hex Values Missed During CSS Variable Refactor

**What goes wrong:** Dark mode looks correct on most surfaces but specific components (e.g., `UploadModal`, `StoreCard`, `FileStatusBadge`) still use hardcoded hex values and don't flip on dark toggle.

**Why it happens:** Many Tailwind JIT classes use inline hex values (`bg-[#0F172A]`). These are not CSS variables and are not overridden by the `:root.dark {}` block.

**How to avoid:** After replacing hardcoded hex values with `var(--color-*)` in `AppShell.tsx` and `MatchPage.tsx`, do a systematic search:

```bash
grep -r "bg-\[#\|text-\[#\|border-\[#" apps/web/src/
```

Every match is a candidate for refactoring to a CSS variable reference. [VERIFIED: codebase grep — confirmed pattern is widespread across all component files]

### Pitfall 5: Tailwind v4 `@custom-variant` Placement

**What goes wrong:** Adding `@custom-variant dark (...)` after `@import "tailwindcss"` does not work because Tailwind processes `@import` at the top of the file.

**Why it happens:** In Tailwind v4, `@custom-variant` must appear after the import directive. Wrong placement silently makes `dark:` utilities non-functional.

**How to avoid:** Place `@custom-variant dark (&:where(.dark, .dark *));` immediately after `@import "tailwindcss";` on line 1 of `index.css`.

[VERIFIED: tailwindcss.com/docs/dark-mode]

---

## Code Examples

Verified patterns from official sources:

### Tailwind v4 Class-Based Dark Mode Configuration

```css
/* apps/web/src/index.css */
/* Source: https://tailwindcss.com/docs/dark-mode */
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --color-surface: #FFFFFF;
  /* ... existing tokens ... */
}

:root.dark {
  --color-surface: #0F172A;
  --color-surface-gray: #1E293B;
  /* ... dark overrides ... */
}
```

### FOUC Prevention Script

```html
<!-- apps/web/index.html — inside <head> before font links -->
<!-- Source: https://tailwindcss.com/docs/dark-mode -->
<script>
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch(e) {}
</script>
```

### @react-pdf/renderer Landscape A4 Document

```tsx
// Source: https://react-pdf.org/components
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

<Document title="PharmIQ — Dead-Stock Transfer Report">
  <Page size="A4" orientation="landscape" style={{ padding: 32, fontSize: 9 }}>
    {/* header + table rows */}
  </Page>
</Document>
```

### PDFDownloadLink with Loading State

```tsx
// Source: https://react-pdf.org/components
import { PDFDownloadLink } from '@react-pdf/renderer';

<PDFDownloadLink document={pdfDocument} fileName="pharmiq-transfer-report.pdf">
  {({ loading }) => (
    <button disabled={loading}>
      {loading ? 'Preparing...' : 'Export PDF'}
    </button>
  )}
</PDFDownloadLink>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jsPDF + jsPDF-AutoTable from CDN | `@react-pdf/renderer` (bundled) | Phase 6 decision | Eliminates CDN runtime dependency; React component model; proper font embedding |
| Tailwind dark mode: `darkMode: 'class'` in `tailwind.config.js` | `@custom-variant dark` in CSS file | Tailwind v4 (2025) | No config file needed; CSS-first approach |
| `tailwind.config.js` for custom colors | CSS variables in `index.css` | Tailwind v4 (2025) | Colors defined in CSS, not JS config |

**Deprecated/outdated in this project:**

- **`tailwind.config.js` with `darkMode: 'class'`**: Not used — Tailwind v4 is CSS-first. The `@custom-variant` directive replaces this. [VERIFIED: tailwindcss.com/docs/dark-mode]
- **jsPDF CDN approach** (from original prototype): Replaced by `@react-pdf/renderer` per D-05. [VERIFIED: CONTEXT.md D-05]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dark surface colors: `#1E293B` (surface-gray), `#334155` (border-light), `#475569` (border-mid), `#F8FAFC` (text-primary), `#CBD5E1` (text-secondary), `#64748B` (text-muted) for dark mode | Architecture Patterns — Pattern 1 | Incorrect colors would look off-brand in dark mode; low risk — planner should document these as "recommended defaults, adjust in execution" |
| A2 | `ThemeProvider` context not needed — AppShell direct DOM manipulation is sufficient | Architecture Patterns — Pattern 3 | If a child component later needs to read `isDark` as a boolean (e.g., for conditional chart color), refactor to context is needed |
| A3 | Cloudflare Pages does not restrict gstatic.com CDN font loading by default (relevant for Font.register) | Common Pitfalls — Pitfall 2 | If CSP is restrictive, PDFs render in system fonts — must use bundled TTFs instead |
| A4 | `useOrganization().organization?.name` is available on MatchPage (org is required to reach this page) | Architecture Patterns — Pattern 4 | If org is null despite ProtectedRoute, PDF header shows undefined — add fallback string |

---

## Open Questions

1. **System fonts vs. branded fonts in PDF**
   - What we know: react-pdf fetches fonts from network at render time; Cloudflare Pages CSP defaults not documented here
   - What's unclear: Will `gstatic.com` font requests succeed from Cloudflare Pages in production?
   - Recommendation: Implement with system fonts first; upgrade to bundled TTF if required

2. **Dashboard landing screen content**
   - What we know: Currently a placeholder "You're all set up" screen; D-13 says useful landing for both new and returning users
   - What's unclear: What "useful" means — store count summary? quick links? match history?
   - Recommendation: Two-state design — empty state (no stores) with Upload CTA; populated state (stores exist) with link to Match page and upload summary

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install | Yes | v22.20.0 | — |
| `@react-pdf/renderer` | RESULTS-02 PDF export | No (not installed) | 4.4.1 available on npm | — |
| `lucide-react` (Sun, Moon) | Dark mode toggle | Yes (installed) | 1.8.0 | — |
| `@clerk/react` `useOrganization` | PDF header org name | Yes (installed) | 6.2.1 | Fallback to empty string |
| Google Fonts (fonts.googleapis.com) | PDF font registration | Assumed yes | — | Bundle TTF in public/fonts/ |

**Missing dependencies with no fallback:**
- `@react-pdf/renderer` must be installed before Wave 1 PDF work begins: `cd apps/web && npm install @react-pdf/renderer`

**Missing dependencies with fallback:**
- Google Fonts for PDF: use system fonts (Helvetica) as fallback if gstatic.com is unreachable at PDF render time

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | No frontend test framework detected — `apps/web/package.json` has no vitest/jest devDependency |
| Config file | None in `apps/web/` |
| Quick run command | N/A — no test runner configured |
| Full suite command | `cd apps/web && npm run build` (type check + build = closest to a test gate) |

**Note:** The worker has vitest (`apps/worker/vitest.config.ts` with cloudflare pool). The web app has no test infrastructure. Phase 6 changes are UI/CSS (dark mode variables, new layout components). These are best validated via manual visual inspection + build check.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRAND-01 | Brand colors applied via CSS variables | Visual (manual) | `cd apps/web && npm run build` — type errors caught | — |
| BRAND-02 | Dark mode toggle persists to localStorage | Manual E2E | `cd apps/web && npm run build` | — |
| RESULTS-02 | PDF download triggered with results data | Manual | `cd apps/web && npm run build` — TS types for pdf component caught | — |

### Sampling Rate

- **Per task commit:** `cd apps/web && npm run build` — catches TypeScript errors
- **Per wave merge:** Full manual visual check: light mode, dark mode, PDF download
- **Phase gate:** Build passes + manual verification of all 3 success criteria

### Wave 0 Gaps

- [ ] No vitest in `apps/web` — Phase 6 changes are UI-only; manual visual verification is appropriate; no Wave 0 test infrastructure needed
- [ ] `@react-pdf/renderer` TypeScript types: included with package, no separate `@types/` package needed [VERIFIED: npm view]

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No — no new auth flows | — |
| V3 Session Management | No — existing Clerk session unchanged | — |
| V4 Access Control | No — PDF export gated by existing `results.length > 0` check | — |
| V5 Input Validation | Low — PDF renders `results` array from API which is already validated at worker | No new user inputs; org name from Clerk (trusted source) |
| V6 Cryptography | No — no new crypto | — |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via org name injected into PDF | Tampering | `@react-pdf/renderer` Text component renders as PDF text nodes, not HTML — XSS not applicable in PDF context |
| localStorage theme poisoning | Tampering | `theme` key only accepts `'dark'`/`'light'`; invalid values fall through to default light mode; no eval or DOM injection |

**Security note:** Phase 6 introduces no new API endpoints, no new authentication flows, and no new user input surfaces. Risk surface is minimal.

---

## Sources

### Primary (HIGH confidence)

- `tailwindcss.com/docs/dark-mode` — `@custom-variant dark` syntax, JS toggle pattern, FOUC prevention script pattern
- `react-pdf.org/components` — Document, Page, View, Text, PDFDownloadLink APIs; `orientation="landscape"` prop
- `react-pdf.org/fonts` — Font.register API; TTF/WOFF-only constraint; internet connectivity requirement
- `react-pdf.org/styling` — Flexbox support confirmed; CSS Grid not supported; table via View/flexbox
- npm registry (`npm view @react-pdf/renderer`) — version 4.4.1 confirmed as latest stable on 2026-04-11
- npm registry (`npm view tailwindcss`) — version 4.2.2 confirmed
- npm registry (`npm view lucide-react`) — version 1.8.0 confirmed
- `brand-identity-pharma-apps/brand-identity/brand-guidelines.md` — PharmIQ color palette, dark bg `#0F172A`, typography (Space Grotesk + Inter), hex-chart motif

### Secondary (MEDIUM confidence)

- GitHub diegomura/react-pdf — Vite compatibility issue #2454 (closed COMPLETED 2024); v3+ works with Vite without shims
- Multiple community sources — FOUC prevention inline script pattern; consistent approach confirmed across DEV.to, CSS-Tricks, Tailwind docs

### Tertiary (LOW confidence)

- Cloudflare Community — Google Fonts CORS on Cloudflare Pages (unverified for this specific deployment configuration)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all package versions npm-verified
- Architecture patterns: HIGH — all code patterns drawn from official docs
- Dark palette values: MEDIUM — brand guide specifies only page background; surface/text dark values derived from Slate scale (consistent with existing light palette)
- Pitfalls: MEDIUM — Vite compat and font loading pitfalls from community sources, cross-referenced with official docs
- Security: HIGH — minimal new surface, straightforward analysis

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable libraries; 30-day window)
