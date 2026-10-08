# lee invite-only beta: design and tenancy audit

Date: 2026-10-08. Status: design and audit only. Nothing here is implemented yet.
Base: `origin/main` at `96bf6d6`.

## 0. Decision and constraints

The owner has decided to open lee as an **invite-only beta**:

- **Size and access.** At most 100 users, each invited by email by the owner.
- **Signed-in workspaces only.** There is no public job search page, and aggregated listings are never republished publicly.
- **Google sign-in without Gmail scopes for invitees.** Gmail ingestion, Gmail sync and the Gmail-sent digest stay owner-only, or become an explicit opt-in later.
- **Own AI keys.** Invitees bring their own AI keys. The owner's keys and the server env keys are never used for anyone else.
- **Data-driven domains.** Role domains come from data, not code. UI/UX, product design, graphic design, software, data, analysis, marketing and others are all supported.
- **Zero cost.** The beta must stay within Vercel Hobby (non-commercial, daily crons, 300 s functions) and Neon Free (0.5 GB storage).

Today lee is built for one person, and that assumption is spread across the code in four ways:

- **Sign-in gate.** Only the email in `ALLOWED_EMAIL` can sign in.
- **Global shared state.** The usage meter, the throttles, the "global" log events and the global retention steps are shared by the whole deployment.
- **Env-key fallbacks.** Every key resolver falls back to the server's env keys.
- **Owner-tailored data.** The starter sources and lexicons were written for the owner (backend, payments, GCC and India).

The audit (§1) finds these points. The rest of the doc designs the beta around them.

Legend for severity: **C** = critical, must be fixed before any invitee signs in. **H** = high, fix in Phase 1. **M** = medium, fix before the beta grows past about 10 users. **L** = low.

---

## 1. Tenancy audit

### 1.1 Tables

Every table in `lib/db/schema.ts`, `lib/db/schema-academy.ts` and `lib/db/schema-apply.ts` was checked. Most domain tables are well scoped. They have a non-null `user_id` with `ON DELETE CASCADE` and a `(user_id, …)` index, and their query modules take `userId` first and filter on it.

These tables are scoped that way:

- `companies`, `contacts`, `jobs`, `applications`, `interview_stages`, `processed_gmail_threads`, `activities`, `user_profile`
- `sources`, `discoveries`, `email_alert_messages`, `company_discoveries`
- `documents`, `document_assets`, `document_pdf_cache`, `drive_folders`
- `expenses`, `expense_budgets`, `todos`, `cv_scores`, `lab_provider_keys`, `lab_runs`, `job_risk_assessments`, `scam_allow_list`
- `ai_quota_snapshots`, `queue_user_state`, `web_vitals_daily`, `usage_alerts`, `usage_settings`, `portfolio_publish`
- `resume_variants`, `resume_variant_versions`, `user_defaults`, `company_reputation`, `reputation_settings`, `retention_settings`
- all eleven `academy_*` tables
- `shortlist_entries`, `discovery_feedback`, `application_preps`

The tables below are not scoped that way:

| Table (file:line) | Scoping | Risk | Fix |
|---|---|---|---|
| `users` (`lib/db/schema.ts:45`) | n/a | There is no role, status or invite link, and the owner is identified only by matching `ALLOWED_EMAIL`. | Add `role` ('owner'\|'member'), `status` ('active'\|'suspended'\|'deleted'), `invited_by`, `created_at`, `last_seen_at` and `session_version` (§2). |
| `accounts` (`schema.ts:53-71`) | user | Google `refresh_token`, `access_token` and `id_token` are stored in **plaintext**. With 100 users, one DB leak exposes every Google grant. | Encrypt the tokens at rest with the AES-GCM helper already used for `lab_provider_keys`. Read them only through `lib/google/tokens.ts`. **H** |
| `verificationTokens` (`schema.ts:81`) | global, unused (Google only) | none | Leave as is. Retention already prunes it. |
| `application_contacts` (`schema.ts:209`) | **no user_id**; scoped through the parent | Safe today, because `lib/db/queries/applicationContacts.ts:22-31,52-55,75-78` checks that the application and contact belong to the user before linking, unlinking or listing. The check is an implicit invariant. | Keep it, and add a test that a user cannot link someone else's contact. Optionally add `user_id` for defence in depth. **L** |
| `lab_run_results` (`schema.ts:1082`) | **no user_id**; scoped through `lab_runs` | `insertResults(runId)` and `updateResult(runId, resultId)` (`lib/db/queries/labRuns.ts:24,32`) take no user. They rely on the caller having just created or verified the run. `recordVote` checks ownership (`:115-121`). | Pass `userId` into both and join through `lab_runs`, or document them as internal-only and remove the exports from the route layer. **L** |
| `scam_domain_cache` (`schema.ts:1160`) | **global by design** (public RDAP/MX facts) | It holds only domain facts. Its existence reveals that *someone* checked a domain, which is a weak cross-user signal, and the owner never sees it per user. | Keep it shared, since it is public data. Never store user-derived fields in it. **L** |
| `queue_jobs` (`schema.ts:1230-1235`) | user_id **nullable** ("global jobs") | Global jobs `reminders:all` and `usage-snapshot:all` are visible to every user through `lib/queue/runs.ts:46-47` (`or(user_id = me, user_id is null)`). Claims are ordered by `priority, run_after, created_at` (`lib/queue/queue.ts:173`) with **no per-user fairness** (§4.2). | Show global jobs to the owner only. Add round-robin claiming. **M** |
| `usage_snapshots` (`schema.ts:1319`) | **global**, one row per day | `data.largestTables`, `data.userReadings` (asset bytes **per user id**) and the throttles are deployment-wide. Settings › Usage shows them to everyone (§1.3). | Split the deployment view (owner only) from a per-user view. **H** |
| `usage_settings.throttles_resumed_period` (`schema.ts:1364`) | per user, but read globally | `lib/usage/throttle.ts:92` returns `exists (select 1 from usage_settings where throttles_resumed_period = …)`. **Any user** who resumes lifts the global throttle. | Move it to an owner-only `deployment_settings` row. **C** |
| `system_events` (`schema.ts:1528`) | user_id **nullable** | Null-user events are shown to every user (`lib/logs/queries.ts:86`). | Show null-user events to the owner only, and check that no null-user event carries user data (§1.3). **H** |
| `system_event_counts` (`schema.ts:1555`) | global per-day cap | One noisy user can use up the daily event cap and silence everyone's logs. | Add a per-user daily cap as well as the global one. **M** |
| `ai_call_logs` (`schema.ts:931-933`) | user_id nullable (`set null` on delete) | Rows of deleted users stay until the global orphan step prunes them. | When a user deletes their account, hard-delete their rows instead of nulling them (§7.3). **M** |
| `discoveries` and `company_discoveries` unique key `(source_id, source_job_id)` | per user, via the source | There is no dedupe across users who poll the same public source, so 100 users means 100 identical fetches and rows (§4.4). | Add a shared fetch cache (§4.4). **M** |

### 1.2 Owner-only checks and the sign-in gate

| file:line | Issue | Fix |
|---|---|---|
| `lib/auth/allowed-email.ts:3-8` | A single-email gate compares against `env.ALLOWED_EMAIL`. | Replace it with an invite lookup (§2). Keep `ALLOWED_EMAIL`, renamed `OWNER_EMAIL`, only to bootstrap the owner row. **C** |
| `lib/auth/edge-config.ts:65-67` | `signIn` callback = `isAllowedEmail`. This runs in the adapter-free config used by `proxy.ts`. The gate is enforced at sign-in only. | Move the gate to the Node config (`lib/auth/config.ts:43-48`), which has DB access, and check `invites` / `users.status` there. The edge config's `signIn` stays permissive, because it never runs a real sign-in: the route handler uses `authConfig`. **C** |
| `lib/auth/edge-config.ts:28` | The comment justifies `allowDangerousEmailAccountLinking: true` by "one ALLOWED_EMAIL gate". | It is still safe with Google as the only provider, because Google asserts verified emails. Re-justify it in the comment, and **disable it** if a second provider is ever added. **L** |
| `lib/auth/edge-config.ts:31-56` | Every sign-in requests `gmail.readonly`, `gmail.send`, `calendar.events` and `drive.file` with `prompt=consent`. | Sign in with `openid email profile` only, and add each feature scope incrementally (§3). **C** |
| `lib/auth/owner.ts:11-14` | `isOwner()` = `isAllowedEmail(users.email)`. | Change it to `users.role = 'owner'`. **H** |
| `app/(authed)/settings/storage/actions.ts:27,47` | Only the owner may run "Clean up now" and save retention windows, because cleanup includes global steps. Invitees therefore **cannot set their own retention windows**. | Split it. Any user may save their own windows and clean their own rows (`runUserCleanup`). Global steps run only from cron or the owner's admin page. **H** |
| `lib/auth/require-session.ts:20-23` | `requireUserId()` only decodes the JWT. A revoked or suspended invitee keeps access until the JWT expires (Auth.js default: 30 days). | Add a cached DB check, `users.status = 'active'` and `session_version` matching the token. This is the "secure check close to the data" that Next's docs recommend (`node_modules/next/dist/docs/01-app/02-guides/authentication.md` §"Optimistic checks with Proxy", L1017-1033 and L1121; `03-api-reference/03-file-conventions/proxy.md:251`). **H** |
| `lib/env/schema.ts:24` | `ALLOWED_EMAIL: z.string().email()` is required. | Rename it to `OWNER_EMAIL` and keep accepting `ALLOWED_EMAIL` as a fallback for one release. |
| `app/(public)/privacy/page.tsx:31-32,76,121` | The policy says lee is "single-user" and that "sign-in is restricted to the owner's Google account". | Rewrite it (§7). **C**, because Google's consent screen links to it. |

### 1.3 Shared keys: the owner's secrets reach other users

This is the most serious class of finding. Every key resolver is "user's saved key, else **env**". In a multi-user deployment, any invitee without their own key silently uses the owner's key.

| file:line | Issue | Fix |
|---|---|---|
| `lib/lab/providers/registry.ts:34-43` (`resolveKey`) | DB key, then `process.env[GROQ_API_KEY \| GEMINI_API_KEY]` (`lib/lab/providers/catalog.ts:20,54`). | Allow the env fallback only when `userId` is the owner. Otherwise return `none`, which gives the friendly "add a key" message. **C** |
| `lib/settings/secrets.ts:29-38` (`resolveServiceSecret`) | Falls back to env for `firecrawl`, `laya`, `neon`, `google_places`, `adzuna` and `github_portfolio` (`lib/settings/service-secrets.ts:36-80`). | Same owner-only rule. **C** |
| `lib/settings/service-secrets.ts:76-83` + `lib/portfolio/*` | `github_portfolio` falls back to `GITHUB_PORTFOLIO_TOKEN`. `portfolio_publish.repo` is **user-editable**. **An invitee could commit to any repository the owner's token can write.** | Never fall back for this one, even for the owner, so the token must be saved explicitly. Pin the repo for the env token. **C** |
| `lib/ai/index.ts:31-33,46-49` (`getAIProvider`, env-only) | Used by "fixtures / non-user code paths". Any user-triggered path that calls it spends the owner's key. | Restrict it to owner or system jobs, and add a lint rule or test against importing it from user paths. **H** |
| `lib/decisions/index.ts:180-181,193-205` | `resolveAiKey(...).catch(() => env.GROQ_API_KEY)`. On a lookup error it falls back to the owner's key, and `getDecisionProvider()` is env-only. | Make the catch return `null`. Use the env-only factory for the owner only. **C** |
| `lib/discovery/adapters/adzuna.ts:93-98` | With no `userId`, it falls back to `ADZUNA_KEY`, and with a `userId` it goes through `resolveServiceSecret`'s env fallback. | Each user brings their own key (§5). **C** |
| `lib/usage/snapshot.ts:31-58` (`resolveNeonCredentials`) | "The most recently saved `neon` key **of any user** wins." An invitee who saves a Neon key **replaces the deployment's usage meter** with their own project, which changes everyone's throttles. | Use the owner's key only. Hide the Neon key row from non-owners. **C** |
| `lib/settings/secrets.ts:52` (`listServiceSecretStatuses`) | It reports `source: 'env'` to every user, which shows invitees that the owner has configured a key. | Report `none` for non-owners. **M** |

### 1.4 Usage meter, throttles and logs pages

| file:line | Issue | Fix |
|---|---|---|
| `app/(authed)/settings/usage/actions.ts:23-29` (`refreshUsageAction`) | Any user can take a **deployment-wide** snapshot, once per 10 min per user. With 100 users that is up to 100 Neon API calls and size scans every 10 min. It can also trigger `early_retention` (`lib/usage/snapshot.ts:89-93`), which runs `runRetention` for **all** users. | Owner only. Invitees see their own meters, read from the latest snapshot. **C** |
| `app/(authed)/settings/usage/actions.ts:46` (`saveNeonProjectAction`) | Any user sets a Neon project id, and `resolveNeonCredentials` picks the latest one (`snapshot.ts:51-56`). | Owner only. **C** |
| `app/(authed)/settings/usage/actions.ts:72-81` (`setThrottlesResumedAction`) | Any user can lift the global `pause_nonessential` throttle (see `throttle.ts:92`). | Owner only. **C** |
| `lib/usage/page-data.ts:61-101` | Every user sees the deployment's `largestTables`, the DB size, the Neon compute state and the throttles. | Non-owners get a "Your usage" page: their own row counts or bytes per table (§4.1), asset bytes, AI quota, and a single "lee is under load" flag. **H** |
| `lib/usage/alerts.ts:74-87` (`recordUsageAlerts`) | It loops over **all users** and creates "free-tier" todos in each invitee's list about the owner's Neon or Vercel quota. | Send deployment-meter alerts to the owner only. Invitees get alerts only for their own per-user budgets. **H** |
| `lib/usage/alerts.ts:121-133` (`usageWarningsForUser`) | The dashboard banner shows global warnings to everyone. | Same split. **M** |
| `lib/logs/queries.ts:7-9,86` (`listEvents`) | Invitees see `user_id is null` events (cron runs, cross-user sweeps). | Global events for the owner only. **H** |
| `lib/queue/runs.ts:46-47` (`visibleTo`) | Invitees see global queue jobs (`reminders:all`, `usage-snapshot:all`) and their summaries. | Owner only. **M** |

### 1.5 Crons that loop over users

| file:line | Issue | Fix |
|---|---|---|
| `lib/queue/scheduler.ts:102-104` | Runs `applyDefaults(u.id)` **sequentially for every user** inside the 09:00 cron, before scheduling. With 100 users that is 100 transactions on the critical path. | Apply defaults during onboarding only (§8). Drop the step from the scheduler, or bound it to users whose `defaults_version` is behind. **H** |
| `lib/queue/scheduler.ts:105-134` | Plans about (6 + active sources) jobs per user in one `enqueueMany`. 100 users × (6 + 16 default sources) is about 2,200 jobs a day, and each job is a Vercel invocation plus several queries. | Cap sources per user (§4.2). Use shared source fetches (§4.4). Skip the Gmail sync and digest jobs for users without those grants instead of enqueueing no-op jobs. **H** |
| `lib/queue/queue.ts:163-176` (claim) | Claims run `order by priority, run_after, created_at` and never interleave users. Early-created users always drain first, and later users' polls are left for the 12:00, 16:00 and 21:00 drains or starve. | Fair claiming (§4.2). **H** |
| `app/api/cron/discover/route.ts:43-66` | It is unscheduled but callable: a loop over all users in one 240 s budget. | Delete it, or make it owner-only with `?userId=`. **M** |
| `lib/reminders/service.ts:32-64` | A single cross-user SQL sweep. It keeps `user_id` correctly. | Fine. **L** |
| `lib/reputation/schedule.ts` + `lib/db/queries/companyReputation.ts:147-165` (`staleWatched`) | Weekly refreshes across users, ordered oldest first and bounded. Google Places runs on each user's own key and cap (`reputation_settings`). | Fine once the env fallback for `google_places` is removed (§1.3). **M** |
| `lib/db/retention/run.ts:105-122` (`runRetention`) | Cleans users sequentially within 240 s and **breaks at the deadline in the same user order every night** (`listPolicies` has no ordering, `lib/db/queries/retentionSettings.ts:46-52`). The tail users may never be cleaned. | Rotate by `last_run_at asc nulls first`, and record a per-user cursor. **H** |
| `lib/usage/alerts.ts:76` | A loop over all users (see §1.4). | Owner only. |

### 1.6 Storage cleanup global steps

`lib/db/retention/run.ts:81-91` (`runGlobalCleanup`) prunes `queue_jobs`, orphan `ai_call_logs`, expired auth rows, `usage_snapshots`/`usage_alerts`, `scam_domain_cache` and `system_events`. These are global by nature, which is correct. The problem is where they run from: the owner-only manual action (`settings/storage/actions.ts:28`) and from `early_retention` triggered by any user's refresh. The fix is in §1.2 and §1.4: global steps run from cron and the owner's admin page only.

### 1.7 Ingestion and fetch safety (new with untrusted users)

| file:line | Issue | Fix |
|---|---|---|
| `lib/discovery/adapters/http.ts:16-24` (`discoveryFetch`) | **No SSRF guard.** The `rss`, `jsonld` and `workday` sources fetch URLs the user types. `lib/ingest/ssrf.ts` exists but is only used by `lib/ingest/fetch.ts`, `lib/scam/net.ts` and `lib/settings/secrets.ts`. With invitees, someone can point a source at `169.254.169.254` or other internal addresses. | Call `assertSafeUrl` inside `discoveryFetch` for every user-configured URL, and on redirects. **C** |
| `lib/discovery/adapters/http.ts:7` | The User-Agent says "personal job tracker". | Change it to "lee/x (private job-search beta; <contact URL>)". **L** |
| `lib/settings/secrets.ts` key checks and `laya` endpoint | `layaEndpoint` comes from the user profile and is fetched server-side (`lib/decisions/laya-http.ts`). | It must go through `assertSafeUrl`. Verify this in Phase 1. **H** |

### 1.8 Direct DB use outside `lib/db/queries`

About 60 files in `lib/` and `app/` import `@/lib/db/client` directly. Every `app/api/**/route.ts` (except auth, cron, health and internal) and every `app/(authed)/**/actions.ts` authenticates. The document-asset routes authenticate through `ownedDocument()` (`lib/drive/asset-routes.ts:16`).

Most files are clean, including `lib/academy/**`, `lib/apply/**`, `lib/applications/**`, `lib/companies`, `lib/contacts`, `lib/drive/**`, `lib/gmail/**`, `lib/google/tokens.ts`, `lib/journey/**`, `lib/scam/**`, `lib/search`, `lib/storage/**` and `lib/vitals/**`. The real findings:

| file:line | Issue | Fix |
|---|---|---|
| `lib/stages/service.ts:75-110` → `lib/db/queries/stages.ts:8-19`, `lib/db/queries/activities.ts:8` (called from `app/(authed)/applications/[id]/actions.ts:125`) | **Ownership is not checked.** `applicationId` comes from the form, and the stage and activity are inserted for *another* user's application. The victim then sees the foreign activity, because `lib/analytics/service.ts:152,200` joins activities by `application_id` only. The attacker's weekly digest and journey joins (`lib/digest/weekly.ts:186-193,318-322`) inner-join the application, job and company without an owner filter, which **leaks the victim's job title and company**. | `createStage` calls `appsQ.getById(userId, applicationId, tx)` first and throws when it returns null. `stagesQ.create` and `actQ.log` verify the parent or take an owned row. Add `a.user_id = act.user_id` / `eq(applications.userId, userId)` to the analytics and digest joins. **C** |
| `app/api/documents/merge/route.ts:85-105` | `applicationId` from the body goes to `documentsQ.nextVersion` / `create` without an ownership check, so a merged PDF can be linked to another user's application id. | `appsQ.getById(userId, id)` first; 404 if missing. **H** |
| `lib/logs/sink.ts:85-91` + about 215 request-side `logger.warn/error` call sites | `user_id` is set only from explicit fields or the ambient context, and only queue drains set that context (`lib/queue/drain.ts:134`). Request-side failures persist with **user_id null**, which `listEvents` shows to everyone. Their redacted `err` strings can carry another user's URLs, company names and upstream error bodies, for example `addFromUrl failed`, `url_import_fetch_failed`, `generate-*` failed, `digest send-now failed`, `drive_fetch_failed`, `scam.assess_failed`, `calendar_op_failed`. | Set `withLogContext({ userId })` inside `requireUserId()`/`requireUser()`, so every authed request is attributed. Show null-user events to the owner only (§1.4). **C** |
| `lib/reputation/places.ts:96` | Google Places is billed per call. The per-user monthly cap (`reputation_settings`) multiplies by the number of users on the owner's `GOOGLE_PLACES_API_KEY` through the env fallback. | Covered by the owner-only fallback (§1.3). **C** |
| `lib/reputation/schedule.ts:35` + `lib/db/queries/companyReputation.ts:147-165` | The weekly refresh takes the 20 stalest watched companies across all users, so one user with many watched companies starves the rest. `lib/reputation/rate-limit.ts` is a process-global host limiter. | Round-robin per user, plus a per-user daily cap. **M** |
| `lib/ai/log.ts:148-160` (`stampLatestCallUser`) | Stamps the latest *null-user* `ai_call_logs` row onto a user: a cross-user race. It has no callers. | Delete it. **L** |
| `lib/ai/log-call.ts:88` | Provider calls without a user log `user_id` null and count against nobody's quota. | Require a `userId` for every provider call except fixtures. **L** |
| `app/(authed)/settings/integrations/page.tsx:60` | Shows whether an env key exists (`source: 'env'`). | Owner only (§1.3). **L** |
| `lib/github/adapter.ts` / `lib/env/schema.ts:34` | `GITHUB_TOKEN` is declared but unused. | Remove it from the env schema. **L** |

---

## 2. Auth and invites

### 2.1 Schema

```ts
// lib/db/schema-tenancy.ts (new module, exported from schema.ts)
invites: {
  id uuid pk,
  email text not null,               // lower-cased
  status text not null default 'pending', // pending | accepted | revoked | expired
  invitedBy uuid fk users(id) on delete set null,
  note text,                         // owner's own label, never shown to the invitee
  expiresAt timestamptz not null,    // default now() + 30 days
  acceptedUserId uuid fk users(id) on delete set null,
  acceptedAt timestamptz,
  createdAt, updatedAt,
  unique index on lower(email) where status in ('pending','accepted')
}
users += role text not null default 'member'   // 'owner' | 'member'
users += status text not null default 'active' // 'active' | 'suspended'
users += session_version integer not null default 0
users += created_at timestamptz default now(), last_seen_at timestamptz
users += onboarded_at timestamptz, defaults_version smallint
```

There is a hard cap: `count(users where status='active') + count(invites pending) <= BETA_USER_CAP` (100, a constant in `lib/tenancy/limits.ts`). It is checked when an invite is created and again at sign-in.

### 2.2 Sign-in gate (replaces ALLOWED_EMAIL)

`lib/auth/config.ts` `callbacks.signIn` runs on the Node runtime with the adapter, and makes the decision in this order:

1. Test login, only in local E2E. This is unchanged (`config.ts:46`).
2. If the email equals `OWNER_EMAIL`, allow it, then upsert `users.role='owner'` in the `signIn` event. This bootstraps the owner, and there is only ever one owner.
3. If an existing user has `status='active'`, allow it. Suspended or deleted users are refused with `/signin?error=AccessDenied`.
4. If a `pending` invite exists for the lower-cased email and has not expired, allow it. The `signIn` event marks it `accepted` and links `acceptedUserId`. The new user row starts with `onboarded_at = null`.
5. Otherwise refuse. The sign-in page shows "lee is invite-only. Ask the owner for an invite." No account row is created, because Auth.js aborts before `createUser`.

`lib/auth/edge-config.ts` `signIn` becomes `() => true`, since the edge instance never completes an OAuth flow. Its only job is decoding the JWT in `proxy.ts`. A comment there must say so.

The Google `email_verified` claim must be true. Check `profile.email_verified` in the `signIn` callback.

`ensureDefaults` moves out of the `signIn` event (`config.ts:73`) into onboarding (§8).

### 2.3 Sessions

- **Strategy.** Keep JWT sessions. The proxy stays optimistic, as Next 16 describes the role of `proxy.ts` (`proxy.md:251`: verify auth inside each Server Function, not in Proxy alone).
- **Token contents.** The `jwt` callback adds `role` and `sv` (`session_version`) to the token.
- **Server check.** `requireUserId()` (`lib/auth/require-session.ts`) becomes a real data-access-layer check. It loads `users.status, role, session_version`, memoized per request with React `cache()`, and redirects to `/signin` when the status is not active or `sv` does not match.
- **Cost.** This adds one indexed PK read per request, which is acceptable.
- **API routes.** The same check runs through a `requireUser()` helper for API routes.
- **Revoking or suspending** bumps `session_version`, so the user is signed out on their next request.
- **Session lifetime.** Set `session.maxAge` to 14 days for the beta. Auth.js defaults to 30 days.
- **Owner checks.** Add `requireOwner()` for admin pages and actions. It checks `role = 'owner'` from the DB row, not just from the token.

### 2.4 Admin UI (owner only): `/admin`

- **Invites.** Enter an email and an optional note, then create the invite, which is valid for 30 days. The list shows pending, accepted and revoked invites. Owner actions: revoke a pending invite, or resend the email (via owner Gmail if connected, else copy the link).
  - The "invite link" is just `https://getlee.vercel.app/signin`. There is no token, because the gate is the email itself.
- **Users.** Each row shows email, role, status, joined date, last seen and onboarding done. Actions are Suspend/Unsuspend and Delete account (the same flow as §7.3, run by the owner and confirmed by retyping the email).
- **Per-user storage.** This lists aggregates only: rows per table and asset bytes per user, from a new `lib/tenancy/storage.ts`. It uses `count(*)` grouped by user over the large tables (`discoveries`, `ai_call_logs`, `documents`, `document_assets`, `system_events`, `academy_*`), computed in the daily snapshot job, not on render. **Counts and bytes only, never content** (§7.5).
- **Deployment.** The existing Settings › Usage deployment view (meters, throttles, resume, Neon key, largest tables) and Settings › Logs global events move here.
- **Placement.** The page lives in `app/(authed)/admin/` with `requireOwner()` in its layout and in every action.

### 2.5 Test login

`lib/auth/test-login-provider.ts` and the guard (`lib/auth/test-login-guard.ts`) stay as they are: local only, and never active on Vercel.

Changes:

- **Seed script.** `pnpm e2e:seed` must create the test user with `role='member'`, `status='active'` and `onboarded_at` set, so E2E journeys skip onboarding. Add a second seeded **owner** identity for admin-page E2E (`e2e-owner@lee.test`), with the same guards.
- **Callback order.** The test-login branch in `signIn` stays before the invite check.
- **New E2E journeys:**
  - a non-invited email is refused (unit-tested at the callback level, since Google cannot run in E2E);
  - a suspended user is signed out;
  - user A cannot read user B's application by id (API 404).

---

## 3. Google scopes

Sources were checked on 2026-10-08:

- Gmail scope classes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Drive scope classes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Scope list: https://developers.google.com/identity/protocols/oauth2/scopes
- Sensitive scope verification: https://support.google.com/cloud/answer/13463073
- Restricted scope verification: https://support.google.com/cloud/answer/13464325
- Security assessment (CASA): https://support.google.com/cloud/answer/13465431 and https://support.google.com/cloud/answer/13463816
- Unverified apps: https://support.google.com/cloud/answer/7454865
- Exceptions to verification: https://support.google.com/cloud/answer/13464323
- Publishing status and testing: https://support.google.com/cloud/answer/15549945
- Production readiness: https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
- Token expiry (7-day testing tokens; 100 refresh tokens per account per client): https://developers.google.com/identity/protocols/oauth2#expiration
- Incremental authorization: https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth

### 3.1 Current state

All scopes are requested at every sign-in with `prompt=consent` (`lib/auth/edge-config.ts:31-56`). Separately, "Connect Google Drive" (`lib/drive/actions.ts:15`) re-runs the whole list. `lib/google/tokens.ts:114-153` already narrows a token to `drive.file` for the Picker.

| Scope | Class | Used by |
|---|---|---|
| `openid email profile` | Basic, non-sensitive | sign-in |
| `drive.file` | **Non-sensitive** (Google's recommended Drive scope) | Drive file store, Picker |
| `calendar.events` | **Sensitive** (Calendar's docs list no class; treat it as sensitive. The Console's Data Access page shows the class when the scope is added, so the owner should confirm it there) | push interview stages to Calendar |
| `gmail.send` | **Sensitive** | weekly digest, discovery email |
| `gmail.readonly` | **Restricted**. A production app that stores the data server-side needs verification plus an annual CASA assessment | Gmail sync, job-alert email ingestion |

### 3.2 What an unverified app means for invitees

- **Production status, sensitive or restricted scope, unverified:** the user sees the "Google hasn't verified this app" screen and must click through. The project gets a lifetime cap of **100 new users** that see that screen, and that cap cannot be raised without verification (7454865, production-readiness overview). Every invitee who grants a sensitive scope uses up one of the 100 slots, and so does the owner.
- **Testing status:** at most 100 allow-listed test users. They see a "this app is in testing" notice. **Any grant beyond `openid email profile` expires after 7 days**, which would break background Calendar and Drive for every invitee each week (oauth2#expiration). This status is not suitable for the beta.
- **Production status with only non-sensitive scopes** (`openid email profile drive.file`): there is no unverified screen and no user cap. Showing the app name and logo requires the lighter **brand verification** (13463073), which is free and needs a verified domain, a homepage and a privacy policy.
- **Refresh-token quota:** 100 refresh tokens per Google account per client. `prompt=consent` at every sign-in mints a new one each time. The quota is harmless but wasteful.
- **Personal-use exception (13464323):** below 100 users, an unverified app with sensitive scopes may keep running behind the warning. This is what makes owner-only Gmail possible at zero cost.

### 3.3 Plan: minimal sign-in, then incremental per feature

| Step | Scopes | Who | Verification impact |
|---|---|---|---|
| Sign-in | `openid email profile` with `prompt=select_account`, without `access_type=offline` | everyone | none |
| Connect Drive | `drive.file` with `include_granted_scopes=true`, `access_type=offline`, `prompt=consent` | anyone; recommended during onboarding | none (non-sensitive) |
| Connect Calendar | `calendar.events.owned` if it covers "create an event on my primary calendar" (check this in Phase 2), else `calendar.events` | opt-in | sensitive: until verified, warning screen plus one of the 100 slots |
| Send email from my Gmail | `gmail.send` | **owner only in Phase 1**, opt-in later | sensitive (same as above) |
| Gmail sync and job-alert email ingestion | `gmail.readonly` | **owner only** | restricted: stays under the personal-use exception, no CASA |

Implementation notes:

- **Scope constants.** One table of scopes per feature lives in `lib/google/scopes.ts`. Each feature checks `accounts.scope` (already done in `lib/drive/scope.ts`, `lib/journey/service.ts:24` and `app/(authed)/settings/notifications/page.tsx:15`) and shows a Connect button that calls `signIn('google', { redirectTo }, { scope: '<feature scope>', include_granted_scopes: 'true', access_type: 'offline', prompt: 'consent' })`.
- **Requested scopes.** Auth.js merges authorization params at call time. The base provider config must **not** list the feature scopes, so the Connect call names only the one it needs, and `include_granted_scopes` keeps the earlier grants.
- **Owner-only scopes.** `gmail.send` and `gmail.readonly` Connect buttons render only when `requireOwner()` passes. The server actions refuse the request for non-owners.
- **Digest for invitees.** Invitees still get an in-app digest page (`/digest`). Email delivery comes later, either through owner-Gmail relay (rejected: it puts the owner's mailbox in the loop and is a privacy leak) or a free transactional email service. Out of scope for the beta.
- **Default sources.** `email_alert` (Gmail ingestion) is not a default source for invitees (`lib/defaults/catalog.ts:101`).
- **Scheduler.** It skips `gmail-sync:user`, `digest:user` (email) and `discovery-email:user` when the user lacks the scope (`lib/queue/scheduler.ts:28-43`).

### 3.4 Owner's consent screen steps (Google Cloud Console › Google Auth Platform)

1. **Branding.** Set the app name "lee", logo, support email, homepage `https://getlee.vercel.app/about`, privacy policy `/privacy` and terms `/terms` (new). Add `getlee.vercel.app` under authorized domains, and verify domain ownership in Search Console if the console asks. Submit for **brand verification**.
2. **Data Access.** Remove `gmail.readonly`, `gmail.send` and `calendar.events` from the *declared* scopes list if the owner wants a clean non-sensitive app. Note that an unverified app can still *request* undeclared sensitive scopes at runtime and gets the warning screen. Keep `openid`, `email`, `profile` and `drive.file`. Read the class the console shows next to `calendar.events` / `calendar.events.owned` to confirm §3.1.
3. **Audience.** User type: **External**. Publishing status: **In production**, not Testing, because of the 7-day expiry. Test users are not needed in production. The invite gate is lee's own.
4. **Verification Center.** Do nothing for Phase 1. For Phase 3 (Calendar for invitees), submit sensitive-scope verification for `calendar.events(.owned)` with a justification and a demo video, or accept the warning plus the slot cost for at most 100 users. Never submit `gmail.readonly` unless lee leaves the beta and can afford CASA.
5. **Separate OAuth clients for dev and production.** Google recommends this (13464323), and it keeps local test grants out of the production quota.
6. **Owner's own Gmail.** The owner keeps using Gmail scopes through the Connect flow and clicks through the warning once. This uses one of the 100 slots.

---

## 4. Per-user resource fairness

### 4.1 Neon storage: 0.5 GB shared by up to 100 users

Ten users need not be at 100. The beta opens in waves (§9), and the budget is set per user.

| Budget | Value | Mechanism |
|---|---|---|
| Deployment reserve (owner, system tables, indexes, bloat) | 150 MB | n/a |
| Invitee pool | ~330 MB, keeping 20 MB headroom | n/a |
| Per invitee, 10-user wave | 30 MB | soft at 80 %, hard at 100 % |
| Per invitee, 100 users | **3 MB** | the same caps, scaled by `BETA_USER_CAP` |
| `document_assets` bytes in Postgres | **150 MB per user today** (`lib/storage/types.ts:9`), which is **impossible** beyond 3 users | invitees: 2 MB in Postgres, everything else in their own Drive (`drive.file`). Make Drive the default store for invitees. |
| PDF cache | `MAX_PDF_CACHE_BYTES` 5 MB (`lib/storage/types.ts:12`) | invitees: Drive-backed or evicted after 7 days |

Measuring:

- **Data.** The daily snapshot computes per-user approximate bytes as the sum over the big tables of `count(*) per user × avg row width` (`pg_stats` / `pg_total_relation_size ÷ reltuples`), stored in `usage_snapshots.data.userReadings`, which already exists, keyed by user.
- **Display.** Settings › Usage shows each user their own number.

Enforcing:

- **At 80 %,** the user gets a todo and a banner. Their own retention runs with tighter windows: the "early" policy uses the minimum days from `lib/db/retention/windows.ts`.
- **At 100 %,** new discoveries for that user pause, which means the scheduler skips their source polls. Manual actions keep working.

Retention stays per user, with each user's own windows (§1.2 fix). The defaults are 60 days for stale discoveries, 30 for dismissed, 180 for AI call logs and 365 for CV scores (`windows.ts:33-69`). For invitees, default to tighter beta windows: stale 30, dismissed 14, AI logs 60, CV scores 120, lab runs 60.

The biggest tables are `discoveries` (raw payload compacted by `compactDiscoveryPayloads`), `ai_call_logs`, `documents` and `system_events`. Shared source fetches (§4.4) are the biggest saving, because a posting's raw payload is stored once rather than once per user.

### 4.2 Crons and the queue within 300 s

Today:

- one scheduler at 09:00 UTC plus drains at 12:00, 16:00 and 21:00 (`vercel.json`);
- each drain runs for 240 s with concurrency 2 (`lib/queue/cron.ts:10-12`);
- visit drains take at most 2 of the user's own jobs, every 10 min (`lib/queue/visit.ts:8-12`).

**Capacity estimate.** A discovery poll takes about 2–8 s with AI scoring. Four drains × 240 s × 2 lanes is about 1,900 lane-seconds a day, which fits roughly 300–600 jobs a day. 100 users × 22 jobs is about 2,200. **It does not fit.**

Changes:

1. **Per-user caps.** Each user gets at most `MAX_ENABLED_SOURCES_PER_USER = 8` enabled per-user (non-shared) sources, checked in `lib/db/queries/sources.ts` create/update. Shared sources (§4.4) don't count, because their fetch is shared and only the per-user filter-and-score runs.
2. **Shared fetch jobs.** A new job type `source-fetch:shared` runs once per (kind, config key) per day. Each user's `discovery-source` job then only reads the shared snapshot, filters and scores. 100 users × 3 shared boards becomes 3 fetches plus 300 cheap DB-only jobs.
3. **Fair claiming.** The claim CTE orders by `priority, user_rank, run_after`, where `user_rank = row_number() over (partition by user_id order by run_after)`. The first job of every user goes before anyone's second (round-robin). The CTE is bounded by `limit` over an index on `(status, run_after)`.
4. **Per-user daily job budget** (`MAX_JOBS_PER_USER_PER_DAY = 40`), enforced in `enqueueMany` for `userId` specs.
5. **Scheduling spread.** Hobby crons are daily only, so spreading uses `run_after` offsets. The scheduler sets `runAfter = now + hash(userId) mod 6h`, so a user's polls fall between 09:00 and 15:00 and are picked up by the 12:00 and 16:00 drains and by visits. Visit drains already target the visiting user's own jobs, which is the main way active users get fresh results.
6. **No-op jobs are not enqueued.** Gmail sync and digest jobs are skipped for users without the scope. Skip all jobs for users idle for 14 days or more (`last_seen_at`), and resume on their next visit through `scheduleUserToday`.
7. **Optional GitHub Actions worker.** `app/api/internal/queue/drain/route.ts` (HMAC-signed) can drain more often from a free scheduled GitHub Action. That is still zero cost and keeps Vercel within Hobby. It is opt-in for when the beta passes about 30 users.
8. **Retention cron.** It rotates users by `last_run_at` (§1.5) and per-user cleanup gets a time slice (`budget / users`, at least 2 s).

### 4.3 AI budget

- **Own keys only** (§1.3): no env fallback for non-owners, and the decisions fallback is fixed.
- **Lee-side throttles per user** (a new `lib/tenancy/limits.ts`, with counters in a small `user_rate_counters(user_id, bucket, window_start, n)` table, upserted):
  - background AI scoring calls: at most 200 a day per user. Discovery scoring degrades to the deterministic gate plus caps (`lib/discovery/scoring.ts`) when the budget is spent.
  - interactive generation (CV, cover letter, prep): at most 60 an hour per user.
  - Model Lab runs: at most 20 a day.
- **Logging.** `ai_quota_snapshots` already tracks provider headers per user, which is good. `ai_call_logs` stay per user.
- **Prompts.** No prompt ever includes another user's data. Prompt builders take only the caller's rows, as today, and Phase 1 adds a test.

### 4.4 Source polling limits and dedupe across users

- **New table** `shared_source_snapshots(source_key text pk, kind, fetched_at, etag, items jsonb compact, item_count, error)`. `source_key` is a canonical identity: `sourceIdentity(kind, config)` already exists in `lib/defaults/catalog.ts:388`. It holds only public posting fields with no user data, and is pruned after 3 days.
- **Per-user discovery.** A user's `discovery-source` job for a shared kind reads the snapshot (fetching it first if it is older than 20 h, under an advisory lock keyed by `source_key`), then runs the existing per-user `insertManyForSource`, relevance gate and scoring.
- **Fetch modes** follow the per-source decision in §5. Per-user-only kinds (`email_alert`, `rss`/`jsonld` with private URLs, Adzuna with the user's key) keep per-user fetches.
- **Politeness.** Respect each provider's stated limits (Remotive 4 a day, Himalayas 429 backoff, Kerala parks once a day). Shared fetching guarantees this regardless of the number of users.

### 4.5 Rate limits on actions

None exist today, apart from AI provider headers and the "Run now" and "Refresh now" throttles. Add a generic `rateLimit(userId, bucket, limit, windowSec)` over `user_rate_counters`:

| Action | Limit |
|---|---|
| Add application from URL (fetch + Firecrawl) | 30/h |
| Source create/update (each triggers a poll) | 20/day |
| Document upload | 30/h, plus the bytes budget |
| LaTeX compile (shared compile service, `docs/latex-compile.md`) | 30/h per user, plus a global concurrency limit |
| CV score, cover letter, prep (AI) | in the AI budget above |
| Scam Shield second opinion / RDAP lookups | 50/day |
| Data export (§7.4) | 2/day |
| Invite creation (owner) | 20/day |

---

## 5. Job sources: terms for multi-user use

Every source kind in `lib/discovery/source-kinds.ts` / `lib/discovery/adapters` was checked against the current terms on 2026-10-08. The guiding facts: nothing is republished publicly, each user sees listings inside their own signed-in workspace, and every row links back to the provider.

| Kind | Terms, with source | Decision |
|---|---|---|
| `adzuna` | Allowed uses are publishing ads, salary estimates and personal research; other commercial use only as a 14-day trial. Requires an "Adzuna" logo credit of at least 116×23 px linked to Adzuna. Limits: 25/min, 250/day, 1000/week, 2500/month. Multiple accounts for one entity count as misuse. https://developer.adzuna.com/docs/terms_of_service | **Per-user fetch with the user's own key only.** No shared or env key: 100 users × 4 calls breaks the per-key caps and the "personal research" framing. Add the logo credit. |
| `remotive` | Link back and credit; **at most 4 requests a day**; no submission to other boards; and "displaying our jobs in order to collect signups/email addresses … constitutes a breach". https://github.com/remotive-com/remote-jobs-api and the API's legal notice | **Owner-only.** An invite-gated app showing Remotive jobs is too close to the banned "collect signups" pattern. Hide it from the invitee source catalog. |
| `remoteok` | Link back "with follow" and name Remote OK, or access is suspended; no logo without permission. https://remoteok.com/api | **Allowed, shared fetch.** It is one global feed. `?tag=design` filters design jobs. |
| `himalayas` | Link back and credit; do not submit to third-party sites; rate limited (429). https://himalayas.app/api | **Allowed, shared fetch** keyed by query, at most once a day. No category parameter: search for "product designer" and similar, and filter on `categories`/`parentCategories`. |
| `jobicy` | Credit with a direct link; job boards and AI tools explicitly fine; cache. https://jobicy.com/jobs-rss-feed | **Allowed, shared fetch** keyed by geo and industry (`industry=design-multimedia` for design). |
| `weworkremotely` | "Anyone can use the feed … attribute the links back." https://weworkremotely.com/remote-job-rss-feed | **Allowed, shared fetch** per category feed (`remote-design-jobs.rss`, `remote-product-jobs.rss`). |
| `workingnomads` | No licence text; robots allows all (`docs/job-sources.md`). | **Allowed, shared fetch**, with a link back. |
| `hn_whoishiring` | The HN Firebase API is MIT-licensed with no rate limit. https://github.com/HackerNews/API | **Allowed, shared fetch** (one monthly thread). |
| `greenhouse`, `lever`, `ashby`, `recruitee`, `pinpoint`, `workable` | Public job-board APIs for publishing a company's own postings. For Workable, lee uses the widget API (`workable.ts:100`) with v3 as the fallback (`:104`); robots allows `/api/`. Lever says postings "may be scraped by third parties". Greenhouse: "publicly available, so authentication is not required". https://docs.greenhouse.io/job-board.html , https://github.com/lever/postings-api , https://developers.ashbyhq.com/docs/public-job-posting-api | **Allowed, shared fetch** keyed by company slug: one fetch per slug a day, however many users follow it. |
| `workday`, `oracle_orc`, `successfactors`, `phenom` (`lib/discovery/adapters/workday.ts`, `enterprise.ts`) | No explicit licence; robots notes in `docs/job-sources.md:96-99`. | **Allowed, shared fetch** keyed by tenant and site, **behind the SSRF guard** (§1.7). Oracle, SuccessFactors and Phenom stay catalog-only, as today. |
| `technopark`, `infopark`, `cyberpark`, `ul_cyberpark`, `ksum` (`kerala-parks.ts`) | robots allows them (UL Cyberpark has no robots.txt); no terms. They are small public-sector sites. | **Allowed, shared fetch only**, once a day. Per-user fetching would hit them about 100 times a day. |
| `rss`, `jsonld` (user-supplied URL) | Depends on the site, and the user is responsible for it. | **Per-user fetch**, deduped by canonical URL, **SSRF guard required**, counts against the per-user source cap. |
| `email_alert` | The user's own Gmail; `gmail.readonly` is restricted. | **Owner-only** in the beta (§3). |
| `watch` | Never fetched. | Allowed for everyone. It is the recommended way to follow boards without APIs. |
| `yc_directory` | `www.ycombinator.com/api/companies` (`yc-directory.ts:40`) **returns 404 today**, so the adapter is broken. robots disallows `/companies?*`. No public API terms. Disabled by default (`lib/defaults/catalog.ts:47`). | **Drop** (hide it from the catalog). If it is fixed, use a shared fetch. |

Design-only boards were checked too:

| Board | Finding | Use |
|---|---|---|
| Dribbble | Has `jobs.rss`, but its Terms ban automated access and scraping, §7.1-7.2 (https://dribbble.com/terms) | `watch` only |
| Behance | Job list returns 403 to clients; its API is offline | `watch` |
| AIGA Design Careers | robots disallows its feeds | `watch` |
| Authentic Jobs | robots disallows `/feed/` | `watch` |
| Working Not Working | No feed | `watch` |

**Docs to update:** `docs/job-sources.md:3-7` still says "single-user". Add the Remotive signup clause and the Adzuna monthly cap and logo rule, and add a "multi-user mode" column with the decisions above.

---

## 6. Data-driven domains

### 6.1 Taxonomy file

The owner-specific lists in `lib/discovery/relevance/roles.ts:17-88` (the `*_SKILLS` lists) and `ROLE_FAMILIES` (`:89-240`; 17 families, all engineering) are replaced by versioned data: `content/domains/taxonomy.json` (plus `manifest.json` with a version), validated on load like `content/academy` (`lib/academy/content/catalog.ts`).

```jsonc
{
  "version": 1,
  "domains": [
    { "id": "software", "label": "Software engineering", "families": ["backend","frontend","fullstack","mobile","devops","qa_automation","security","api_integration","payments","einvoicing","erp","llm_app","solutions","support_eng","implementation"] },
    { "id": "data", "label": "Data & AI", "families": ["data_engineering","data_science","ml","analytics_engineering"] },
    { "id": "analysis", "label": "Analysis", "families": ["business_analyst","data_analyst","financial_analyst","product_analyst"] },
    { "id": "design_uiux", "label": "UI/UX design", "families": ["ux_designer","ui_designer","ux_researcher","interaction_designer","design_systems"] },
    { "id": "design_product", "label": "Product design", "families": ["product_designer","service_designer"] },
    { "id": "design_graphic", "label": "Graphic & brand design", "families": ["graphic_designer","brand_designer","visual_designer","motion_designer","illustrator"] },
    { "id": "product", "label": "Product management", "families": ["product_manager","product_owner","technical_pm"] },
    { "id": "marketing", "label": "Marketing", "families": ["digital_marketing","performance_marketing","content_marketing","seo","social_media","growth","product_marketing"] },
    { "id": "sales_cs", "label": "Sales & customer success", "families": ["account_executive","sdr_bdr","customer_success","solutions_consultant"] },
    { "id": "operations", "label": "Operations & project", "families": ["project_manager","program_manager","operations","scrum_master"] },
    { "id": "finance", "label": "Finance & accounting", "families": ["accountant","fpa","audit","tax"] },
    { "id": "people", "label": "HR & recruiting", "families": ["recruiter","hr_generalist","people_ops"] },
    { "id": "writing", "label": "Writing & content", "families": ["technical_writer","copywriter","content_strategist"] }
  ],
  "families": {
    "ux_designer": {
      "label": "UX designer",
      "titles": ["ux designer","user experience designer","ux/ui designer","ui/ux designer","ux lead","ux specialist"],
      "negativeTitles": ["ux engineer"],          // routed to frontend
      "lexicons": ["design_tools","ux_research","prototyping","design_systems","accessibility_design"]
    },
    "graphic_designer": {
      "label": "Graphic designer",
      "titles": ["graphic designer","visual designer","brand designer","communication designer","dtp"],
      "lexicons": ["adobe_cc","branding","print","typography"]
    }
    // …every family listed under domains
  },
  "lexicons": {
    "design_tools": ["figma","figjam","sketch","adobe xd","framer","protopie","invision","zeplin","miro"],
    "ux_research": ["user research","usability testing","user interviews","personas","journey mapping","card sorting","a/b testing","heuristic evaluation","jobs to be done"],
    "prototyping": ["prototyping","wireframing","wireframes","high-fidelity","low-fidelity","interaction design","micro-interactions"],
    "design_systems": ["design systems","design system","component library","design tokens","atomic design","storybook"],
    "accessibility_design": ["wcag","accessibility","a11y","inclusive design"],
    "adobe_cc": ["adobe creative cloud","adobe cc","photoshop","illustrator","indesign","after effects","premiere pro","lightroom"],
    "branding": ["branding","brand identity","logo design","visual identity","brand guidelines"],
    "print": ["print design","packaging","prepress","layout","editorial design"],
    "typography": ["typography","type design","kerning","grid systems"],
    "marketing_core": ["seo","sem","google ads","meta ads","hubspot","google analytics","ga4","email marketing","crm","content strategy","copywriting"],
    "analysis_core": ["excel","power bi","tableau","sql","looker","requirements gathering","bpmn","stakeholder management","jira"]
    // the existing software lexicons move here unchanged: backend, frontend, devops, api, payments, einvoicing, llm, qa, support, client, platform, integrations
  },
  "sourceHints": {
    "design_uiux": { "remoteok": {"tag":"design"}, "weworkremotely": {"feeds":["remote-design-jobs","remote-product-jobs"]}, "jobicy": {"industry":"design-multimedia"}, "himalayas": {"q":["product designer","ux designer","ui designer"]} },
    "design_graphic": { "remoteok": {"tag":"design"}, "weworkremotely": {"feeds":["remote-design-jobs"]}, "jobicy": {"industry":"design-multimedia"}, "himalayas": {"q":["graphic designer","brand designer"]} },
    "marketing": { "jobicy": {"industry":"marketing"}, "weworkremotely": {"feeds":["remote-sales-and-marketing-jobs"]}, "himalayas": {"q":["marketing manager"]} }
  }
}
```

**Migrating the existing software families.** They move into the file unchanged, and a golden test asserts that `classifyRole` returns the same result as today for the owner's fixture set. The owner's relevance behaviour must not change.

**Profile.** `user_profile.role_types` keeps its family ids, and a new `user_profile.domains text[]` is added.

**Unknown domains.** "Other" lets the user type titles and keywords, which become user-level synonyms stored in `user_profile`. No taxonomy change is needed.

### 6.2 How each feature generalises

- **Relevance gate** (`lib/discovery/relevance/gate.ts`, `roles.ts:300-325`): `classifyRole` uses the taxonomy for the user's selected domains. The `engineering`/`NON_ENGINEERING_TITLE` split becomes "in my domains / outside them". `inferFamilies` (generic titles) uses each family's lexicons.
- **Match score** (`lib/discovery/scoring.ts`): the AI prompt gets the user's domain label and lexicons instead of an implicit engineering frame. The deterministic caps (location, seniority, must-haves, role at 50) apply to every domain. The `einvoicingBonus` (`scoring.ts:58-62`) becomes a per-domain "specialty bonus" listed in the taxonomy, so it only applies when the user's evidence matches.
- **CV score** (`lib/cv-score/lexicon.ts`, `dimensions/domain.ts`, `role-alignment.ts`, `keywords.ts`): the action verbs are domain-neutral. `domain` and `keywords` read the lexicons of the user's families. Add design-specific checks:
  - a portfolio link present (Behance, Dribbble or a personal site);
  - case studies mentioned;
  - tools listed.
  Bump `SCORER_VERSION`.
- **CV templates** (`lib/latex/templates`): the existing templates are domain-neutral. For design, add a note that designers usually send a PDF portfolio. lee should let the user attach a Drive portfolio PDF per application (`document_assets`, Drive-backed), and not try to generate a portfolio.
- **Starter sources** (`lib/defaults/catalog.ts`): today the catalog is the owner's list (Kerala and GCC fintech companies, 16 enabled sources). It becomes:
  - a neutral core (RemoteOK, Himalayas, WWR, Jobicy, HN, all shared);
  - plus `sourceHints` for each of the user's domains, plus the user's regions;
  - applied once during onboarding.
  The owner keeps their current set: `DEFAULTS_VERSION` stays and the owner is marked as already applied.
- **Playground** (`content/academy/skills.json`, 14 domains and 43 skills, all engineering; `docs/playground.md`): **out of scope for design domains in the beta.** For non-software users, hide the Playground from navigation (`lib/journey`) behind `user_profile.domains ∩ {software, data}`. A later design-domain pack is possible, because the engine is data-driven (a skill graph plus `concept_check` items). That pack would cover heuristics, accessibility, typography, colour, research methods and design-systems quizzes. It would be a separate content pack (`content/academy-design/`) with its own manifest, and no engine change. Coding problems and the runner stay engineering-only.

---

## 7. Privacy and legal

### 7.1 Privacy policy (`app/(public)/privacy/page.tsx`)

Rewrite the policy for an invite-only beta:

- **Who runs it.** The owner, as an individual and non-commercially. Keep it free: the Vercel Hobby non-commercial terms forbid charging.
- **What is stored per user.** Profile, CV text and documents (in Postgres, or the user's own Drive via `drive.file`), applications, discoveries, AI call logs (prompts are not stored, as today), encrypted API keys and Google tokens (encrypted, §1.1).
- **Google data.** It follows the Google API Services User Data Policy, including Limited Use. lee only touches the scopes the user grants, Drive covers only files lee created or the user picked, and invitees have no Gmail access.
- **AI processing.** Data goes to the user's own AI provider with their own key, under that provider's terms.
- **Who can see it.** Only the user. The owner sees account metadata only (§7.5).
- **Retention.** Per-user windows, and account deletion (§7.3).
- **Contact and region.** Contact is `SUPPORT_EMAIL`. Data is hosted in Neon Singapore and Vercel `sin1`.

### 7.2 Terms (new `app/(public)/terms/page.tsx`)

The terms add `/terms` to `PUBLIC_PATHS` in `proxy.ts:15` and cover:

- a free, invite-only beta with no warranty and no SLA, which may end with 30 days' notice and an export window;
- the user's responsibilities: their own AI keys and costs, lawful use, and the terms of sources they add (`rss`/`jsonld`);
- no scraping through lee, and no attempt to access other users' data;
- that the owner can suspend accounts;
- listings link to the original job boards, and lee does not republish them.

### 7.3 Delete my account and data

This lives in Settings › Account → "Delete my account".

1. The user retypes their email. A server action, `requireUserId()`, refuses to delete the owner, who must transfer or close the deployment instead.
2. lee revokes the Google grant via `https://oauth2.googleapis.com/revoke` with the refresh token, and ignores errors.
3. In one transaction it deletes from `users`. `ON DELETE CASCADE` covers almost every table (§1.1). Rows that do not cascade are deleted explicitly first:
   - `ai_call_logs` (`set null`);
   - `invites` rows by email;
   - `shared_source_snapshots` hold no user data, so they need nothing.
   Then `system_events` where `user_id` = the user (cascade) and `queue_jobs` (cascade).
4. Files in the user's Drive are **not** deleted. They belong to the user, and the confirmation screen says so.
5. The `session_version` bump is moot, since the row is gone. The JWT fails at the next `requireUserId()` DB check.
6. lee logs `account_deleted` with `user_id = null` and **no email**, only the deletion time. It goes to the owner's admin log.

A test asserts that every table with a `user_id` FK has `onDelete: 'cascade'`. It parses `schema*.ts`, so a new table cannot silently break deletion.

### 7.4 Data export

Settings › Account → "Export my data" builds a ZIP:

- **JSON per table** of the user's own rows, one file per table, generated from a list of `(table, userIdColumn)` pairs that is tested against the schema like above.
- **Documents.** Markdown and LaTeX sources, and asset bytes held in Postgres. Drive files are listed with links.

It is generated on request inside one function, streamed and bounded (at most 30 MB). With the per-user budgets in §4.1 it fits. Rate limit: 2 a day.

### 7.5 Isolation and owner visibility

- **Drive.** Each user's files live in **their own** Drive under `drive.file`. Tokens are per account row, and `drive_folders` is keyed by `(user_id, folder_key)` (`schema.ts:787-797`). There is never a shared or owner Drive folder. The Picker token is narrowed per user (`lib/google/tokens.ts:114`).
- **Documents and PDFs.** `documents`, `document_assets` and `document_pdf_cache` are all `user_id`-scoped. The LaTeX compile service (`docs/latex-compile.md`) is shared and stateless. Phase 1 must confirm that it keeps no artifacts between requests and has no cache keyed only by content hash that could cross users.
- **Owner's view, the default (and the only option in the beta):**
  - user email, name, status, role, joined and last-seen dates;
  - aggregate counts and bytes per table;
  - queue job counts and failure counts per user, without payloads;
  - global events.
  - **No** UI or query path exposes another user's applications, documents, CV, discoveries, keys, prompts or logs with context.
- **Admin code.** Admin queries live in `lib/tenancy/admin-queries.ts`, return only aggregates, and are unit-tested to never `select` content columns.
- **Logs.** User events go to that user only. Global events must not carry user data. The `lib/logs/redact.ts` allow-list already reduces emails to domains; also forbid `company`, `title` and `url` keys in null-user events.
- **Support access.** Debugging a user's issue requires the user to send an export or screenshots. There is no owner impersonation in the beta. If that is ever needed, it must be consent-based and time-boxed, with a visible banner for the user and an audit row.
- **Direct DB access.** The owner can technically read the Neon database. The privacy policy says so honestly ("the operator has database access for maintenance and does not browse user data"). Encrypting tokens and keys at rest limits the damage.

---

## 8. Onboarding

When a user signs in with `users.onboarded_at = null`, `app/(authed)/layout.tsx` redirects to `/welcome`, a short wizard. Each step can be skipped, except the first.

1. **Domains** (required). Pick one or more domains from the taxonomy, then families within them (chips with synonyms). Seniority uses the existing levels.
2. **Regions and work mode.** Regions (GCC countries, India, EU, US, remote-global), remote, hybrid or on-site, and willing to relocate. These map to the existing search preferences (`lib/discovery/search-prefs.ts`).
3. **CV import.** Upload a PDF or DOCX, or paste text. Parsing is deterministic first, through the existing `lib/cv-score/extract.ts`, then AI only if a key is present. The profile fields are filled from the result, and **the user confirms them**.
4. **AI key.** Add a Gemini or Groq key, with the existing Settings › AI form, the "Test" button and a link to AI Studio and the Groq console. Without a key, lee runs **deterministic-only**: relevance gate plus caps, no AI scoring or generation. A banner explains this.
5. **Connect Google Drive** (recommended). `drive.file` keeps documents out of the shared database (§4.1).
6. **Starter sources.** lee previews the shared sources chosen from domains and regions (`sourceHints`), and the user toggles them. They are then applied (`ensureDefaults` with the user's domains) and the first poll is enqueued with `scheduleUserToday` (`lib/queue/scheduler.ts:52`).
7. Done: `onboarded_at = now()`.

**Empty states** (one component pattern, `components/empty-state.tsx`, with a primary action):

| Page | Message and action |
|---|---|
| Dashboard | "Your first discoveries arrive within a few hours." Show the queued poll status and "Run now" (existing throttle). |
| Discoveries | "No matches yet". Links to "Adjust preferences" and "Add a company to follow" (`watch`, or ATS by slug). |
| Applications | "Track your first application". Shows "Add from URL" and "Add manually". |
| Documents | "Import your CV" if none exists, otherwise "Generate a tailored CV" (needs an AI key). |
| Playground | Hidden for non-software domains (§6.2). |

---

## 9. Phased plan

### Phase 1: the smallest safe slice

Scope: invites, the gate, and the tenancy fixes. No Gmail for invitees. Target: 5–10 invitees.

**Migrations:**

- `invites` (new).
- `users` gains role, status, session_version, created_at, last_seen_at, onboarded_at and defaults_version. Backfill the owner as `role='owner'` and `onboarded_at = now()`.
- `deployment_settings` (single row: throttles_resumed_period, neon_project_id). Data migrates from the owner's `usage_settings`.
- `user_rate_counters` (new).
- `accounts`: tokens are encrypted by a code-level re-encrypt on read and write, not a schema change. A one-off script re-encrypts the existing rows.

**Code:**

- **Gate and auth.** The gate (§2.2), `requireUserId` with the DB status check (§2.3), `requireOwner`, and minimal `/admin` (invites, users, aggregates).
- **Scopes.** Sign-in becomes `openid email profile` (§3.3). Drive Connect requests only `drive.file`. Gmail and Calendar Connect are owner-only.
- **Keys.** All env-key fallbacks become owner-only (§1.3). The `github_portfolio` env fallback is removed entirely. The decisions catch no longer falls back to env.
- **Usage, logs and queue views.** Usage actions become owner-only. Usage alerts go to the owner only. Global log events and global jobs become owner-only (§1.4).
- **Storage.** Storage actions are split: users manage their own windows and cleanup, and the owner runs the global steps (§1.2).
- **Safety.** The SSRF guard goes into `discoveryFetch`, and the Laya endpoint is checked (§1.7).
- **Sources and budgets.** Remotive and yc_directory are hidden from invitees, and Adzuna requires the user's own key (§5). The invitee asset quota is 2 MB in Postgres with Drive as the default store, plus the tighter invitee retention defaults and the source cap of 8 (§4.1, §4.2).
- **Legal.** The privacy policy is rewritten and `/terms` added (§7.1-7.2).
- **Onboarding.** A minimal version: domains limited to the existing software families plus a free-text "Other", regions, AI key, Drive.
- **Rate limits.** The table in §4.5.

**Acceptance criteria:**

- A non-invited Google account is refused, and no `users` row is created (unit test on the callback).
- An invited email can sign in, and its invite is marked accepted. A revoked or suspended user loses access on the next request (E2E with test login).
- A two-user isolation suite (new `tests/integration/tenancy.test.ts`) seeds users A and B, then calls every query module's list/get/update/delete with A's id against B's rows. All return empty or null and change nothing. This covers every `lib/db/queries/*.ts` module.
- With the env keys set, a non-owner's AI call fails with "add a key". It never succeeds through env (unit tests per resolver).
- A non-owner cannot call the usage refresh, resume, Neon project or global cleanup actions (action tests). Settings › Logs shows no global events to them.
- An `rss` source pointing at `http://169.254.169.254/` or `http://localhost` is rejected.
- A test asserts that every `user_id` FK cascades (§7.3).
- The owner's relevance results are unchanged (golden test).
- Adding a stage or merging a PDF against another user's application id returns 404 and writes nothing (§1.8).
- Every request-side log event carries the caller's `user_id`.
- `pnpm test`, the E2E journeys and the build are green.

**Estimate:** about 6 migrations, about 45–60 files touched, about 2,000 lines including tests.

### Phase 2: fairness and shared sources (before about 30 users)

**Migrations:** `shared_source_snapshots`; `user_profile.domains`.

**Code:**

- Shared fetch jobs, and per-user discovery reading the snapshot (§4.4).
- Fair claiming, per-user job budget and the `run_after` spread (§4.2).
- Retention rotation (§1.5).
- Per-user storage measurement and enforcement (§4.1).
- The AI budget throttles (§4.3).
- Delete account and export (§7.3-7.4).
- The per-user system_events cap.

**Acceptance criteria:**

- With 100 synthetic users × 8 sources seeded in PGlite, `scheduleDailyJobs` and the four drains in a simulated day process every user's first poll before anyone's second.
- Each shared source key is fetched at most once a day.
- Retention reaches every user within 2 nights.
- Delete removes every row (count = 0 over every user-scoped table), and the export round-trips.

**Estimate:** about 3 migrations, about 35 files, about 1,500 lines.

### Phase 3: data-driven domains (design, marketing, analysis and more)

**Code:**

- `content/domains/taxonomy.json` plus its loader and validator.
- `roles.ts` and `gate.ts` read the taxonomy.
- The scoring prompt and specialty bonus become per-domain.
- CV score lexicons per domain, plus the design checks.
- `sourceHints` drive the starter sources.
- The full onboarding domain picker.
- The Playground is hidden for non-software users.
- Calendar Connect for invitees, if verified or if the warning is accepted.

**Acceptance criteria:**

- Golden tests: the owner's fixture set is unchanged. Fixture sets for UI/UX, graphic and marketing titles classify correctly, with at least 90 % on a labelled set of about 200 titles.
- A design user with RemoteOK `tag=design`, WWR design feeds and Jobicy `design-multimedia` gets design discoveries and no backend roles.

**Estimate:** no migration beyond Phase 2, about 25 files, about 1,500 lines (mostly data and tests).

### Phase 4 (optional, after the beta proves out)

- A design-domain Playground pack.
- Email delivery of the digest for invitees.
- Sensitive-scope verification for Calendar.
- The GitHub Actions drain worker.

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A missed unscoped query leaks one user's data to another | critical | Two-user isolation suite over every query module (Phase 1 gate); `requireUserId` everywhere; review direct `db.` use (§1.8). |
| The owner's keys are used by invitees (cost, ToS) | high | Owner-only env fallbacks, with tests per resolver. |
| Neon 0.5 GB exhausted | high | Per-user budgets, Drive-first assets, shared snapshots, tighter retention, invites in waves. |
| Hobby crons can't drain 100 users | medium | Shared fetches, fair claiming, idle-user skip, the optional GitHub Actions worker. |
| Google unverified-app slots used up (100 lifetime) | medium | Invitees never get sensitive scopes in Phase 1–2. Only the owner uses a slot. |
| Vercel Hobby "non-commercial" | medium | The beta stays free, with no ads and no payments. The Terms say so. |
| Source providers object to multi-user polling | medium | Shared fetch (one request regardless of users), honest User-Agent with contact, link backs, Remotive owner-only, Adzuna own keys. |
| SSRF via user-supplied source URLs | high | Guard in `discoveryFetch`, including redirects. |
| JWT outlives revocation | medium | DB status check and `session_version` in `requireUserId`. |
| The owner's relevance tuning regresses during the taxonomy move | medium | Golden tests on the owner's fixtures before refactoring. |

### Schema and code touched (summary)

- **New tables:** `invites`, `deployment_settings`, `user_rate_counters`, `shared_source_snapshots`.
- **Altered tables:** `users` (7 columns), `user_profile` (`domains`).
- **No changes:** the existing per-user tables, apart from FK cascade checks.
- **New modules:** `lib/tenancy/*` (limits, rate limits, admin queries, storage), `lib/google/scopes.ts`, `content/domains/*`, `app/(authed)/admin/*`, `app/(authed)/welcome/*`, `app/(public)/terms/*`.
- **Most-touched modules:** `lib/auth/*`, `lib/settings/secrets.ts`, `lib/lab/providers/registry.ts`, `lib/decisions/index.ts`, `lib/usage/*`, `lib/logs/queries.ts`, `lib/queue/{scheduler,queue,runs}.ts`, `lib/db/retention/run.ts`, `lib/discovery/{service,adapters/http}.ts`, `lib/discovery/relevance/*`, `lib/defaults/*`, `lib/cv-score/*`, `app/(authed)/settings/{usage,storage,logs}`, `app/(public)/privacy`.
