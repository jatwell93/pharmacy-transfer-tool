# Roadmap: PharmIQ Stock Transfer

## Overview

This roadmap rebuilds the PharmIQ Stock Transfer tool from a working Django + React prototype onto the Cloudflare Workers + NEON Postgres + Clerk production stack. The build follows a strict dependency order: infrastructure and auth come first (nothing else is safe without them), the algorithm is audited before it is ported, file upload is built before matching runs against it, freemium enforcement gates real usage before external users are onboarded, and brand polish closes out the milestone. Six phases deliver a fully functional, multi-tenant, freemium-enabled dead-stock matching tool.

## Pre-Flight Setup

Run these once before Phase 1 to reduce manual dashboard work and equip Claude with the right tools.

### 1. Install Relevant Skills

Skills add domain-specific best-practice guidance to Claude's context for this project:

```bash
# Cloudflare Workers patterns, Wrangler config, edge runtime gotchas
npx skills add https://github.com/cloudflare/workers-sdk --skill workers-best-practices

# NEON Postgres connection patterns for serverless environments
npx skills add https://github.com/neondatabase/neon --skill neon-serverless
```

> Run `/skills` in Claude to see what's installed. Add others as needed.

### 2. Set Up MCP Servers

MCP servers let Claude directly manage Cloudflare and NEON resources without you manually using their dashboards. This removes you as the bottleneck for infra setup steps.

**Cloudflare MCP** — manage Workers, R2 buckets, Pages projects, DNS, secrets, and KV from Claude:
```bash
# Install the Cloudflare MCP server
npx @cloudflare/mcp-server-cloudflare
```
Then add to your Claude MCP config (`~/.claude/mcp.json` or Claude Desktop settings):
```json
{
  "cloudflare": {
    "command": "npx",
    "args": ["@cloudflare/mcp-server-cloudflare"],
    "env": { "CLOUDFLARE_API_TOKEN": "your-token-here" }
  }
}
```
Get your API token: Cloudflare Dashboard → My Profile ��� API Tokens → Create Token (use "Edit Cloudflare Workers" template).

**NEON MCP** — create database branches, run migrations, inspect schemas from Claude:
```bash
npx @neondatabase/mcp-server-neon
```
```json
{
  "neon": {
    "command": "npx",
    "args": ["@neondatabase/mcp-server-neon"],
    "env": { "NEON_API_KEY": "your-api-key-here" }
  }
}
```
Get your API key: NEON Console → Account → API Keys.

> Once configured, Claude can create NEON projects, run `wrangler` commands, set Workers secrets, and manage R2 buckets directly — no dashboard switching needed.

### 3. Workers Paid Plan

⚠️ **Hard blocker** — the free plan's 10 ms CPU limit will fail on the first CSV parse. Upgrade before Phase 1:
Cloudflare Dashboard → Workers & Pages → Plans → Upgrade to Paid ($5/month base).

---

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Infrastructure, Clerk auth, NEON schema, and authenticated API skeleton — everything else depends on this (completed 2026-03-28)
- [x] **Phase 2: Logic Audit** - Audit and document the existing Django matching algorithm before porting to TypeScript (completed 2026-03-29)
- [ ] **Phase 3: File Upload Pipeline** - Multi-store FRED CSV/XLSX upload, parsing, persistence, and per-store status UI
- [ ] **Phase 4: Matching Algorithm** - Port the audited algorithm, add months-cover cap, and display results in a virtualized table
- [ ] **Phase 5: Freemium and Billing** - Atomic usage metering, upgrade prompt, and Stripe subscription integration
- [ ] **Phase 6: Brand, UI and Export** - PharmIQ design system, dark mode, and client-side PDF export

## Phase Details

### Phase 1: Foundation
**Goal**: A deployable, authenticated scaffold exists — developers can make an authenticated API call that returns the caller's verified org ID, and all NEON tables with RLS are in place
**Depends on**: Nothing (first phase) — manual prerequisite: upgrade Cloudflare Workers account to Paid plan before starting
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. User can sign in via Clerk (email or social) and is redirected to the app dashboard
  2. An authenticated API request to the Hono Worker returns the caller's org_id sourced exclusively from the verified Clerk JWT
  3. A request with a missing or invalid Clerk JWT is rejected with a 401 before any database operation runs
  4. A request from a user with no active Clerk organisation is rejected with a 403 before any database operation runs
  5. All NEON tables exist with org_id columns and Row Level Security policies enforced
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Worker API with Clerk auth middleware, NEON schema with RLS, and tests
- [x] 01-02-PLAN.md — React SPA with Clerk auth, PharmIQ-branded app shell
- [x] 01-03-PLAN.md — Integration wiring and end-to-end auth verification
**UI hint**: yes

### Phase 2: Logic Audit
**Goal**: The existing Django matching algorithm is fully documented and all correctness issues are captured as failing test cases before any TypeScript is written
**Depends on**: Phase 1
**Requirements**: AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):
  1. A written algorithm spec exists covering sell-through filter, months-cover cap formula, ranged sort order, is_ranged parsing, and NaN/missing-value edge cases — each with a worked example
  2. The ported TypeScript matching function has passing unit tests for every documented algorithm case, including edge cases that the Django version handled incorrectly
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — Algorithm spec document and TypeScript type contracts
- [x] 02-02-PLAN.md — TDD implementation of matchTransfers with full test coverage

### Phase 3: File Upload Pipeline
**Goal**: A pharmacy manager can upload ROU and dead-stock FRED exports for each store in their group, see the upload status of each store, and replace individual stores without re-uploading the entire group
**Depends on**: Phase 1
**Requirements**: UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04, UPLOAD-05, UPLOAD-06
**Success Criteria** (what must be TRUE):
  1. User can upload a FRED Office ROU CSV or XLSX file for a named store and see it appear in the store list
  2. User can upload a FRED Office dead stock CSV or XLSX file for a named store and see it appear in the store list
  3. Upload data persists in NEON — closing the browser and returning shows previously uploaded stores without re-uploading
  4. User can see the date and time each store's data was last uploaded and replace a single store independently
  5. Files with UTF-8 BOM, CRLF line endings, or blank title rows before the header parse correctly without manual preprocessing
  6. XLSX files are parsed via SheetJS; files over 5 MB are rejected with a clear error message before upload
**Plans**: 3 plans
Plans:
- [x] 03-01-PLAN.md — SheetJS install, CSV/XLSX parser functions, FRED header aliasing, and unit tests
- [ ] 03-02-PLAN.md — POST /upload and GET /stores Worker routes with NEON bulk insert
- [ ] 03-03-PLAN.md — Upload page UI with store card grid, modal dialog, and routing
**UI hint**: yes

### Phase 4: Matching Algorithm
**Goal**: A pharmacy manager can trigger a match run against all uploaded store data with a chosen months-cover target and view the full ranked results in a virtualized table
**Depends on**: Phase 2, Phase 3
**Requirements**: MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05, MATCH-06, MATCH-07, RESULTS-01
**Success Criteria** (what must be TRUE):
  1. Clicking "Run Match" executes the algorithm and displays results — source store, destination store, SKU, qty to transfer, destination ROU, and months-cover derived column
  2. User can set a months-cover target; transfer quantities reflect the formula (cover × destination ROU) − destination existing SOH, clamped to zero
  3. Destination stores whose existing SOH already exceeds the months-cover target are absent from results
  4. Results are sorted ranged-first, then by ROU descending within each group
  5. is_ranged values of "checked", "yes", "true", "1", "y" (case-insensitive) are all recognised as ranged
  6. Missing or NaN ROU/SOH values produce a visible data quality warning rather than silently defaulting to zero
**Plans**: TBD
**UI hint**: yes

### Phase 5: Freemium and Billing
**Goal**: The free tier limit is enforced atomically in the Worker before every match run, users can see their usage, and paying customers can subscribe via Stripe to unlock unlimited runs
**Depends on**: Phase 4
**Requirements**: BILLING-01, BILLING-02, BILLING-03, BILLING-04
**Success Criteria** (what must be TRUE):
  1. A free-tier org that has already run 1 match this calendar month is blocked with a 429 response before the algorithm executes
  2. The UI displays the current match run count and monthly limit (e.g., "1 of 1 free run used this month") without requiring a page refresh after each run
  3. When the free limit is reached the user sees an upgrade prompt with a working link to Stripe Checkout
  4. After completing Stripe payment a Stripe webhook updates the org's plan to paid and subsequent match runs succeed without limit enforcement
  5. Cancelling a paid subscription via Stripe triggers a webhook that reverts the org to the free tier
**Plans**: TBD
**UI hint**: yes

### Phase 6: Brand, UI and Export
**Goal**: The app looks and feels like part of the PharmIQ product family and users can export match results as a PDF
**Depends on**: Phase 4
**Requirements**: BRAND-01, BRAND-02, RESULTS-02
**Success Criteria** (what must be TRUE):
  1. All UI elements use the PharmIQ brand palette (teal #0F766E primary, amber #D97706 accent, navy #0F172A dark base) and Space Grotesk headings with Inter body text
  2. User can toggle dark mode and the preference persists across sessions
  3. User can export the current match results as a PDF containing the full results table
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-03-29 |
| 2. Logic Audit | 2/2 | Complete   | 2026-03-29 |
| 3. File Upload Pipeline | 0/3 | Planned | - |
| 4. Matching Algorithm | 0/TBD | Not started | - |
| 5. Freemium and Billing | 0/TBD | Not started | - |
| 6. Brand, UI and Export | 0/TBD | Not started | - |
