# Technology Stack

**Project:** PharmIQ Stock Transfer
**Researched:** 2026-03-28
**Overall confidence:** HIGH (all versions verified against npm registry and official documentation)

---

## Overview

This is a greenfield rebuild of a working Django + SQLite + React (CRA) app onto the Cloudflare Workers + NEON Postgres + Clerk stack. The stack must match a companion app (use-by dates tracker) already running on this platform. The primary technical challenge is file processing (CSV/XLSX ingestion) inside a constrained Workers runtime with no Node.js `fs`, limited memory (128 MB), and CPU time limits.

---

## Recommended Stack

### Runtime & Deployment

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Workers | N/A (platform) | API/backend runtime | Matches companion app; edge-deployed, zero cold-start for V8 isolates; stateless serverless model fits the workload |
| Cloudflare Pages | N/A (platform) | Frontend hosting | Same project, served from same Cloudflare account; Git-based deploys, preview URLs on PRs |
| `wrangler` | 4.78.0 | Worker CLI / deploy tool | Official Cloudflare toolchain; required for local dev, secrets, and deploy |
| `@cloudflare/workers-types` | 4.20260317.1 | TypeScript types for Workers bindings | Gives type safety for `env.R2`, `env.HYPERDRIVE`, `env.CLERK_SECRET_KEY`, etc. |

**wrangler.jsonc flags required:**
```json
{
  "compatibility_flags": ["nodejs_compat"],
  "compatibility_date": "2025-09-27"
}
```
`nodejs_compat` is mandatory for `@neondatabase/serverless`, `pg`, and other packages that use Node.js built-ins. As of Sept 2025, this flag also enables `node:fs` — do not rely on that for file processing (use in-memory ArrayBuffer instead).

---

### API Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `hono` | 4.12.9 | HTTP router/framework on Workers | Purpose-built for Workers and Web Standards APIs; fastest router benchmarked on Workers; first-class TypeScript; `c.env` for bindings (not `process.env`); built-in middleware primitives |
| `@hono/clerk-auth` | 3.1.0 | Clerk auth middleware for Hono | Official Hono integration; wraps `@clerk/backend`'s `authenticateRequest`; provides `clerkMiddleware()` and `getAuth(c)` helpers |
| `@clerk/backend` | 3.2.3 | Clerk SDK for server-side JWT verification | Works in V8 isolates; exposes `createClerkClient`, `authenticateRequest()`, `verifyToken()` |

**Auth pattern (Hono + Clerk):**
```typescript
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.use("*", clerkMiddleware());

app.post("/api/upload", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);
  // auth.orgId for tenancy scoping
});
```

Required env vars (via `wrangler secret put`):
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`

**Confidence: HIGH** — verified against Hono docs, @hono/clerk-auth npm package, and Clerk backend SDK docs.

---

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| NEON Postgres | N/A (hosted service) | Persistent data store per-org | Scale-to-zero serverless Postgres; matches companion app; supports PgBouncer connection pooling; free tier includes 0.5 GB storage |
| `@neondatabase/serverless` | 1.0.2 | Neon HTTP/WebSocket driver | Connects over HTTP (no TCP) — required in Workers where TCP connections are not native |
| `drizzle-orm` | 0.45.2 | ORM and query builder | Type-safe SQL; schema-as-code; lightweight; no runtime reflection; Neon HTTP driver integration is first-class |
| `drizzle-kit` | 0.31.10 | Migration tooling (dev-time only) | Generates SQL migrations from Drizzle schema; run locally against Neon dev branch |

**Connection setup (HTTP driver — preferred for Workers):**
```typescript
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

// Inside fetch handler — NOT at module top level
const sql = neon(env.DATABASE_URL);
const db = drizzle(sql);
```

**Hyperdrive option:** Cloudflare Hyperdrive (included free up to 100k queries/day, unlimited on paid $5/month plan) provides connection pooling at the network level and allows using the standard `pg` driver. However, for this app's workload (match runs are batch operations, not high-frequency OLTP), the `@neondatabase/serverless` HTTP driver is simpler and avoids a Hyperdrive configuration dependency. Use Hyperdrive if query latency becomes measurable under load in production.

**Do NOT use `drizzle-orm/neon-serverless` (WebSocket pool) in Workers.** WebSocket connections cannot outlive a single Worker request, making the Pool constructor pattern unsafe. Use `drizzle-orm/neon-http` exclusively.

**Confidence: HIGH** — verified against Neon docs (`neon.com/docs/guides/cloudflare-workers`), Drizzle ORM docs (`orm.drizzle.team/docs/connect-neon`), and @neondatabase/serverless npm.

---

### Frontend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `react` | 19.2.4 | UI framework | Industry standard; required for Clerk's `@clerk/react` |
| `vite` | 8.0.3 | Build tool / dev server | Replaces CRA (unmaintained since 2023); official Cloudflare Vite plugin support; HMR with Workers runtime in dev |
| `@cloudflare/vite-plugin` | 1.30.2 | Vite plugin for Workers dev/build | Bridges Vite dev server with Workers runtime; GA as of April 2025; hot reload across frontend + Worker; SPA mode via `not_found_handling = "single-page-application"` |
| `@clerk/react` | 6.1.3 | Clerk React components | `<ClerkProvider>`, `useAuth()`, `useUser()`, `<SignIn>`, `<SignUp>` |
| `tailwindcss` | 4.2.2 | Utility CSS | v4 (current); `@import "tailwindcss"` syntax; compatible with shadcn/ui |
| `shadcn/ui` | (copied components) | Component primitives | Copy-owns components built on Radix UI + Tailwind; no versioning conflict; updated for Tailwind v4 + React 19 |
| `@tanstack/react-table` | 8.21.3 | Virtualized table for match results | Required for displaying N×M transfer match results without DOM explosion; existing app uses virtualized list |
| `@tanstack/react-query` | 5.95.2 | Server state / async data | Caching, loading states, mutation invalidation for upload/match endpoints |
| `react-hook-form` | 7.72.0 | Form state | Months-cover input, upload forms |
| `zod` | 4.3.6 | Schema validation (shared) | Validate API request bodies on the Worker and form inputs on the frontend |

**Do NOT use Create React App.** It is unmaintained (last release 2022), uses Webpack (slow), and has no Cloudflare integration path.

**Confidence: HIGH** — verified against Cloudflare Vite plugin changelog (GA April 2025), npm registry, Cloudflare Pages React deployment docs.

---

### File Storage

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare R2 | N/A (platform) | Store raw uploaded CSV/XLSX files per org | S3-compatible; no egress fees; bound directly to Worker via `env.R2`; free tier: 10 GB storage, 1M Class A ops/month |
| `aws4fetch` | 1.0.20 | Presigned URL generation for R2 | The AWS SDK v3 does NOT work in Workers (uses Node.js APIs); `aws4fetch` is Web Crypto compatible and works natively in V8 isolates |

**Upload flow (recommended for this app):**

```
1. Frontend requests presigned PUT URL from Worker API
2. Worker generates R2 presigned URL via aws4fetch (short TTL ~5 min)
3. Browser uploads file directly to R2 (no proxying through Worker)
4. Browser POSTs the R2 key to Worker to trigger processing
5. Worker reads from R2, parses in-memory, writes results to Neon
```

This avoids the Worker's 100 MB request body size limit (Free/Pro Cloudflare plan) and keeps large file bytes out of Worker memory during the request-response cycle.

**Confidence: HIGH** — verified against Cloudflare R2 presigned URLs docs and `aws4fetch` Worker-compatibility docs.

---

### File Processing (CSV/XLSX Parsing in Workers)

This is the most constrained area of the stack. Workers have **128 MB memory** and **30 seconds CPU time** (paid plan default; 5 minutes max opt-in; 10 ms on free plan). No `node:fs`. Files must be processed from `ArrayBuffer` or `Uint8Array` in memory.

| Technology | Version | Purpose | Confidence | Notes |
|------------|---------|---------|------------|-------|
| `papaparse` | 5.5.3 | CSV parsing in Worker | HIGH | Pure JS, no Node deps; accepts string input; works in Workers; use `Papa.parse(csvText, { header: true, skipEmptyLines: true })` |
| SheetJS (xlsx) | 0.20.3 | XLSX parsing in Worker | MEDIUM | **CRITICAL: Do NOT use the `xlsx` package on npm (v0.18.5, unmaintained, security flags).** Install directly from SheetJS CDN: `npm i --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Works in Workers from `ArrayBuffer`: `XLSX.read(arrayBuffer, { type: "buffer" })` |

**FRED export file sizes:** Based on the use case (per-store ROU + dead stock reports for a pharmacy network), files are likely 100–2000 rows each. This is well within the 128 MB memory limit. Large-file streaming is not required for this use case.

**Worker-side XLSX parsing pattern:**
```typescript
// File already stored in R2; fetch as ArrayBuffer
const object = await env.R2.get(r2Key);
const arrayBuffer = await object.arrayBuffer();

// CSV
import Papa from "papaparse";
const { data } = Papa.parse(
  new TextDecoder().decode(arrayBuffer),
  { header: true, skipEmptyLines: true }
);

// XLSX
import * as XLSX from "xlsx";
const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
```

**Confidence for papaparse: HIGH.** Confirmed working in Cloudflare Workers via community examples and Cloudflare forum.
**Confidence for SheetJS 0.20.3: MEDIUM.** The library claims Web Standard compatibility but is no longer on npm mainline; using the CDN tarball is required and introduces a vendoring dependency.

---

### Export (CSV, XLSX, PDF)

Export should be **client-side** wherever possible. Worker-side PDF generation is constrained and fragile.

| Export | Method | Library | Why |
|--------|--------|---------|-----|
| CSV | Client-side | `papaparse` (unparse) or native `Blob` + `URL.createObjectURL` | Trivial in browser; no library needed beyond `papaparse` already in the stack |
| XLSX | Client-side | SheetJS (`xlsx` CDN tarball 0.20.3) | Already in stack for parsing; `XLSX.writeFile()` / `XLSX.write()` for export; runs well in browser |
| PDF | Client-side | `@react-pdf/renderer` 4.3.2 | React-component model for PDF layout matches the existing "match results" table design; runs fully in browser; avoids Worker PDF generation entirely |

**Do NOT attempt PDF generation in a Worker.** jsPDF and pdfmake both have reported module compatibility issues in Workers. Cloudflare Browser Rendering (Puppeteer) works but adds cost and latency — overkill for a tabular report.

**Do NOT use `pdf-lib` for new PDF generation in this app.** It excels at manipulating existing PDFs, not generating from data.

**Confidence: HIGH for CSV. MEDIUM for XLSX (same SheetJS caveat). HIGH for @react-pdf/renderer (pure JS, browser-native, well-maintained).**

---

### Validation & Type Safety

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `zod` | 4.3.6 | Schema validation | Shared between Worker (request body validation) and frontend (form validation via `react-hook-form` + Zod resolver); single source of truth for upload payload shapes |

Define shared schema types in a `packages/shared` or `src/shared/` directory imported by both Worker and frontend.

---

### Dev Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | 5.x (via Vite) | Type safety across Worker + frontend | Required for `drizzle-orm` schema inference, `@cloudflare/workers-types` bindings, Zod inference |
| `@cloudflare/vitest-pool-workers` | latest | Unit tests running in Workers runtime | Official Cloudflare test pool; tests run in actual V8 isolate context, not Node.js — catches runtime incompatibilities |
| `vitest` | latest | Test runner | Works with `@cloudflare/vitest-pool-workers`; fastest for the Vite ecosystem |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| API framework | Hono | itty-router | Hono has better TypeScript, middleware, and official Cloudflare docs coverage |
| API framework | Hono | Express | Express requires Node.js TCP; does not run in Workers |
| ORM | Drizzle | Prisma | Prisma uses a query engine binary incompatible with Workers; Drizzle is pure JS |
| ORM | Drizzle | direct SQL via `neon()` | Drizzle adds type safety and migration management at near-zero overhead |
| DB driver | `@neondatabase/serverless` (HTTP) | `pg` (node-postgres) | `pg` requires TCP which needs Hyperdrive proxy; adds operational complexity for low query volume |
| DB driver | `@neondatabase/serverless` (HTTP) | `@neondatabase/serverless` (WebSocket Pool) | WebSocket Pool objects cannot outlive a single Worker request — unsafe pattern |
| Frontend | Vite + React 19 | Create React App | CRA unmaintained since 2022; no Cloudflare Vite plugin support |
| Frontend | Vite + React 19 | Next.js | Next.js SSR/RSC adds complexity not needed for this SPA-style tool; Pages-only deploy is simpler |
| CSV parse | `papaparse` | `csv-parse` | `csv-parse` has Node.js stream dependencies that may fail in Workers |
| XLSX parse | SheetJS (CDN tarball) | ExcelJS | ExcelJS has significant memory issues with its workbook model; not designed for Workers; SheetJS reads from ArrayBuffer natively |
| XLSX parse | SheetJS (CDN tarball) | `xlsx` (npm 0.18.5) | npm version is unmaintained, 2+ years behind, and has known security false-positives that trigger CI alerts |
| PDF export | `@react-pdf/renderer` (client) | Cloudflare Browser Rendering (Puppeteer) | Adds cost ($0.005/1000 pages), latency, and operational surface area for a report that can be generated in the browser |
| PDF export | `@react-pdf/renderer` (client) | jsPDF | jsPDF is not modular-import safe in Workers and struggles with complex layouts |
| Auth | Clerk | Auth.js (next-auth) | Auth.js adapter for Cloudflare Workers is experimental; companion app already uses Clerk — same users, same orgs |
| Auth | Clerk + `@hono/clerk-auth` | Manual JWT verify | `@hono/clerk-auth` handles JWKS fetching and token verification automatically; manual implementation is error-prone |
| Component library | shadcn/ui | MUI / Chakra | Both add heavy bundle weight; shadcn components are copy-owned and already Tailwind-based, matching PharmIQ brand guide |

---

## Cloudflare Workers Constraints Reference

These constraints must inform implementation decisions throughout the roadmap.

| Constraint | Free Plan | Paid Plan | Implication |
|------------|-----------|-----------|-------------|
| CPU time per request | 10 ms | 30 s default, up to 5 min opt-in | FRED file parsing (100–2000 rows) fits in paid plan 30 s default; **free plan cannot run CSV parsing** — the matching algorithm alone will exceed 10 ms |
| Memory per isolate | 128 MB | 128 MB | Sets ceiling for in-memory file size; FRED exports of typical pharmacy size are well under limit, but multi-store batch processing should be sequential, not parallel |
| Request body size | 100 MB (Free/Pro) | Up to 500 MB (Enterprise) | Use R2 presigned URLs so the Worker never receives raw file bytes |
| No native `node:fs` (pre-2025-09-01) | — | — | Files must be processed from `ArrayBuffer`; do not use streaming file I/O patterns |
| No TCP connections | — | — | Must use `@neondatabase/serverless` HTTP driver or Hyperdrive for Postgres |
| Worker bundle size (compressed) | 3 MB | 10 MB | SheetJS + papaparse add ~500 KB compressed; within limits on paid plan, borderline on free — use dynamic imports if needed |
| WebSocket lifetime | Single request | Single request | No persistent DB connection pools; create and close connections per request |

**Business model implication:** The 1 match run/month free tier gate must be enforced in the Worker (not the frontend). However, the actual CSV processing cannot run on Cloudflare's free Worker plan (10 ms CPU limit). The app requires the **Workers Paid plan ($5/month)** for any production use. This is consistent with a freemium SaaS model where the operator pays for the infrastructure.

---

## Installation

```bash
# Worker (run in worker package / root)
npm install hono @hono/clerk-auth @clerk/backend
npm install @neondatabase/serverless drizzle-orm
npm install papaparse zod
npm install aws4fetch
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

# Worker dev dependencies
npm install -D wrangler drizzle-kit @cloudflare/workers-types typescript
npm install -D @cloudflare/vitest-pool-workers vitest

# Frontend (run in frontend package / pages dir)
npm install react react-dom @clerk/react
npm install @tanstack/react-query @tanstack/react-table
npm install react-hook-form zod @hookform/resolvers
npm install tailwindcss @react-pdf/renderer
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

# Frontend dev dependencies
npm install -D vite @cloudflare/vite-plugin @vitejs/plugin-react
npm install -D typescript @cloudflare/workers-types
```

---

## Sources

- Cloudflare Workers Limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers Limits (CPU 5-min opt-in, March 2025): https://developers.cloudflare.com/changelog/post/2025-03-25-higher-cpu-limits/
- Neon + Cloudflare Workers guide: https://neon.com/docs/guides/cloudflare-workers
- Neon serverless driver docs: https://neon.com/docs/serverless/serverless-driver
- Drizzle ORM + Neon connection guide: https://orm.drizzle.team/docs/connect-neon
- Cloudflare Hyperdrive + Neon: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/
- Hyperdrive pricing: https://developers.cloudflare.com/hyperdrive/platform/pricing/
- Hono on Cloudflare Workers: https://hono.dev/docs/getting-started/cloudflare-workers
- Hono official Cloudflare docs: https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
- @hono/clerk-auth + Hono example: https://honobyexample.com/posts/clerk-backend
- Clerk backend authenticateRequest: https://clerk.com/docs/reference/backend/authenticate-request
- Cloudflare R2 upload objects: https://developers.cloudflare.com/r2/objects/upload-objects/
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- R2 presigned URL Hono guide: https://lirantal.com/blog/cloudflare-r2-presigned-url-uploads-hono
- Cloudflare Vite plugin (GA April 2025): https://developers.cloudflare.com/changelog/post/2025-04-08-vite-plugin/
- Cloudflare React + Vite guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- SheetJS installation (CDN required): https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- Node.js compat in Workers (2025): https://blog.cloudflare.com/nodejs-workers-2025/
- papaparse + Cloudflare Workers community: https://community.cloudflare.com/t/how-to-use-papaparse-or-streaming-csv-workers-to-convert-csv-to-json/443163
- @react-pdf/renderer overview: https://dev.to/ansonch/6-open-source-pdf-generation-and-modification-libraries-every-react-dev-should-know-in-2025-13g0
- TanStack Query v5: https://tanstack.com/query/v5/docs/framework/react/overview
