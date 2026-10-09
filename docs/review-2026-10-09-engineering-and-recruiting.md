# lee: senior engineering and recruiter review (2026-10-09)

Two independent reviews of `origin/main` at `055a4c1`, written as two personas. Every score has evidence (file:line, a command, or a measured number). All example data is **synthetic** ("Ravi Kumar", "Asha Menon", "Example Pay"); no personal data of the owner is used. No app code was changed.

## Executive summary

| Review | Overall | In five lines |
|---|---|---|
| **A. Senior engineer / tech lead** | **6.6 / 10** | 1. Well-built core: typed (2 `any` in 155k lines), structured logging, a durable queue with retries and dead letters, a real-Postgres smoke job, 4,164 tests and no schema drift (40 migrations, `drizzle-kit generate` reports no changes). 2. Security is good for one user but not ready for anyone else: Next 16.3.5 has open advisories (upgrade to ≥ 16.3.8), Google OAuth tokens are stored in plaintext, and the SSRF guard is bypassed by `https://[::1]/` (verified). 3. Scope is the biggest risk: 155k lines, 70 tables and 78 API routes in 26 days for a single-user app, and the core job-search loop is about a quarter of it. 4. CI was red 36 times in 130 runs (28 %), with a 29-commit red streak pushed to main on Sep 25. Vercel deploys and migrates whether CI passes or not. 5. First fixes: upgrade Next, encrypt the Google tokens, harden SSRF, gate deploys on CI, then freeze features and cut the side projects. |
| **B. Senior tech recruiter (GCC and India)** | **6.2 / 10** | 1. Unusually honest: fact-locked tailoring ("missing never added", property-tested), interview-ready flags, and explained scores. These are real differentiators. 2. Discovery is compliant but thin where GCC hiring actually happens: LinkedIn, Bayt, NaukriGulf and GulfTalent arrive only through email alerts, and agencies and referrals are barely modelled. 3. The scorer gets the big calls right (it filters US-only and nationals-only roles, and puts a Dubai Laravel fintech role at 75) but has GCC-specific misses: "Saudi National Bank" in a JD hard-filters the job as nationals-only, and "visa, medical and air ticket provided" is not read as visa sponsorship. 4. lee's own CV scorer finds **0 work entries** in its default ATS and Brand templates (a false *critical* finding), and the Classic template prints on US Letter instead of A4. 5. Nothing helps with what most often sinks Indian candidates at the offer stage in the GCC: degree attestation (MOFA/HRD), agency fee scams (rated "safe" in a probe), duplicate agency submissions, and negotiating allowances. |

---

# Part A: Senior engineer / tech lead review

Persona: 15+ years, has run production SaaS. The question asked: is this codebase sound, safe and sustainable for what it is (a single-user app on free tiers, heading to an invite-only beta)?

## A.0 Method and raw numbers

| Measure | Value | How |
|---|---|---|
| Source | 1,459 TS/TSX files, 155,106 lines: `lib` 91,925 · `components` 45,728 · `app` 17,453; plus `content` 7,199 | `find … \| wc -l` |
| Tests | 367 test files: 231 unit, 136 integration, 31 e2e specs (≈ 76 e2e tests); ≈ 2,900 unit and integration cases; 53,632 test lines (0.35 test:src) | `find tests`, grep of `it(`/`test(` |
| Evals | 110 fixtures (32 discovery-match, 30 Scam Shield, 13 CV score, plus outreach, tailor-cv, parse-job, prep-pack, debrief, expenses) | `tests/eval/fixtures` |
| Schema | 70 tables, 755 columns, 88 indexes, 104 FKs (80 with `onDelete: cascade`), 40 migrations `0000`–`0039` | `drizzle-kit generate` against a copy of the migrations |
| API surface | 78 route handlers, 63 `lib/*` domains | `find app/api -name route.ts` |
| History | 650 commits in 26 days (139 on Sep 25 alone); 94.5 % conventional (614), 34 merges | `git log` |
| CI | 130 runs since Sep 24: 94 green, 36 red, 1 in progress | GitHub Actions API |
| Coverage run | 4,164 tests in 27 min: 4,158 passed, 3 skipped, **3 failed under instrumentation** (all pass when re-run without coverage). Because a test failed, v8 emitted **no report**. Estimate: 96 % of `lib` files (97 % of lines) are imported by a unit or integration test, but only 60/227 `app` and 45/417 `components` files | `pnpm vitest run --coverage` (serial, v8); import-graph reachability script |
| Dependencies | `pnpm audit --prod`: 10 advisories (1 critical, 3 high, 5 moderate, 1 low) | see A.4 |

## A.1 Scores

| # | Dimension | Weight | Score | Single most important fix |
|---|---|---|---|---|
| 1 | Architecture and modularity | 12 % | **6.5** | Enforce `lib/<feature>` boundaries in lint (service/queries/types only), and split `lib/db/schema.ts` (1,633 lines). |
| 2 | Code quality and readability | 10 % | **7.5** | Replace the 49 silent `.catch(() => undefined)` sites with a `logged()` helper, and merge the duplicate session helpers. |
| 3 | Testing | 12 % | **7.0** | Commit the AI eval snapshots so the prompt gate actually gates, run coverage in CI with thresholds, and protect `main` with required checks. |
| 4 | Security | 15 % | **6.0** | Upgrade Next to ≥ 16.3.8, encrypt Google tokens at rest, and resolve-then-check IPs in the SSRF guard (applied to every user-supplied URL). |
| 5 | Data and storage | 10 % | **7.5** | Add `statement_timeout`, an automated off-site `pg_dump`, and correct the README's backup claim. |
| 6 | Performance | 8 % | **6.5** | Cut per-route client JS (median ≈ 340 KB gzipped) and cache read-mostly data with Next 16's cache APIs. |
| 7 | Reliability and operations | 12 % | **7.0** | Make Vercel production deploys (and therefore migrations) wait for green CI. |
| 8 | Maintainability and DX | 8 % | **7.0** | Slow down: smaller PRs through review, no direct pushes to `main`. |
| 9 | Product engineering | 8 % | **4.5** | Freeze features. Cut or park Model Lab, Decisions/Laya, Expenses, Voice and the RUM pipeline; refocus on discover → apply → interview. |
| 10 | Compliance | 5 % | **7.0** | List every processor in the privacy page (Firecrawl, Google Places, GitHub, OpenRouter/Cerebras/Hugging Face, Cloudflare DoH, rdap.org, jsDelivr, Adzuna) and bump its date. |
| | **Overall (weighted)** | 100 % | **6.6** (6.65) | |

## A.2 Architecture and modularity: 6.5

**Good**
- Domain-first layout (`lib/discovery`, `lib/cv-score`, `lib/queue`, `lib/scam`, …), and the scoring engines are pure and deterministic. `lib/cv-score/compute.ts:1-4` imports no DB or env, so evals and the browser can run it.
- Infrastructure choices fit the platform. They come from an earlier architecture review (`docs/superpowers/specs/2026-09-26-employ-architecture-review.md`) and were carried out:
  - A1, migrate only on production: `lib/db/migration-target.ts:27-33`.
  - A2, files in the user's Drive: `lib/storage`.
  - A3, a Postgres job queue with `FOR UPDATE SKIP LOCKED` claims: `lib/queue/queue.ts:126-178`.
  - The DB client is lazy and survives serverless (`lib/db/client.ts`, 20 s idle timeout, 10 s connect timeout).
- `proxy.ts` is used correctly for Next 16, as a fast-path redirect and not the security boundary. Every route authenticates itself, which I checked for all 78 routes.

**Weak**
- **Boundaries exist by convention only.** Recommendation A8 (lint-enforced boundaries) was never done: `eslint.config.mjs` has no `no-restricted-imports` or boundaries rule. Nine `app/`/`components/` files import `@/lib/db/client` directly, including two React components (`components/dashboard/widgets.tsx`, `setup-widgets.tsx`).
- **File-size rule (≤ 800 lines).** Two offenders: `lib/db/schema.ts` (1,633) and `lib/analytics/service.ts` (989). Near the limit: `components/decision-playground.tsx` (696) and `lib/ai/fixtures.ts` (642). 26 more files are between 400 and 800 lines. The schema split has started (`schema-academy.ts`, `schema-apply.ts`, …) but the core tables are still in one file.
- **Duplication.** There are three session-to-user helpers: `lib/auth/require-session.ts:18`, `lib/cv-score/http.ts` (`sessionUserId`) and `lib/lab/http.ts` (`sessionUserId`). Cron auth is implemented twice: a constant-time version in `lib/queue/cron.ts:14-18`, and plain `!==` in `app/api/cron/{discover,reminders,retention}/route.ts`.
- **Breadth.** 63 domains for one user means a wide coupling surface. Discovery alone is 12k lines.

## A.3 Code quality and readability: 7.5

| Check | Result |
|---|---|
| `any` | **2** real uses, both in the Auth.js adapter seam with a comment (`lib/auth/config.ts:51,57`). Excellent. |
| `eslint-disable` / `@ts-ignore` | 8 |
| `TODO/FIXME/HACK` | 1. It is the SSRF DNS-rebinding TODO (`lib/ingest/ssrf.ts:3-6`), which matters (A.5). |
| `console.log` in source | 7. Elsewhere a structured logger is used (337 `logger.*` calls). |
| Empty `catch {}` | 1, inside an inline theme script (acceptable). |
| Silent `.catch(() => undefined/null/{})` | **49** sites. Some are intentional (pruning, best-effort), but each one hides a failure from `system_events`. |
| Validation | Zod at boundaries (env schema `lib/env/schema.ts`, adapter configs, the resume schema). |
| Dead code | knip was not run (memory-constrained machine; a 27-minute coverage run took priority). Grep found no obviously orphaned modules, but `app/api/cron/discover` and `/api/cron/sync-all` are legacy aliases kept alive. |

Naming and comments are well above average. The comments explain *why* (for example `lib/db/client.ts` on the PGlite worker forks), which is rare.

## A.4 Testing: 7.0

- **Pyramid:** 231 unit files, 136 integration files (PGlite, serial, `fileParallelism: false`), 31 Playwright specs (≈ 76 tests, 1 worker, `retries: 1` on CI), 110 eval fixtures run on every push (`pnpm eval`). A `postgres-smoke` job runs migrations and `scripts/pg-smoke.ts` against real Postgres 17. It was added after a PGlite-only green build broke `/analytics` on Neon. That was a good lesson, well applied.
- **Coverage.** One serial run (`pnpm vitest run --coverage`, about 27 min) executed 4,164 tests: 4,158 passed, 3 skipped, 3 failed.
  - Two of the failures are wall-clock tests that exceed the 5 s default under instrumentation: `tests/unit/latex-zip-import.test.ts:86` and `tests/integration/latex-compile-slow-service.test.ts:127`.
  - One is order-dependent: `tests/integration/reputation-refresh.test.ts:127` got `queued` instead of `recent`.
  - All three pass when re-run on their own without coverage.
  - Because of the failures, v8 wrote no report (`reportOnFailure` is off), so I **estimate**. An import-graph walk from every unit and integration test reaches 780/815 `lib` files (≈ 97 % of `lib` lines), but only 60/227 `app` and 45/417 `components` files.
  - Coverage `include` is `lib/**` only (`vitest.config.ts`). Its thresholds (70/65/70/60) are **never enforced**, because CI runs `pnpm test` without `--coverage`. Realistic line coverage of `lib` is probably 70–80 % (the config's own comment says about 70 %). UI and route code is covered only by e2e.
- **The eval gate is half a gate.** `pnpm tsx tests/eval/run.ts` passes all 75 deterministic fixtures:
  - CV score 13/13;
  - Scam Shield 30/30 (scams caught 14/14, legitimate postings quarantined 0/16, cautioned 1/16);
  - discovery-match 32/32.

  But it prints "No eval snapshots found yet". The 35 AI-output fixtures (outreach, tailor-cv, parse-job, prep-pack, debrief, expenses) have **no committed snapshots**, so CI's `pnpm eval` cannot catch a prompt regression.
- **Flakiness and discipline (GitHub Actions, 130 runs):**
  - 36 failures (28 %).
  - 29 of them are one streak on Sep 25, when commits kept landing on `main` while `pnpm lint`/`pnpm test` were red (for example runs 36101318413 and 36141746796 failed at `Run pnpm lint`).
  - Since Sep 26: 4 failures in about 60 runs, all at `Run pnpm test:e2e` (runs 37771403725, 37605172543, 37488045796, 36302847884).
  - The last two commits on `main` are flake fixes ("wait on durable state instead of transient toasts").
  - E2E alone takes up to 30 minutes per run.
- **Proxy risk:** `retries: 1` on CI hides first-attempt failures. Track first-attempt pass rate.
- **Gaps:** no tests for `app/` route handlers are counted in coverage, and no component tests (no `*.test.tsx` exists; `vitest.config.ts` includes only `*.test.ts`).

## A.5 Security: 6.0 (single-user) / 3.5 if the beta opened today

Severity-ranked. "Now" means exploitable in today's single-user deployment. "Beta" means it becomes exploitable once other people can sign in (`docs/superpowers/specs/2026-10-08-lee-invite-beta-design.md`).

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 | **High (now)** | Next 16.3.5 has open advisories: SSRF in Image Optimization (high), two SSG/ISR cache-poisoning issues and a `use cache` draft-mode leak (moderate), and RCE in `next/og` (critical, **not reachable**: no `next/og` import). `sharp` (high, librsvg CVE) and `source-map-js` (high, DoS) come in through `next`; `sprintf-js` (moderate) through `mammoth`. | `pnpm audit --prod`: 10 advisories. `next/image` is used in 2 files. | `pnpm up next@^16.3.8 eslint-config-next@^16.3.8`, then turn on Dependabot/Renovate with auto-merge on green CI. |
| S2 | **High (now)** | Google `refresh_token`, `access_token` and `id_token` are stored in **plaintext**, and the scopes include `gmail.readonly`, `gmail.send`, `calendar.events` and `drive.file`. A leaked Neon credential or backup means someone can read and send the owner's mail. | `lib/db/schema.ts:62-63`; beta audit §1.1 | Encrypt with the existing AES-GCM helper (`lib/lab/crypto.ts`), read only through `lib/google/tokens.ts`, and backfill. |
| S3 | Medium (now) / **High (beta)** | **The SSRF guard checks the hostname string only.** `new URL('https://[::1]/').hostname` is `[::1]` and `isIP('[::1]') === 0`, so loopback IPv6, IPv4-mapped IPv6 (`[::ffff:7f00:1]`), DNS names that resolve to private IPs (`127.0.0.1.nip.io`) and CGNAT `100.64.0.0/10` all pass (verified with Node). In addition, the **discovery RSS and JSON-LD adapters take user-configured URLs with no guard at all**, follow redirects and read an unbounded `res.text()`. | `lib/ingest/ssrf.ts:26-36`; `lib/discovery/adapters/rss.ts:7,81`, `jsonld.ts:59`, `http.ts:15-24` | Resolve the host (`dns.lookup` with `all: true`), check every address (IPv4, IPv6 and mapped forms), pin the connection to the checked IP with an undici dispatcher, and route **every** user-URL fetch through one `safeFetch` with a size cap. |
| S4 | Medium | The encryption key is derived from `AUTH_SECRET` (HKDF). Rotating the session secret bricks every stored API key, and one leaked secret both forges sessions and decrypts keys. | `lib/lab/crypto.ts:16-41` | Use a separate `ENCRYPTION_KEY` with a key id per row (envelope versioning). |
| S5 | Medium | No app-wide CSP or security headers. Only the Playground worker gets a CSP. XSS defence rests on React escaping (only 2 `dangerouslySetInnerHTML`, both sanitised or inline). | `next.config.ts:70-77` | A nonce-based CSP for pages (Next 16 proxy pattern), plus `frame-ancestors 'none'`, `Referrer-Policy` and `Permissions-Policy`. |
| S6 | Medium | No rate limits on expensive user actions (URL import with Firecrawl, LaTeX compile through public services, AI generation). | beta audit §4.5 | Add the planned `rateLimit(userId, bucket)` over a small counter table. |
| S7 | Low | Three cron routes compare the bearer token with `!==`. `/api/cron/discover` loops over every user in one budget. | `app/api/cron/discover/route.ts:32`, `reminders/route.ts:16`, `retention/route.ts:16` | Use `isCronAuthorized()`. Delete the unscheduled `discover` route. |
| S8 | Low | JWT sessions cannot be revoked (no `session_version`). Acceptable for one user. | `lib/auth/edge-config.ts` | Add it with the beta (§2.3). |
| S9 | Info | Raw SQL is safe. 242 `sql\`` templates (all parameterised). The one `sql.raw` builds `excluded.<col>` from code constants. | `lib/db/queries/riskAssessments.ts:65` | Add a lint rule banning `sql.raw` outside an allow-list. |
| T1–T6 | **Critical (beta)** | Tenancy findings from the beta audit, still open. None is exploitable while `ALLOWED_EMAIL` admits one person: (T1) stage/activity inserts don't check that the application is the caller's (`lib/stages/service.ts:75-110`); (T2) every key resolver falls back to the **owner's env keys** (`lib/lab/providers/registry.ts:34-43`, `lib/settings/secrets.ts:29-38`, `lib/decisions/index.ts:180-181`); (T3) the GitHub portfolio token plus a user-editable repo; (T4) any user can lift the global throttle (`lib/usage/throttle.ts:92`); (T5) null-user log events and global jobs are shown to everyone; (T6) the deployment-wide usage page. | beta audit §1.2–1.8 | Do Phase 1 of the beta plan **before** the first invite. Add a test per resolver that a non-owner never reaches an env key. |

## A.6 Data and storage: 7.5

- **Migration discipline is good.**
  - 40 ordered migrations. **No drift**: `drizzle-kit generate` against a copy of `lib/db/migrations` printed "No schema changes, nothing to migrate".
  - Production-only migration (`lib/db/migration-target.ts`), using the unpooled URL for DDL.
  - `/api/health` reports applied vs expected migration counts.
  - Only one migration contains a destructive `DROP`.
- **Indexes on hot paths exist.** Discoveries have `(user_id, status, fit_score)`, `(user_id, status, created_at)` and the source/job unique index (`schema.ts` discoveries block). Applications have `(user_id, status)` and `(user_id, next_action_at)`. Queue jobs have `(status, run_after)` and `(user_id, status, run_after)`. System events have `(user_id, created_at desc)`. One gap: the applyUrl dedupe filters on `normalized->>'applyUrl'` with no expression index (`lib/db/queries/discoveries.ts:368`). That is fine at today's volume.
- **Retention is a strength.** There is a nightly bounded-batch cleanup with per-user windows (60 days stale, 30 dismissed, 180 AI logs, 365 CV scores), payload compaction, and tombstones.
- **Neon 0.5 GB headroom (estimate).** One active user polling about 16 sources keeps roughly 100 new postings a day. That is ≈ 3–8 KB per discovery row (normalized JSONB, fit detail, best-CV JSON) × 60-day window ≈ **20–50 MB**, plus indexes and logs ≈ **50–100 MB steady state**, if files live in Drive. Without Drive, `document_assets` may hold up to 150 MB per user (`lib/storage/types.ts:9`). One user fits comfortably. The beta's 3 MB per invitee at 100 users (beta §4.1) is not realistic without shared source snapshots.
- **Gaps:**
  - No `statement_timeout` anywhere (A5 of the architecture review).
  - **No automated backup.** The README says "Neon free tier includes 7-day point-in-time recovery", but Neon's current Free plan advertises a much shorter restore window (hours). Verify this, and add a nightly `pg_dump` from the existing GitHub Actions worker to a private location.

## A.7 Performance: 6.5

| Signal | Value | Source |
|---|---|---|
| CLS | 0.000–0.001 on all 32 routes measured | UX audit §2 (perceived performance) |
| LCP (warm, dev) | 170–520 ms | UX audit §2 |
| Cold Neon | 3–4 s, now off the critical path: the authed shell awaits only the JWT decode, and badges stream | `docs/performance.md` |
| Next cache APIs | **0** uses of `'use cache'`/`cacheTag`/`unstable_cache`. `cacheComponents` was tried and blocked by 168 build errors | grep; `docs/performance.md` |
| Client JS (local build, Oct 8) | 186 chunks, 3.0 MB gzipped total. Root main 128 KB gz. Initial JS per route (shell included) median ≈ **343 KB gz**, max `applications/[id]` 507 KB, `discoveries/[id]` 474 KB, `compare` 461 KB, and even `/privacy` ≈ 270 KB | `.next` manifests, gzip-measured. Approximate, but the order of magnitude is clear |
| Playground budget | `pnpm check:bundle` in CI: runners lazy, Playground route ≤ 200 KB gz over the shell, no solutions in client output | `scripts/check-playground-bundle.ts` |
| Queue vs Hobby | 1 scheduler and 3 drains × 240 s × 2 lanes ≈ 1,900 lane-seconds a day, plus visit drains (2 jobs per 10 min). Plenty for one user; does not fit 100 users (beta §4.2) | `vercel.json`, `lib/queue/cron.ts:10-12` |
| Connection | `postgres(url, { max: 1 })` per instance; one query at a time per instance | `lib/db/client.ts` |

N+1 risk is low where I looked: the list queries are single statements with counts, and best-CV and match recomputes run in batched jobs. One thing to watch: `/api/health` runs `select 1`, so an external uptime probe every few minutes keeps Neon awake and burns compute hours. Probe a static route instead, or check the DB at most hourly.

On phones in India on 4G, 350–500 KB of gzipped JS per page is the real performance problem, not the server.

## A.8 Reliability and operations: 7.0

- **Strong:**
  - `system_events` with categories and redaction (emails reduced to their domain, secrets stripped).
  - A client-error endpoint (`app/api/client-errors`).
  - Queue retries with exponential backoff and jitter, a dead-letter state with Retry/Run-now in Settings, idempotency keys (`queue_jobs_type_key_uq`), and lock recovery.
  - A health endpoint with migration status.
  - CI gates: lint, typecheck, unit and integration, eval, e2e, production build, a "no test login in the build" assertion, the bundle budget, and the real-PG smoke.
- **Weak:**
  1. **Deploys are not gated on CI.** `vercel.json` runs `pnpm db:migrate && pnpm build` on every push to `main`. The Sep 25 red streak (29 runs) would have deployed and migrated production. Use a protected `main` plus required checks, or set Vercel's "wait for checks".
  2. No alerting outside the app. Dead jobs and free-tier alerts become in-app todos, which the owner sees only when visiting. A daily digest line or email for `dead > 0` would close that.
  3. No backup automation (A.6).
  4. Two public LaTeX compile services are a hard dependency for every PDF (latexonline.cc, then latex.ytotech.com). There is a fallback, but there is no self-hosted path (architecture review A7 is still open).
- **Runbooks:** README covers deploy, Drive setup, the queue worker and manual backup. There is no incident runbook (Neon down, Google token revoked, compile service down), although the UI handles each case.

## A.9 Maintainability and developer experience: 7.0

- **Docs are excellent and plentiful.** 12.5k lines of Markdown, 21 dated specs, and per-feature docs that cite code paths. Onboarding is three commands (`pnpm install`, `cp .env.example`, `pnpm dev`) on in-memory PGlite. `AGENTS.md` points contributors at the bundled Next 16 docs.
- **Commit hygiene is mixed.**
  - 94.5 % of commits are conventional.
  - The rate is 650 commits in 26 days, 139 of them in one day, so no human review is possible at that pace.
  - Merges from agent worktrees land directly on `main`.
  - **The history-rewrite incident.** An earlier rewrite removed AI co-author trailers; `git log --grep=co-authored` now returns nothing. But the author identity was not normalised: about 58 % of commits carry an earlier identity. Rewriting again would force-push a public repo and was rightly declined. Settle it with a `.mailmap` instead.
- **Small drift:**
  - The README's backup claim (A.6).
  - The README still points at the v1 core-tracker spec as "the" spec.
  - `vitest.config.ts` triggers a Vite "ESM in a CJS-loaded config" warning on every run (rename it to `.mts`).
  - An eval fixture's file name and notes contain the owner's first name (`tests/eval/fixtures/tailor-cv/01-*.json`). That is minor, but the repo is public.

## A.10 Product engineering: 4.5

This is a **single-user job-search tool** with:
- 70 tables;
- 78 API routes;
- a LaTeX IDE with zip import (≈ 9.4k lines with its components);
- an adaptive coding academy with Pyodide, php-wasm and PGlite runners (≈ 9.1k);
- AI Radar (5.3k);
- a Model Lab and arena;
- a decision engine with a third-party Hugging Face Space provider;
- expenses with budgets;
- voice input;
- its own web-vitals RUM pipeline;
- analytics.

The core loop (discover → score → shortlist → prepare → apply → follow up) is roughly `discovery` + `apply` + `cv-fit` + `variants` + `resume` ≈ 20k of 155k lines.

Over-engineering risks:
1. **Maintenance load grows faster than value.** Every feature adds tables, retention steps, e2e flakes and privacy-page obligations.
2. **Free-tier budgets** (Vercel 4 h Active CPU, Neon 0.5 GB) are shared by features that do not move the job search.
3. **The beta multiplies** every tenancy finding across all these surfaces.

**Cut or park:**
- Model Lab and Arena;
- Decisions/Laya;
- Expenses;
- Voice;
- the RUM pipeline (Vercel Speed Insights already exists);
- most of Radar (keep "learn this skill" links).

**Simplify:** one score vocabulary (the UX audit's S2 is already done). **Invest in:** match accuracy, alert-email parsing against real samples, agency and referral tracking (Part B).

## A.11 Compliance: 7.0

- **Job sources are a model of diligence.** `docs/job-sources.md` records, for each portal:
  - robots.txt and terms with links and a check date;
  - alerts-only for LinkedIn, Indeed, Naukri, NaukriGulf, Bayt and GulfTalent;
  - an honest User-Agent;
  - the explicit decision **not** to automate Gemini grounded search, because Google's terms forbid it.

  Grey zones remain for multi-user use: the Workday CXS POST endpoint, Phenom `/widgets` (robots disallow `/px-widgets`) and ORC REST. These are defensible for one person reading once a day; re-check them before any shared fetching (beta §5).
- **AI transparency is good.** Prompt `VERSION` constants and `ai_call_logs` hold token counts and timings only. The privacy page warns about Gemini's unpaid-tier data use.
- **The privacy page does not match the data flows** (`app/(public)/privacy/page.tsx`):

| Third party | In code | In privacy page |
|---|---|---|
| Neon, Vercel (hosting, Analytics, Speed Insights) | yes | yes |
| Google (OAuth, Gmail, Calendar, Drive, Picker) | yes | yes |
| Groq, Gemini | yes | yes ("for example") |
| OpenRouter, Cerebras, Hugging Face router, Ollama/WebLLM | `lib/lab/providers/catalog.ts:11-83` | only "for example Groq or Gemini" |
| Laya decision provider (Hugging Face Space) | `lib/decisions` | no |
| Firecrawl (URL import) | `lib/ingest/firecrawl.ts` | no |
| Google Places (company reputation; company names sent) | `lib/reputation/places.ts` | no |
| GitHub API (portfolio publish) | `lib/portfolio` | no |
| Cloudflare DNS-over-HTTPS, rdap.org (Scam Shield lookups of recruiter domains) | `lib/scam/net.ts:16` | no |
| jsDelivr CDN (Playground runtimes) | `next.config.ts:9` | no |
| Adzuna API (search terms) | `lib/discovery/adapters/adzuna.ts` | no |
| latexonline.cc, latex.ytotech.com | yes | yes |

The page's "Last updated" is fixed at Sep 26 (`privacy/page.tsx:9`), but the LaTeX paragraph was added on Oct 7. The beta must rewrite the page anyway (beta §7.1). Do the processor list now.

## A.12 Top 10 risks (severity-ranked)

| # | Risk | Severity | Likelihood |
|---|---|---|---|
| 1 | Opening the beta before tenancy Phase 1: an owner's env keys spent by others, cross-user stage inserts, global throttle and log leaks (T1–T6) | Critical | High if invites go out early |
| 2 | Plaintext Google tokens with Gmail read/send scopes (S2) | High | Low, high impact |
| 3 | Unpatched Next 16.3.5 advisories, including image-optimizer SSRF and cache poisoning (S1) | High | Medium |
| 4 | SSRF: hostname-only guard, IPv6 bypass, unguarded discovery URLs (S3) | Medium now, High in beta | Medium |
| 5 | Deploys and migrations not gated on CI; 28 % historic red rate | High | Medium |
| 6 | Feature sprawl versus one maintainer: 155k lines in 26 days, 70 tables | High (sustainability) | High |
| 7 | No automated backup; README overstates PITR | Medium | Low, high impact |
| 8 | Free-tier exhaustion (Neon 0.5 GB, Vercel CPU) as features and users grow | Medium | Medium |
| 9 | Dependence on two free public LaTeX compile services for every PDF CV | Medium | Medium |
| 10 | Privacy page incomplete relative to actual processors (and Google consent-screen review links to it) | Medium | High |

## A.13 Top 10 fixes (impact / effort)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Upgrade Next to ≥ 16.3.8 and add Renovate/Dependabot | High | S |
| 2 | Encrypt Google OAuth tokens at rest (reuse `lib/lab/crypto.ts`) and move to a dedicated `ENCRYPTION_KEY` with key ids | High | S–M |
| 3 | One `safeFetch` (DNS resolve, IP check incl. IPv6/mapped/CGNAT, pinned dispatcher, size cap, redirect re-check), used by every user-URL fetch including RSS/JSON-LD | High | M |
| 4 | Branch protection plus required checks; Vercel deploy waits for CI; commit the AI eval snapshots so `pnpm eval` gates prompts | High | S |
| 5 | Beta Phase 1 tenancy fixes with a resolver test matrix, before any invite | High | M–L |
| 6 | Feature freeze; park Model Lab, Decisions, Expenses, Voice, RUM; delete legacy cron routes | High | S (decision) |
| 7 | Nightly `pg_dump` via the existing GitHub Actions worker; fix the README backup text | Medium | S |
| 8 | Privacy page: full processor list and a correct date | Medium | S |
| 9 | Lint-enforced module boundaries; split `schema.ts` and `analytics/service.ts` | Medium | M |
| 10 | Reduce per-route JS (dynamic-import heavy client widgets on application, discovery and compare pages) and cache read-mostly data | Medium | M |

---

# Part B: Senior tech recruiter / talent partner review

Persona: 10+ years hiring software, data and fintech roles in the GCC and India; knows Workday, Oracle Taleo/ORC, SuccessFactors, Greenhouse and Lever parsing, and GCC norms (visas, nationalisation, photos, notice periods, attestation). The question: would lee help a **junior–mid backend, payments or data candidate based in India**, targeting the **GCC, India and remote**, get **interviews and offers**?

## B.0 What I ran (synthetic data only)

1. **Eval fixtures:** `pnpm tsx tests/eval/run.ts`. All 75 deterministic fixtures pass: discovery-match 32/32, Scam Shield 30/30 (scams caught 14/14, legitimate postings quarantined 0/16), CV score 13/13. The AI-output fixtures have no snapshots yet, so they are not checked. The fixtures encode the right GCC cases (Riyadh Laravel, Doha missing Kubernetes, Jeddah Arabic fluency, Abu Dhabi nationals-only, Dubai nationals-preferred, US-hours remote, Berlin relocation). My probes below find what they don't cover.
2. **The deterministic Match Score** (`lib/discovery/match`, through the eval harness's `runDiscoveryMatchFixture`) on 10 synthetic postings, plus 2 regression probes, for a synthetic 2-year Laravel/payments developer in India targeting the GCC with sponsorship needed.
3. **Résumé variants:**
   - each of the 3 templates (ATS, Brand, Classic) × 3 regions (GCC, India, Remote) for two synthetic people, a 2-year junior and a 7-year mid;
   - rendered with `renderVariant` and `variantToLatex`;
   - scored through lee's own extractor and scorer (`latexToText` → `cvToScorable` → `computeCvScore`).
4. **Scam Shield rules** (`assessScam`) on 4 synthetic GCC postings.

## B.1 Scores

| # | Dimension | Weight | Score | Most important fix |
|---|---|---|---|---|
| 1 | Job discovery coverage (GCC, India, remote) | 15 % | **6.0** | Validate the 7 email-alert parsers against real (redacted) alert emails, and turn on the GCC employer ORC/SuccessFactors sources for the target sectors by default. |
| 2 | Match/fit scoring credibility | 12 % | **6.5** | Fix the nationals-only false positive ("Saudi National Bank"), read benefit-list visa phrasing, and treat "A or B" as one requirement. |
| 3 | CV/résumé output quality | 15 % | **6.0** | Fix the LaTeX text extraction so ATS/Brand templates keep their dates (and lose the false "no experience" critical finding); A4 for Classic; add DOCX export. |
| 4 | Tailoring and cover letters | 10 % | **6.5** | A region-aware "application email" (GCC: visa, notice, location, availability; India: CTC, expected CTC, notice; remote: short and link-first) instead of one 3–4 paragraph letter. |
| 5 | Application workflow efficiency | 10 % | **7.5** | Detect ATS acknowledgement, rejection and interview-invite emails (Workday, Taleo, SuccessFactors, Greenhouse senders) and update the status automatically. |
| 6 | Interview readiness | 10 % | **6.5** | Add a GCC/India HR-round pack: salary in AED/SAR/INR, notice and buy-out, visa and relocation, "why the Gulf?", plus timed spoken mock answers. |
| 7 | Candidate positioning advice | 8 % | **6.0** | Add a document-readiness checklist: degree attestation (HRD/MEA/MOFA/embassy), Saudi engineering title accreditation, police clearance, medical, passport validity. |
| 8 | Market realism | 10 % | **4.5** | An agency/recruiter CRM: which agency has your CV for which employer, with a duplicate-submission warning; and a LinkedIn networking cadence. |
| 9 | Trust and safety | 5 % | **6.5** | Add Gulf agency-fee patterns (medical, attestation, service charge, ticket deposit, visit-visa packages, "100 % job guarantee") and an eMigrate licensed-agent check. |
| 10 | Would I recommend it? | 5 % | **6.5** | Ship a "GCC starter" profile path with defaults, and hide everything that isn't the job search. |
| | **Overall (weighted)** | 100 % | **6.2** (6.21) | |

## B.2 Job discovery coverage: 6.0

**What works for this candidate**
- **ATS backends of real GCC employers.** Oracle ORC covers Emirates NBD, FAB, Mashreq, e&, du, DP World and Dubai Holding. SuccessFactors covers ADCB, Al-Futtaim and stc. Phenom covers G42, Majid Al Futtaim and ADNOC. Workday covers Visa, Mastercard and PayPal. Counts were verified live on Sep 27 (`docs/job-sources.md`).
- **India.** The Kerala IT parks (Technopark 362 jobs, Infopark ≈ 466) are real volume for a Kerala-based junior.
- **Remote.** Himalayas, RemoteOK, Remotive, WWR, Jobicy and Working Nomads, with remote-eligibility filtering.
- **Employer watch list.** 43 GCC employers are watch links where the terms forbid reading, plus a daily-rotating "Google AI Mode" prompt hand-off that respects Google's terms.

**What limits interviews**
- **The channels where GCC tech hiring actually happens arrive only by email alert.** LinkedIn (InMail-first recruiters), Bayt, NaukriGulf, GulfTalent, Naukri and Indeed reach lee only through alerts. This is legally correct. But the alert parsers were built from **synthetic** fixtures, not real emails (`docs/job-sources.md`, "Job-alert emails"). If LinkedIn changes its alert HTML, the main GCC channel silently drops to zero. The per-message `jobsFound` counter exists (`lib/discovery/adapters/email-alert.ts:140`), so surface "0 jobs from a verified alert" loudly.
- **Most GCC employer sources are *off* by default** (`docs/job-sources.md`, Employers table). A new user gets India and remote volume, not Gulf volume.
- **No agency feeds.** In my experience a large share of mid-level GCC tech placements go through agencies (Michael Page, Hays, Cooper Fitch, Robert Walters and boutique IT agencies). They post on LinkedIn and Bayt and work by phone and WhatsApp.
- **SmartRecruiters employers are watch links only** (robots.txt). The doc names talabat and HungerStation.
- **Freshness is adequate:** daily polls, crons up to 59 min late, and visit drains in between. Early applicants matter in the GCC, where hundreds apply in 48 h. A daily cadence plus alert emails is fine.

## B.3 Match/fit scoring credibility: 6.5

Synthetic candidate: 2 years of PHP/Laravel/MySQL/REST/Redis/Docker, SQL and Python; targets backend, full-stack and data analyst; junior–mid; based in India; needs sponsorship in all six GCC countries.

| # | Synthetic posting | lee | Recruiter view | Verdict |
|---|---|---|---|---|
| A | Dubai fintech, Laravel, 2–4 yrs, payment gateways, AED 14–18k, "employment visa, medical insurance and annual air ticket provided" | **75** (strong); Visa: "not mentioned" | 75–80; this is the target role. The visa *is* mentioned. | Score right, **visa signal missed** |
| B | Riyadh data analyst, SQL + Power BI **or** Tableau, Arabic preferred | **47**; missing "Power BI (required)", "Excel (required)", "Tableau (required)"; seniority "not stated" | 50–55. Lacking Excel and a BI tool is a real gap, but "Power BI or Tableau" is **one** requirement, and "2+ years" was stated | **"Or" split into two must-haves**; years missed |
| C | Dubai **Senior** Backend, 5+ yrs, Kafka/K8s | **47**; seniority 10/15 ("strong Laravel match") | 25–35. With 2 years for "5+" I would not shortlist | Seniority too lenient; "PHP/Laravel **or** Go" lists Go as missing |
| D | Abu Dhabi, "UAE Nationals only", Emiratisation | **Filtered** ("visa: nationals only") | Correct | Right |
| E | Remote, US-only, no sponsorship | **Filtered** ("location: US-only") | Correct | Right |
| F | Kochi Laravel, 1–3 yrs, ₹6–9 LPA | **79** | 80 | Right (years not parsed) |
| G | Riyadh payments engineer, Java/Spring, ISO 8583 | **43**; missing Java, Spring | 30–40 | Right |
| H | Title-only email alert "PHP Developer, Dubai" | **72**, `title_only` ("Fit ~72") | Unknown; I'd show "~50, needs JD" | Over-confident |
| I | Remote worldwide Laravel + Vue | **60**; missing Vue | 60 | Right |
| J | Doha backend, **fluent Arabic mandatory** | **67** ("good fit"); language −10 | ≤ 30. Mandatory Arabic is a no-go for a non-speaker | **Too high** |

Regression probes I added:

| Probe | Result | Why it matters |
|---|---|---|
| Riyadh backend JD: "Experience integrating with **Saudi National Bank** (SNB) and Al Rajhi payment APIs" | **Filtered: "visa: nationals only"** | SNB is one of the largest Saudi banks. The regex `\b(?:saudi\|…) nationals?(?: only)?\b` (`lib/discovery/relevance/signals.ts:128`) matches "Saudi National Bank", so a **relevant payments job silently drops into the Filtered tab**. The same applies to "UAE national carriers". |
| `detectVisaOffered()` on "Benefits: employment visa, medical insurance and annual air ticket provided" / "Visa + medical + annual ticket" / "Company provides visa, accommodation and transportation" | all **null** | These are the three most common ways GCC postings say it. Only "Visa will be provided" matched (`signals.ts:91-100`). The candidate loses the +5 and the "visa offered" chip exactly where it matters. |

Would a recruiter agree overall? **Mostly.** The ordering of A, F, I, B, G is right, and the hard filters (D, E) are right. The misses are systematic and fixable:
1. lexical false positives on "national";
2. benefit-list phrasing;
3. "A or B" requirements;
4. a mandatory language is not a soft −10, it is a gate;
5. years phrased as "1–3 years in X" or "2+ years as a Y" are not read;
6. title-only scores should be capped.

The "Why this score" explanations (component points, evidence quotes) are the best I have seen in a candidate tool.

## B.4 CV/résumé output quality: 6.0

**The probe.** Synthetic profiles: "Ravi Kumar", 2.5 yrs Laravel/payments, Kochi; "Asha Menon", 7 yrs, Dubai. Each variant was rendered and then read back by lee's own extractor and scorer.

| Profile · region · template | Pages (est.) | lee CV Score (general / vs a Dubai Laravel JD) | Work entries lee's parser found | Structure | Top finding |
|---|---|---|---|---|---|
| Ravi · GCC · **Brand** (GCC default) | 0.8 | 81 / 64 | **0** | **30** | **critical: "No work experience entries could be identified"** |
| Ravi · India · **ATS** (India default) | 0.7 | 81 / 64 | **0** | **30** | same critical finding |
| Ravi · Remote · ATS (Remote default) | 0.7 | 81 / 64 | **0** | 30 | same |
| Ravi · any region · **Classic** | 0.7–0.8 | **91 / 83** | 2 | **96** | minor only |
| Asha · ATS / Brand (all regions) | 0.8–0.9 | 80 / 53 | **0** | 30 | same critical finding |
| Asha · Classic (all regions) | 0.8–0.9 | 91 / 71 | 2 | 96 | minor only |

**Root cause.**
- The ATS and Brand templates put each role's location and dates after `\hfill` in a `{\small …}` group (`\textbf{Backend Developer} --- Example Payments Pvt Ltd \hfill {\small Kochi · Apr 2023 – Present}`).
- `latexToText` (`lib/cv-score/latex-text.ts:191-193`) turns `\hfill` into " | " and drops the following group. The extracted text keeps "Backend Developer — Example Payments Pvt Ltd" but **loses every date**, so no role is recognised.
- "Score this variant" runs exactly this path (`lib/variants/outputs.ts:66-72` → `scoreCv` on the `latex_cv` source).
- The result: lee tells users their **default** GCC, India and Remote CVs have a critical structural defect, pushes them toward the US-Letter Classic template, and under-scores tailoring deltas. (This may also explain the UX audit's "CV Score 91 → 91 (0 vs the variant)".)
- The compiled PDF *does* contain the dates. A real ATS (Workday, Taleo/ORC, SuccessFactors) would usually read "Title — Company · Location · Dates" on one line correctly. So this is a **scorer defect, not a CV defect**, but it is the advice the user sees.

**Recruiter read of the rendered CV (Ravi · GCC · ATS):**
- **Good:** single column, standard headings (Summary, Experience, Skills, Projects, Education, Languages), quantified bullets ("40k transactions per month", "9 s to 600 ms", "12 Saudi merchants"), no tables or icons, and A4 for ATS and Brand (`lib/variants/latex.ts:31`). Fact-locked wording means nothing invented will surface in an interview. That is the single biggest quality lever for juniors.
- **Contact line:** 8 items on one line separated by "·" (email, phone, location, site, GitHub, nationality, visa, notice). Parsers cope, but recruiters skim. Split it into two lines: (1) contact; (2) "Indian national · Kochi, India · Requires employment visa · Notice: 30 days · Available for interviews on Teams/Zoom".
- **The Classic template is US Letter** (`lib/latex/classic-layout.ts:17`, `\documentclass[10pt, letterpaper]`). GCC and Indian employers and agencies print and attach on A4. A Letter PDF looks foreign and, when printed, gets cropped or scaled.
- **Photo rules are right.** GCC is off by default with a per-posting advisor ("passport-size photo" → Recommended; government/semi-government +2; an equal-opportunity statement −3). India and Remote are locked off.
- **Length targets are right:** one page by default, two available. For 2–5 years in the GCC, 2 pages is acceptable; for remote, under 5 years, 1 page.
- **Missing:**
  1. **DOCX export.** Taleo/ORC and Naukri parse DOCX best, and many GCC agencies explicitly ask for Word so they can re-brand the CV.
  2. A driving-licence field ("UAE driving licence" is common and valued in UAE CVs).
  3. "Current location and availability" as a GCC preset field.
  4. Arabic name transliteration is not needed. But "Languages" without a level for Arabic triggers lee's own warning, which is good.

## B.5 Tailoring and cover letters: 6.5

- **Tailoring is excellent and honest.**
  - Requirement by requirement, it marks each one met, partial or missing, with the backing profile line.
  - "Missing never added" is tested over 120 random JD and readiness mixes (`tests/unit/cv-fit-tailor.test.ts:153-167`).
  - The number lock ("1,200" equals "1200"; "2M" does not equal "2") and the domain lock prevent inflation.
  - Gaps go to a study list or to "adjacent experience" in the cover letter.

  This is exactly what protects a junior candidate from failing a technical round on an inflated claim.
- **The cover letter is region-blind** (`lib/ai/prompts/cover-letter.ts:38-58`). It is one format everywhere: 3–4 paragraphs, "Dear Hiring Manager".
  - **GCC:** most recruiters read the email body and CV; long letters are skipped. What they want in 5–7 lines: role, years, top 2 matches, **visa status, notice period, current location, availability for interviews**, and sometimes expected salary in AED/SAR.
  - **India:** current CTC, expected CTC and notice period are standard screening fields (Naukri asks for all three); a letter is rarely read.
  - **Remote startups:** 4–6 sentences, a link to a relevant repo or write-up first, time-zone overlap stated.
- **Follow-ups** (`lib/ai/prompts/outreach-followup.ts`; cadence `lib/followups/service.ts:21` = 7/14/21/30 days):
  - Four emails is one or two too many for GCC agency and recruiter norms. Recruiters there handle hundreds of applicants, and repeated chasers hurt.
  - Better: one at 5–7 working days, one at about 3 weeks, then close.
  - The 14-day few-shot encourages sharing "a recent article/insight … or a well-known public reference". That invites made-up artefacts, against the tool's own honesty principle.
  - The 7-day few-shot is 52 words while the rule says 80–120.
- **Tone:** clean, cliché-banned, grounded. Good.

## B.6 Application workflow efficiency: 7.5

- **Shortlist → Prepare (5 steps) → Mark applied → follow-up nudge** is the best flow in the product (UX audit: 8.0, "one surface for the core work"). Best-CV-per-job, "Use this CV", tailor, cover letter and a CV Score delta all happen in one place.
- **Time to apply (my estimate):** about 5–10 minutes per role with a prepared variant, against 20–30 minutes by hand. That is what turns 5 applications a week into 15–20.
- **Follow-up default:** a nudge after 7 days (`lib/apply/settings.ts:9`, range 3–30). Good.
- **Gmail reply detection** (`lib/gmail/matcher.ts`) matches by contact email, company domain or job title in the subject.
  - It **misses ATS mail.** Acknowledgements, rejections and interview invites come from `myworkdayjobs.com`, `taleo.net`, `successfactors.com` and `greenhouse-mail.io`, which never match the company domain, so a subject without the exact title goes unmatched.
  - There is no classification of rejection ("unfortunately", "not to move forward") or interview invite. Status stays manual, and the funnel analytics (response rate, time to response) under-count.

## B.7 Interview readiness: 6.5

- **The Playground is well aimed at payments backends.** It has 55 problems: 12 backend/payments ("Idempotent charge requests", "Webhook signature header check", "Ledger vs bank statement", "Outbox relay ordering", "Keyset pagination cursor", "Split a bill to the cent"), 6 SQL ("Merchant settled volume", "Duplicate webhook deliveries", "Daily refund rate") and 37 DSA. These map to what GCC fintechs and Indian payment companies actually ask. The catalogue is small next to the usual 150-problem lists, but it is the right 55.
- **Prep packs.** Recruiter, tech, system design and behavioural packs with STAR answers that must cite a real CV bullet (`lib/ai/prompts/interview-prep.ts:26`). Excellent: it prevents rehearsed fiction.
- **Company reputation** (Wikidata, Google Places, confirmed reviews) and the **job comparison** with the current job help at the offer stage.
- **Missing:**
  1. An HR-round pack for the GCC and India: "What is your expected salary in AED?", "Can you join in 30 days / will your employer release you early?", "Are you on a visit visa?", "Why the Gulf?", "Family status for the visa?".
  2. Spoken, timed practice (the voice input exists but is not used for mock answers).
  3. Take-home practice for Laravel and SQL (most GCC fintechs give one).

## B.8 Candidate positioning advice: 6.0

- **Strong:**
  - Region presets: GCC shows nationality, visa and notice; India hides the photo and keeps CTC off; Remote never shows a photo, date of birth or marital status (`lib/variants/presets.ts:33-60`).
  - The Arabic-level nudge.
  - Pay floors per region with GCC currency pegs.
  - The photo advisor.
  - Above all, **the `depth`/`interviewReady` flags.** Nothing AI-assisted or still being learned reaches a CV unless the user explicitly overrides it, with "You may be asked about this in an interview". As a recruiter, the most damaging thing I see from juniors is an indefensible skill list. lee structurally prevents it.
- **Missing:**
  - **No salary benchmarks.** The user types floors; there are no reference ranges for AED/SAR/QAR/INR by role and level.
  - **No visit-visa job-hunt guidance.** That is a common route from India to the UAE, and also where scams cluster.
  - **No notice-period strategy.** Indian notice is often 60–90 days; GCC employers want 30 or less, so buy-out and early release matter.
  - **Nothing on documents:**
    - degree attestation (state HRD → MEA apostille or attestation → UAE embassy → MOFA in the UAE; similar chains for Saudi Arabia, Qatar and Kuwait);
    - Saudi Council of Engineers accreditation for "engineer" job titles;
    - police clearance;
    - the medical;
    - passport validity;
    - emigration clearance (ECR/ECNR) for some passport holders.

    These decide whether an offer turns into a visa, and delays here lose offers.

## B.9 Market realism: 4.5

How GCC tech hiring actually works, and what lee models:

| Reality | lee today | Gap |
|---|---|---|
| LinkedIn-first recruiters and InMail | LinkedIn connection and message prompts; LinkedIn alerts by email | No LinkedIn profile optimisation and no networking cadence (for example 10 targeted connects a week with a follow-up queue) |
| Agencies and headhunters (a large share of mid-level roles) | Contacts have no "agency" type | **No agency CRM.** Track which agency has your CV for which client. Duplicate submissions (two agencies sending you to the same employer) commonly get candidates rejected in the GCC. lee could warn before you consent. |
| Referrals | Contact pipeline with a Referral stage and `applications.referred_by_contact_id` | Good base; no referral-ask templates or tracking of who was asked |
| WhatsApp-based recruiting | Scam Shield flags messaging-only channels | No safe way to log a legitimate WhatsApp lead |
| Walk-in interviews (India, some GCC) | none | Low priority for software roles |
| Government and semi-government portals | Correctly excluded where nationals-only (Nafis, Jadarat) | Fine |
| Offer evaluation: housing, transport, annual ticket, schooling, end-of-service gratuity, medical, probation, notice | The job comparison covers housing, transport, flights, gratuity, leave and tax (`docs/job-comparison.md:45-68`) | Good. No gratuity calculation (UAE: 21 days' basic pay per year for the first 5 years); no basic-vs-allowance split warning (gratuity is calculated on basic pay) |
| Negotiation | none | Counter-offer scripts grounded in benchmarks |
| Pre-joining (attestation, medical, police clearance, visa stamping) | none | Checklist with timelines (B.8) |

## B.10 Trust and safety: 6.5

Scam Shield has 19 deterministic rules plus domain-age (RDAP) and MX checks, and 30 eval fixtures that include a Gulf driver visa-fee scam. My probes:

| Synthetic posting | lee | Should be |
|---|---|---|
| Overseas manpower agency, "PHP Developer – Riyadh": "pay **medical test charges** INR 6,500 and **attestation charges** INR 12,000 to our Kochi office. **Service charge after visa stamping.** Offer letter after payment." | **safe** (15; urgency only) | **likely scam / high caution.** This is the classic Kerala-to-Gulf pattern. The fee regex (`lib/scam/rules/money.ts:11`) covers "visa processing fee" but not "medical / attestation / service charges". |
| "Emirates" offer letter without an interview, refundable ticket deposit, Gmail address, look-alike domain | **likely scam** (100) | Correct, but `money.upfront_fee` didn't fire on "transfer the refundable ticket deposit" |
| Legit Dubai fintech (Greenhouse link, interview stages, visa provided) | **safe** (0) | Correct |
| "Come to Dubai on visit visa, **100 % job guarantee**, package AED 5,000 includes visa and accommodation" | **caution** (35) | **likely scam** |

Add:
- the Gulf fee nouns (medical, attestation, service charge, ticket, stamping, "package");
- "job guarantee" and "visit visa + placement";
- a check against India's **eMigrate registered recruiting agent** list, since legitimate agents are licensed and their fees are capped.

Privacy for the candidate is strong (single user, Drive `drive.file` scope, encrypted AI keys), except that the Google tokens are in plaintext (Part A, S2).

## B.11 Would I recommend it? 6.5

- **To a technically literate junior–mid backend or payments candidate targeting India and remote:** yes. The honesty machinery, explained scores, fast prepare flow and payments-flavoured practice beat any job board's tools.
- **To the same candidate targeting the GCC specifically:** with caveats. Turn on the GCC employer sources, set up LinkedIn, Bayt, NaukriGulf and GulfTalent alerts, use the Classic template only after fixing A4 (or ignore the ATS/Brand structure warning), and do not rely on it for agencies, scams involving fees, or document attestation.
- **To a non-technical candidate:** not yet. The surface is too large (Playground, Radar, Model Lab, LaTeX).

## B.12 Top 10 gaps that most limit interviews and offers

| # | Gap | Effect on outcomes |
|---|---|---|
| 1 | GCC's main channels (LinkedIn, Bayt, NaukriGulf, GulfTalent) only via alert parsers validated on synthetic emails | Silent loss of most GCC leads if a parser breaks |
| 2 | False "critical: no work experience" on the default ATS/Brand templates | Wrong advice; pushes users to a US-Letter template; tailoring deltas look like 0 |
| 3 | No agency/recruiter CRM or duplicate-submission guard | Lost GCC opportunities through double submission; no agency follow-up |
| 4 | Nationals-only false positives ("Saudi National Bank", "UAE national carriers") | Relevant payments jobs hidden in the Filtered tab |
| 5 | Region-blind cover letter and application email | GCC and India screeners miss visa, notice and CTC; remote readers get too much text |
| 6 | Mandatory Arabic and senior "5+ years" not gated hard enough | Time spent on no-go roles |
| 7 | Gulf agency fee scams rated safe | Real money and passport risk |
| 8 | No document-readiness guidance (attestation, police clearance, medical, SCE) | Offers delayed or lost between offer and visa |
| 9 | No ATS-email status detection (acknowledgement, rejection, invite) | Funnel metrics wrong; follow-ups sent to rejected applications |
| 10 | No salary benchmarks or negotiation support (AED/SAR/INR; basic vs allowances; gratuity on basic) | Under-negotiated offers |

## B.13 Top 10 recommendations, ranked by impact on getting hired

| # | Recommendation | Impact | Effort |
|---|---|---|---|
| 1 | Validate and monitor the alert parsers with redacted real samples; alert on "0 jobs parsed from a verified alert" for 3 days; enable GCC employer sources for the user's chosen sectors on onboarding | Very high | M |
| 2 | Fix `latexToText` for `\hfill {\small …}` (add a fixture per template); switch Classic to A4; add DOCX export | Very high | S–M |
| 3 | Match fixes: word-boundary nationals rule that excludes "National Bank/carrier/airline"; benefit-list visa phrasing; "A or B" as one requirement; mandatory language as a gate; years from "N–M years in X"; cap title-only at ~50 | High | S–M |
| 4 | Region-aware application email (GCC/India/Remote) built on the existing tailoring checklist | High | S |
| 5 | Agency CRM: contact type "agency", submissions per client, explicit consent, duplicate warning | High | M |
| 6 | ATS-email classifier (acknowledgement / rejection / interview) with sender domains for Workday, Taleo/ORC, SuccessFactors, Greenhouse, Lever | Medium–high | M |
| 7 | GCC/India HR-round prep pack, plus a salary-benchmark table the user can edit, plus a negotiation script | Medium–high | M |
| 8 | Scam Shield: Gulf fee nouns, visit-visa placement packages, "job guarantee", eMigrate licence check | Medium (safety) | S |
| 9 | Pre-joining checklist: attestation chain per country, SCE accreditation, police clearance, medical, passport validity, ECR | Medium | S |
| 10 | Shorter follow-up cadence (2 chasers + close), remove the "article" few-shot, and a weekly LinkedIn networking queue | Medium | S |

---

### Appendix: reproducibility

- Synthetic probes were scratch `tsx` scripts outside the repo, calling `runDiscoveryMatchFixture`, `renderVariant`/`variantToLatex`/`latexToText`/`cvToScorable`/`computeCvScore`, `detectVisaOffered` and `assessScam`.
- CI history: `curl https://api.github.com/repos/shamil3ilm/lee/actions/runs?per_page=100` (2 pages) and `/actions/runs/{id}/jobs` for failing steps.
- Drift check: `drizzle-kit generate` with a config pointing at a copy of `lib/db/migrations`.
- Bundle sizes: gzip of `.next/static/chunks` and route client-reference manifests from the local build of Oct 8 (one commit behind `HEAD`).
