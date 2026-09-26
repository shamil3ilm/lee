# lee — Architecture Review (2026-09-26)

**Status:** Proposed. Items A1–A3 are urgent; the rest are ordered by the roadmap.
**Context:** 593 TS/TSX files, 26 tables, one Next.js 16 app on **Vercel Hobby + Neon Free** (limits in v17 §9.6). The scope grows fast: Playground engine, Forge agents, Scam Shield, Opportunity Score, Radar. This review checks the current code against those limits and that growth.

## Findings in the current code
| # | Finding | Evidence | Risk |
|---|---|---|---|
| F1 | Every deployment runs migrations against the database, previews included | `vercel.json` buildCommand `pnpm db:migrate && pnpm build`; no `VERCEL_ENV` guard in `lib/db/migrate.ts` | A preview build of an unmerged branch can migrate the **production** DB if previews share `DATABASE_URL` |
| F2 | Uploaded files are stored as `bytea` in Neon, up to 5 MB each | `document_assets.bytes`, `MAX_ASSET_BYTES = 5 MB` | ~100 files fill the 0.5 GB Neon limit; when storage is full, writes fail |
| F3 | One cron function does everything for every user, sequentially, in 60 s | `app/api/cron/sync-all` (discovery + AI, Gmail, digest, follow-ups, reminders); Hobby cron is daily only | Grows past its time limit as features are added; one slow step starves the rest; no resume |
| F4 | PDF rendering runs on the server | `lib/pdf/render.ts` (`@react-pdf` `renderToBuffer`), `lib/documents/merge.ts` | Spends the 4 h/month Active CPU budget |
| F5 | TCP Postgres driver with no confirmed pooled URL | `postgres(url, { max: 1 })`; `@neondatabase/serverless` installed but unused | Cold-start latency and connection churn on serverless; Neon wake-ups |
| F6 | No caching layer | zero uses of Next cache APIs (`'use cache'`, `cacheLife`, tags) | Every page view wakes Neon and spends CPU |
| F7 | LaTeX compile depends on a third-party service | `latexonline.cc` in `lib/latex/compile.ts` | Rate limits and outages; conflicts with the "no external providers" direction |
| F8 | Feature code is well organised by domain (`lib/<feature>`), but boundaries are by convention only | 30+ `lib/*` folders importing each other freely | Coupling grows as the Playground and agents land |

## Decisions
### A1 — Migrations only on production (urgent)
- Run `db:migrate` only when `VERCEL_ENV === 'production'`; preview builds skip it and fail loudly if the schema is behind.
- Preview deployments use a **Neon branch** (Free allows 10), never the production database.
- Migrations stay additive and backwards-compatible: expand → migrate → contract.

### A2 — Storage budget for files (urgent)
- Compress and downscale images in the browser before upload.
- Deduplicate by content hash, and cap total asset storage (default 150 MB, shown in the free-tier meter).
- Generated PDFs are rebuilt on demand, never stored.
- **Decision (2026-09-26, user request): Google Drive is the primary file store.** Details:
  - **Scope:** add `https://www.googleapis.com/auth/drive.file` to the existing Google sign-in scopes. It only grants access to files lee creates or the user explicitly picks, not the whole Drive. It's classed as non-sensitive, so it adds no extra verification on top of the Gmail scopes the app already uses. Existing users re-consent once (incremental authorization).
  - **Layout:** an `lee/` folder in the user's Drive with `Documents/<document>/assets`, `Exports/` and `PDFs/`. Neon stores only the Drive file id, name, size, mime type and a content hash (a few hundred bytes per file).
  - **Access:** uploads and downloads go browser ↔ Drive where possible (resumable upload with a short-lived `drive.file` access token), so bytes don't pass through Vercel functions (4 h CPU, 10 GB origin transfer). The server fetches from Drive only when it must, for example to compile LaTeX, and caches by content hash.
  - **Picker:** use the Google Picker to attach existing Drive files (CVs, certificates) without re-uploading.
  - **Storage interface:** `lib/storage/asset-store.ts` (put/get/delete/usage). Backends: `drive` (default once connected) and `postgres` (fallback when Drive isn't connected, capped at 150 MB). Existing bytea assets migrate to Drive with a one-time, resumable job, then their bytes are cleared.
  - **Failure handling:** if Drive access is revoked or expires, the UI shows "Reconnect Google Drive"; metadata stays, nothing is deleted. Tests mock the Drive API.
  - **Costs:** uses the user's free Google storage (15 GB shared with Gmail). Zero added cost.

### A3 — Durable job queue instead of one monolithic cron (urgent before more features)
- A `jobs` table: type, user, payload, `run_after`, attempts, `locked_until`, last error, idempotency key.
- Each daily cron (staggered, several jobs) **drains the queue within a time budget** (e.g. 240 s), checkpointing and leaving the rest for the next run.
- The same drain runs **opportunistically on user visits** (small batch, after the response is sent) so work isn't stuck waiting a day.
- Heavy or long work goes to GitHub Actions workers that call a signed internal endpoint: the Forge, backups, Lighthouse, benchmarks.
- Retries with backoff and a dead-letter state, shown in Settings.
- It is also a live learning example of queues, idempotency and backpressure.

### A4 — Move CPU to the browser
- CV, cover letter, debrief and prep-pack PDFs render client-side (`@react-pdf` supports the browser); PDF merge runs client-side with `pdf-lib`.
- Server keeps only a fallback for email attachments.
- Scoring that doesn't need secrets (CV score rules, Scam Shield rules, Opportunity Score) can run in both places; the server re-validates what it stores.

### A5 — Database access tuned for serverless Neon
- Use Neon's **pooled** connection string in production.
- Evaluate the Neon serverless driver (HTTP for one-shot queries, WebSocket for transactions) against the current driver, measuring cold-start latency and CU-hours. Keep PGlite for dev and tests.
- Add `statement_timeout` and query-size limits (protects the 5 GB egress).

### A6 — Caching with Next.js 16 cache APIs
- Cache read-heavy, rarely-changing data (profile, reference data, content packs, analytics aggregates) with tag-based invalidation on writes.
- Read the Next 16 caching guide in `node_modules/next/dist/docs/` before implementing; APIs differ from older versions.
- Goal: most page views don't wake Neon.

### A7 — Self-hosted LaTeX
- Evaluate an open-source WebAssembly TeX engine (SwiftLaTeX/busytex family) compiling **in the browser**, lazy-loaded and cached, within the engine asset budget (v13 §5.5).
- latexonline stays as a fallback until the in-browser engine covers the templates.
- The CV-score LaTeX path already avoids compiling.

### A8 — Modular monolith with enforced boundaries (pnpm workspace)
- `packages/sim`: the lee Sim engine. Framework-free, runs in the browser and in Node (for the Forge and CI).
- `packages/content`: schemas and validators for content packs, skills and scenarios.
- `packages/rules`: pure deterministic rule engines (scam, CV score, opportunity) shared by browser and server.
- `app/` + `lib/<feature>`: the web app. Each feature exposes `service`, `queries` and `types`; cross-feature imports go through services only.
- Dependency rules are enforced by lint (for example eslint-plugin-boundaries or dependency-cruiser) in CI.
- Keeps the Playground engine out of the main bundle, lets the Forge run the same code headless, and doubles as the Architecture kata (v13 §5.2).

### A9 — Observability that survives Hobby's 1-hour logs
- An `error_events` table plus structured logs with request IDs; client errors are reported through a small endpoint.
- The free-tier meter (v17 §9.6) reads usage and alerts at 70 % and 90 %.

### A10 — Security hardening that grows with the surface
- A signed service token (HMAC, short-lived) for GitHub Actions → app endpoints; no long-lived admin keys.
- Rate limits on AI and cron endpoints.
- CSP headers app-wide, plus COOP/COEP on Playground routes only.
- The test sign-in stays dev-only (being built with guards).

## Non-changes (deliberately kept)
- **One Next.js app on Vercel.** Microservices would multiply cold starts and free-tier usage; a modular monolith is the right shape at this scale.
- **Postgres (Neon) as the only server datastore.** No Redis or queue service; the `jobs` table is enough for one user.
- **Auth:** Google-only sign-in with connections for other services (v15); no additional identity providers.
- **AI:** provider abstraction and signal gates stay; open-source models are preferred via the v14 registry.

## Order
A1 → A2 → A3 (before Scam Shield network checks and email suggestions add more background work) → A9 with the free-tier meter → A4/A5/A6 (measured) → A8 (before lee Sim, step 7c) → A7 (with LaTeX Studio) → A10 continuously.
