# lee — Core Tracker (v1) Design Spec

**Date:** 2026-09-14
**Author:** Mohamed Shamil (with Claude)
**Status:** Approved — ready for implementation planning
**Scope:** Sub-project 1 of 5 in the lee roadmap

---

## 1. Overview

lee is a personal job-search platform: a deployed web app that tracks applications, discovers matching jobs and companies from legitimate sources, generates tailored CVs and cover letters, syncs interviews with calendar, and drafts outreach — all built for a single user first, with the schema shaped to support multi-tenancy later.

This spec covers **v1: Core Tracker**, the foundation the rest of the roadmap builds on. v1 does not do AI job discovery, CV generation, Gmail/Calendar sync, or outreach — those ship as sub-projects 1.5, 2, 3, and 4. But v1's schema includes stubbed tables and columns so later sub-projects are purely additive (no destructive migrations).

## 2. Roadmap context

| Sub-project | Ships | What it adds |
|---|---|---|
| **v1 — Core Tracker** *(this spec)* | First | App skeleton, auth, applications pipeline, jobs, companies, contacts, interview stages, activity timeline, company watchlist, manual JD paste flow |
| v1.5 — Discovery | Next | Source adapters (Greenhouse, Lever, Ashby, Workable, RemoteOK, HN Who's Hiring, Bayt, Naukri, KSUM, etc.), polling cron, AI job + company matching, discovery inbox UI |
| v2 — CV & Documents | After v1.5 | Master CV as structured JSON, AI-tailored CV variants per job, cover letters, PDF export |
| v3 — Communications | After v2 | Google OAuth (Gmail read + Calendar r/w), auto-match recruiter threads, interview event sync, follow-up reminders |
| v4 — Outreach & Prep | After v3 | LinkedIn message drafting (copy-paste UX, no scraping), interview prep packs, weekly digest email |

Each sub-project gets its own design → plan → implementation cycle. This spec is v1 only.

## 3. Goals and non-goals

### 3.1 In scope (v1 ships this)
- Single-user Google login via Auth.js v5 with a single allowed email gate
- Manual "Add Application" flow: paste JD URL → server fetches public page → Gemini parses to structured `Job` record → creates linked `Application` in `saved` status
- Manual entry fallback for URLs that fail to fetch
- Kanban and table views of the pipeline (Saved → Applied → Screen → Interview → Offer → Rejected → Withdrawn)
- Per-application detail page with activity timeline, POC list, interview stages, notes
- Companies watchlist page (`/companies`) with manual add, stance/interest fields, ATS auto-detection
- Contacts registry per company, many-to-many join with applications, role labels
- Interview stages: first-class scheduled events per application with status, outcome, prep/debrief notes
- User profile page (`/settings/profile`) with skills, industries, seniority, location prefs, stack weights, benefit prefs, must-haves, dealbreakers
- One-shot profile importer: paste a CV file path + PROFILE.md path → AI pre-fills the profile → user reviews and edits
- Weekly digest **page** (in-app, no email in v1)
- Vercel Cron: `/api/cron/reminders` (active) — checks `next_action_at` daily
- Vercel Cron: `/api/cron/discover` (stub, returns 200) — wired in v1.5
- All schema tables carry `user_id` from day one

### 3.2 Explicitly out of scope (deferred)
- Any AI job/company discovery cron or source adapters (v1.5)
- CV/cover letter generation and PDF export (v2)
- Gmail or Calendar integration (v3)
- LinkedIn outreach drafting, interview prep packs, weekly digest email (v4)
- Browser extension of any kind (never planned; manual paste is the philosophy)
- Public signup, billing, marketing site (may come with v3+ multi-tenant flip)
- Mobile app (web only; Vercel deploys are mobile-responsive)

### 3.3 Success criteria
- Add a job from any public JD URL in under 30 seconds
- Pipeline visible at a glance; status change is one click
- Interview stage add takes under 15 seconds
- Deployed on Vercel, $0/month at personal-use volume
- All schema tables have `user_id`; adding user #2 later requires zero destructive migrations
- 80%+ test coverage overall, 90%+ on `lib/`

## 4. Architecture

### 4.1 High-level shape

```
┌──────────────────────────────────────────────────────────────┐
│  Browser — Next.js App Router (RSC + client islands)         │
│  Routes:                                                     │
│    /                     dashboard (kanban + table)          │
│    /applications         list                                │
│    /applications/new     paste URL or manual form            │
│    /applications/[id]    detail + timeline + stages + POCs   │
│    /companies            watchlist                           │
│    /companies/[id]       company detail                      │
│    /contacts             contacts registry                   │
│    /settings/profile     user profile editor + importer      │
│    /settings/sources     source list (empty in v1)           │
│    /digest               weekly in-app digest                │
└────────────────┬─────────────────────────────────────────────┘
                 │ Server Actions + Route Handlers
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js Server — Vercel Functions (Node runtime)            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ app/       thin adapters, RSC pages, server actions    │  │
│  │ lib/       framework-free business logic               │  │
│  │   applications/  service.ts, queries.ts, types.ts      │  │
│  │   jobs/          service.ts, queries.ts, types.ts      │  │
│  │   companies/     service.ts, queries.ts, ats-detect.ts │  │
│  │   contacts/      service.ts, queries.ts                │  │
│  │   stages/        service.ts, queries.ts                │  │
│  │   activities/    service.ts, queries.ts                │  │
│  │   profile/       service.ts, queries.ts, importer.ts   │  │
│  │   ingest/        fetch.ts, html-clean.ts, ssrf.ts      │  │
│  │   ai/            types.ts, gemini.ts, prompts/         │  │
│  │   db/            schema.ts, client.ts, migrations/     │  │
│  │   auth/          config.ts, allowed-email.ts           │  │
│  │   env/           schema.ts (Zod-validated env)         │  │
│  │   logger/        structured console logger             │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────┬────────────────────┬────────────────────────┘
                 │                    │
                 ▼                    ▼
       ┌─────────────────┐    ┌──────────────────────────────┐
       │ Neon Postgres   │    │ External services            │
       │ (Drizzle ORM)   │    │  Google OAuth (auth only)    │
       │ + Vercel branch │    │  Gemini 2.5 Flash API        │
       │   preview       │    │  Firecrawl (fallback fetch)  │
       └─────────────────┘    └──────────────────────────────┘
```

### 4.2 Design principles
- **`lib/` is framework-free.** Pure TypeScript with a `Db` and `AIProvider` dependency injected. All business logic testable without Next.js.
- **`app/` is a thin adapter.** RSC pages, server actions, and route handlers translate HTTP/Next concerns into `lib/` calls. No business logic in `app/`.
- **Small focused files.** Target 200–400 lines per file; hard cap at 800. If a file grows past that, split it.
- **Immutable updates in `lib/`.** Pure functions return new objects. Mutation happens only at the DB write boundary.
- **AI hidden behind an interface.** `AIProvider` is the seam. Gemini is the only impl in v1. Anthropic/OpenAI implementations are additive files, one env var away.
- **Every DB query takes `userId` as the first argument** and includes it in every `WHERE` clause. This is code-enforced row scoping today, ready for Postgres RLS the day we open signup.
- **Fail fast on config.** Env vars validated at startup with a Zod schema; missing required vars crash the process before serving traffic.

### 4.3 Tech stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | Next.js | 15.x (App Router) | RSC, server actions, Vercel-native |
| Runtime | Node.js on Vercel Functions | 22 LTS | Full Node API needed for `ingest` + `cheerio` |
| Language | TypeScript | 5.6+ | Strict mode, `noUncheckedIndexedAccess` on |
| DB | Neon Postgres | 16 | Serverless, sleeps on idle, free tier |
| ORM | Drizzle | latest | Type-safe, lightweight, edge-ready |
| Migrations | drizzle-kit | latest | Generates SQL from schema, applied in build |
| Auth | Auth.js (NextAuth v5) | latest | Google provider, single-user gate |
| AI | `@google/generative-ai` | latest | Gemini 2.5 Flash, free tier, JSON schema output |
| HTML fetch | `undici` (built-in) + `cheerio` | latest | Server-side fetch + parse |
| JS-heavy fallback | Firecrawl API | free tier | Only when Cheerio yields <500 chars |
| Env validation | Zod | latest | Runtime validation, type inference |
| UI kit | shadcn/ui | latest | Tailwind + Radix primitives, copy-paste components |
| Icons | Lucide React | latest | Tree-shakeable |
| Tables | TanStack Table | v8 | Kanban and pipeline table |
| Forms | react-hook-form + Zod | latest | Type-safe form handling |
| Test runner | Vitest | latest | Fast, TS-native, works with React Testing Library |
| Component tests | React Testing Library | latest | RSC-friendly via `next/test` |
| Integration tests | Vitest + Neon test branch | latest | Real Postgres, ephemeral branch per CI run |
| E2E | Playwright | latest | Golden path in CI |
| Lint | ESLint (`next/core-web-vitals`) + `eslint-config-prettier` | latest | Next's defaults |
| Format | Prettier | latest | 2-space, single quotes, no semis? — semis on, per Next default |
| Package manager | pnpm | 9.x | Fast, strict, Vercel supports natively |

## 5. Data model

Schema uses Drizzle. All enums are Postgres `enum` types. All timestamps are `timestamp with time zone`. All primary keys are `uuid` generated via `gen_random_uuid()`.

### 5.1 Users (Auth.js managed)

Auth.js creates and manages these tables (`users`, `accounts`, `sessions`, `verification_tokens`). We reference `users.id` from our tables. Single-user v1 means the `users` table has exactly one row after first sign-in.

### 5.2 Domain tables

```sql
-- Company records; watchlist flag + geo fields land here.
create table companies (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  name                   text not null,
  domain                 text,                                    -- 'stripe.com'
  headquarters_city      text,
  headquarters_country   text,                                    -- ISO-3166 alpha-2
  office_locations       text[] not null default '{}',
  remote_friendly        boolean,
  size                   text,                                    -- enum: '1-10' | '11-50' | '51-200' | '201-1k' | '1k-5k' | '5k+'
  stage                  text,                                    -- enum: 'bootstrapped' | 'seed' | 'series_a' | 'series_b' | 'series_c_plus' | 'public'
  website                text,
  tech_stack             text[] not null default '{}',
  is_watched             boolean not null default false,
  stance                 text,                                    -- enum: 'watching' | 'target' | 'passive' | 'not_interested'
  interest_level         smallint,                                -- 1..5
  notes_md               text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, domain)                                        -- dedupe per user
);
create index companies_user_watched_idx on companies (user_id, is_watched);

create table contacts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  company_id             uuid references companies(id) on delete set null,
  name                   text not null,
  email                  text,
  phone                  text,
  linkedin_url           text,
  role                   text,                                    -- freeform title
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index contacts_user_company_idx on contacts (user_id, company_id);

create table jobs (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  company_id             uuid references companies(id) on delete set null,
  title                  text not null,
  source_url             text not null,
  location               text,
  remote_type            text,                                    -- enum: 'remote' | 'hybrid' | 'onsite' | 'unknown'
  employment_type        text,                                    -- enum: 'fulltime' | 'contract' | 'parttime' | 'internship' | 'unknown'
  salary_min             integer,
  salary_max             integer,
  salary_currency        text,                                    -- ISO-4217
  description_md         text,                                    -- cleaned JD, markdown
  parsed_meta            jsonb not null default '{}'::jsonb,      -- AI-extracted: skills[], seniority, requirements[], responsibilities[]
  benefits               jsonb not null default '{}'::jsonb,      -- AI-extracted structured benefits (§5.3)
  posted_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, source_url)
);
create index jobs_user_company_idx on jobs (user_id, company_id);

create table applications (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  job_id                 uuid not null references jobs(id) on delete cascade,
  status                 text not null default 'saved',           -- enum below
  source                 text,                                    -- enum: 'linkedin' | 'referral' | 'company_page' | 'job_board' | 'recruiter_inbound' | 'discovery' | 'other'
  referred_by_contact_id uuid references contacts(id) on delete set null,
  interest_level         smallint,                                -- 1..5, defaults to company.interest_level
  applied_at             timestamptz,
  next_action_at         timestamptz,
  priority               smallint not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index applications_user_status_idx on applications (user_id, status);
create index applications_user_next_action_idx on applications (user_id, next_action_at) where next_action_at is not null;

-- application_status enum values:
--   'saved' | 'applied' | 'screen' | 'interview' | 'offer' | 'rejected' | 'withdrawn'

create table application_contacts (
  application_id         uuid not null references applications(id) on delete cascade,
  contact_id             uuid not null references contacts(id) on delete cascade,
  role                   text not null,                           -- enum: 'recruiter' | 'hiring_manager' | 'interviewer' | 'referrer' | 'other'
  created_at             timestamptz not null default now(),
  primary key (application_id, contact_id, role)
);

create table interview_stages (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  application_id         uuid not null references applications(id) on delete cascade,
  kind                   text not null,                           -- enum: 'recruiter_screen' | 'tech_screen' | 'take_home' | 'live_coding' | 'system_design' | 'behavioral' | 'onsite_loop' | 'final' | 'other'
  title                  text,
  scheduled_at           timestamptz,
  duration_minutes       integer,
  location               text,                                    -- 'Zoom' | 'onsite address'
  meeting_url            text,
  status                 text not null default 'scheduled',       -- enum: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' | 'no_show'
  outcome                text,                                    -- enum: 'passed' | 'failed' | 'pending' | 'withdrawn' | null
  prep_notes_md          text,
  debrief_notes_md       text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index interview_stages_app_scheduled_idx on interview_stages (application_id, scheduled_at);

create table activities (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  application_id         uuid not null references applications(id) on delete cascade,
  kind                   text not null,                           -- enum: 'note' | 'status_change' | 'contact_added' | 'stage_added' | 'link' | 'reminder'
  payload                jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);
create index activities_app_created_idx on activities (application_id, created_at desc);
```

### 5.3 `jobs.benefits` shape

Populated by the AI parser at ingest time. Missing fields are `null` (unknown), not `false`.

```typescript
type Benefits = {
  compensation?: {
    min?: number
    max?: number
    currency?: string        // ISO-4217
    equity?: boolean | string
    bonus?: boolean | string
    sign_on?: number
  }
  visa_sponsorship?: boolean | null
  relocation_package?: boolean | null
  remote?: {
    type: 'remote' | 'hybrid' | 'onsite'
    wfh_days_per_week?: number
  }
  insurance?: {
    health?: boolean
    family_covered?: boolean
    dental?: boolean
    vision?: boolean
    life?: boolean
  }
  time_off?: {
    annual_leave_days?: number
    sick_leave?: string
    unlimited?: boolean
  }
  parental_leave?: { weeks?: number; paid?: boolean }
  learning_budget?: number
  four_day_week?: boolean
  equipment_stipend?: boolean
  meal_stipend?: boolean
  gym_stipend?: boolean
  raw_extracted?: string[]   // verbatim benefit strings the AI couldn't slot
}
```

### 5.4 Discovery hooks (empty in v1, populated in v1.5)

```sql
create table user_profile (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references users(id) on delete cascade,
  headline               text,
  summary_md             text,
  career_narrative_md    text,                                    -- free-form context for AI
  skills                 text[] not null default '{}',
  industries             text[] not null default '{}',            -- ['fintech','payments','banking',...]
  role_types             text[] not null default '{}',            -- ['Senior Backend Engineer',...]
  seniority              text,                                    -- enum: 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'manager' | 'director'
  years_experience       integer,
  employment_types       text[] not null default '{}',
  remote_pref            text not null default 'any',             -- enum: 'remote_only' | 'hybrid_ok' | 'onsite_ok' | 'any'
  location_prefs         jsonb not null default '[]'::jsonb,      -- see §5.5
  accept_relocation      boolean not null default false,
  willing_to_relocate_to text[] not null default '{}',            -- ISO-3166 alpha-2 codes
  comp_floor_annual      integer,
  comp_currency          text,
  stack_weights          jsonb not null default '{}'::jsonb,      -- { 'php': 10, 'typescript': 9, ... }
  company_size_weights   jsonb not null default '{}'::jsonb,      -- { '1-10': 8, '11-50': 10, ... }
  benefit_prefs          jsonb not null default '{}'::jsonb,      -- see §5.6
  must_haves             text[] not null default '{}',
  dealbreakers           text[] not null default '{}',
  keywords               text[] not null default '{}',
  updated_at             timestamptz not null default now()
);

create table sources (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  name                   text not null,
  kind                   text not null,                           -- enum: see §7
  config                 jsonb not null default '{}'::jsonb,      -- { company: 'stripe' } | { url: '...' }
  enabled                boolean not null default true,
  last_polled_at         timestamptz,
  last_error             text,
  error_count            integer not null default 0,
  created_at             timestamptz not null default now()
);
create index sources_user_enabled_idx on sources (user_id, enabled);

create table discoveries (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  source_id              uuid not null references sources(id) on delete cascade,
  source_job_id          text not null,                           -- stable id from source
  raw                    jsonb not null,
  normalized             jsonb not null,                          -- {title, company, url, location, ...}
  match_score            smallint,
  benefits_score         smallint,
  match_reasoning        jsonb,                                   -- {strengths[], red_flags[], notes}
  status                 text not null default 'new',             -- enum: 'new' | 'saved' | 'dismissed'
  saved_application_id   uuid references applications(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (source_id, source_job_id)
);
create index discoveries_user_status_score_idx on discoveries (user_id, status, match_score desc);

create table company_discoveries (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  source_id              uuid not null references sources(id) on delete cascade,
  source_company_id      text not null,
  raw                    jsonb not null,
  normalized             jsonb not null,                          -- {name, website, size, stage, industry, ...}
  match_score            smallint,
  match_reasoning        jsonb,
  status                 text not null default 'new',             -- enum: 'new' | 'added' | 'dismissed'
  added_company_id       uuid references companies(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (source_id, source_company_id)
);
create index company_discoveries_user_status_score_idx on company_discoveries (user_id, status, match_score desc);
```

### 5.5 `user_profile.location_prefs` shape

Ordered array. Empty `cities` on a country entry means "any location in that country matches."

```typescript
type LocationPref = {
  country: string          // ISO-3166 alpha-2, e.g. 'AE'
  region?: string          // e.g. 'Kerala' (subnational)
  cities?: string[]        // empty = whole country/region
  priority: 1 | 2 | 3      // 1 = top pref
}[]
```

**Default seed after profile import for this user:**
```json
[
  { "country": "AE", "cities": [], "priority": 1 },
  { "country": "SA", "cities": [], "priority": 1 },
  { "country": "QA", "cities": [], "priority": 1 },
  { "country": "KW", "cities": [], "priority": 1 },
  { "country": "BH", "cities": [], "priority": 2 },
  { "country": "OM", "cities": [], "priority": 2 },
  { "country": "IN", "region": "Kerala", "cities": [], "priority": 1 },
  { "country": "IN", "cities": ["Bengaluru","Hyderabad","Chennai","Mumbai","Pune","NCR"], "priority": 2 }
]
```

### 5.6 `user_profile.benefit_prefs` shape

```typescript
type BenefitPrefs = {
  must_haves: string[]              // e.g. ['visa_sponsorship','family_health_insurance']
  weights: Record<string, number>   // 0–10
}
```

**Default seed for this user:**
```json
{
  "must_haves": [],
  "weights": {
    "visa_sponsorship": 10,
    "family_health_insurance": 9,
    "compensation_meets_floor": 10,
    "remote_or_hybrid": 8,
    "relocation_package": 7,
    "equity": 4,
    "four_day_week": 3
  }
}
```

## 6. Key flows

### 6.1 Add application from JD URL

```
User submits URL on /applications/new
  → server action: createApplicationFromUrl({ url })
    1. env.assert()                                — sanity
    2. ingest.fetchPage(url)                       — {html, finalUrl, statusCode}
         a. ssrf.assertSafe(url)                   — https, no private IPs
         b. native fetch, 5s timeout, 2MB cap, 3 redirects max
         c. cheerio extracts main text
         d. if extracted < 500 chars → Firecrawl fallback
    3. ingest.cleanHtml(html) → markdown-ish text
    4. ai.parseJob(cleanedText)
         → { title, company_name, company_domain?, location,
             remote_type, employment_type, salary?, tech_stack[],
             seniority?, responsibilities[], requirements[], benefits{} }
    5. companies.findOrCreateByDomain(userId, domain, name)
    6. jobs.upsertBySourceUrl(userId, companyId, parsed, cleanedText, benefits)
    7. applications.create(userId, jobId, {status: 'saved', source: 'company_page'})
    8. activities.log(applicationId, 'status_change', {to: 'saved'})
    9. redirect to /applications/[id]
  → on any step failure: return { error: string, fallback: 'manual' }
     which the client uses to redirect to the manual-entry form with any
     successfully-extracted fields pre-filled.
```

### 6.2 Update status

```
User clicks status on kanban or detail page
  → server action: updateStatus({ applicationId, newStatus })
    1. db transaction:
         update applications.status = newStatus, updated_at = now()
         insert activities (kind='status_change', payload={from, to})
    2. if newStatus = 'applied' and applications.applied_at is null:
         update applications.applied_at = now()
  → RSC re-renders affected route via revalidatePath
```

### 6.3 Add interview stage

```
On /applications/[id], user opens "+ Add stage" dialog
  → server action: createInterviewStage(applicationId, data)
    1. insert interview_stages row
    2. if scheduled_at < applications.next_action_at OR next_action_at is null:
         update applications.next_action_at = scheduled_at
    3. insert activities (kind='stage_added', payload={stageId, kind, scheduled_at})
  → revalidatePath
```

### 6.4 Link contact to application

```
On /applications/[id], user opens "+ Add POC" dialog
  → pick existing contact from company OR create new
  → server action: linkContactToApplication({ applicationId, contactId, role })
    1. insert application_contacts row (idempotent via PK)
    2. insert activities (kind='contact_added', payload={contactId, role})
  → revalidatePath
```

### 6.5 Add company to watchlist

```
On /companies, user opens "+ Add company" dialog
  → server action: addWatchedCompany({ name, domain, headquarters_country, ... })
    1. companies.upsertByDomain(userId, {..., is_watched: true, stance: 'watching'})
    2. companies.detectATS(domain) →
         probe boards-api.greenhouse.io/v1/boards/{slug}/jobs (200 = greenhouse)
         probe api.lever.co/v0/postings/{slug} (200 = lever)
         probe api.ashbyhq.com/posting-api/job-board/{slug} (200 = ashby)
       If any hit, insert a `sources` row (enabled=false in v1 — polling is v1.5)
    3. return { company, detectedSource? }
```

ATS detection is best-effort: if no probe returns 200, the company is watched with no source. User can add sources manually on `/settings/sources`.

### 6.6 Profile import

```
On /settings/profile, user provides file paths (CV + PROFILE.md)
  → server action: importProfile({ cvPath?, profileMdPath? })
    1. read files from local filesystem
       (v1 assumes user runs locally; when deployed, replaced with file upload)
    2. ai.parseProfile({ cvText?, profileMd? })
       → structured user_profile fields
    3. upsert user_profile row
    4. return parsed fields for user to review + edit
```

Because Vercel Functions have no persistent filesystem access to a user's machine, in the deployed environment this flow uses a file upload (`multipart/form-data`) instead of path-based read. Both code paths call the same `ai.parseProfile` internally. **v1 ships both paths** with the upload as default and path-based available for local dev.

### 6.7 Reminders cron

```
Daily 08:00 UTC (configurable): Vercel Cron → GET /api/cron/reminders
  → handler:
    1. verify request has `Authorization: Bearer $CRON_SECRET`
    2. query: applications where next_action_at <= now() and status not in ('rejected','withdrawn')
    3. for each: insert activities (kind='reminder', payload={reason})
    4. return { checked: n, reminders_added: m }
  → user sees reminders on dashboard "Needs attention" widget
```

## 7. Regional source catalog (referenced in v1 schema, adapters land in v1.5)

`sources.kind` enum values reserved in v1 (values are strings, not a strict enum type, so v1.5 can add without migration — but documented up front for planning):

**Global ATS APIs (Tier A — official public JSON):**
- `greenhouse` — `boards-api.greenhouse.io/v1/boards/{company}/jobs`
- `lever` — `api.lever.co/v0/postings/{company}`
- `ashby` — `api.ashbyhq.com/posting-api/job-board/{company}`
- `workable` — `apply.workable.com/api/v3/accounts/{company}/jobs`

**Global open feeds:**
- `remoteok` (Tier A) — `remoteok.com/api`
- `hn_whoishiring` (Tier B) — HN Firebase API + LLM extract per monthly thread
- `rss` (Tier B) — generic RSS parser
- `jsonld` (Tier C) — generic JSON-LD `JobPosting` extractor for a URL
- `adzuna` (Tier A) — official API, free 250/mo

**GCC / MENA:**
- `bayt` (Tier B) — RSS per keyword/country
- `gulftalent` (Tier B) — JSON-LD on listings
- `naukrigulf` (Tier C) — JSON-LD only, no scraping
- `wamda_directory` (Tier C, companies) — MENA startup profiles via JSON-LD
- `magnitt_directory` (Tier B, companies) — limited free API

**India / Kerala:**
- `naukri_rss` (Tier B) — RSS per keyword/location
- `instahyre` (Tier B) — RSS for startup jobs
- `cutshort` (Tier C) — JSON-LD, startup-focused
- `foundit_rss` (Tier B) — RSS
- `yourstory_directory` (Tier C, companies) — Indian startup profiles
- `inc42_directory` (Tier C, companies) — Indian startup profiles
- `ksum_directory` (Tier C, companies) — Kerala Startup Mission registry
- `kerala_park_directory` (Tier C, companies) — Technopark/Infopark tenant lists

**Companies (broader):**
- `yc_directory` — YC company JSON
- `github_trending` — GitHub API + heuristic
- `product_hunt` — public GraphQL API
- `hn_companies` — extracted from Who's Hiring
- `levelsfyi` — public company index

**Tier policy:**
- **A:** Official public JSON API. Preferred.
- **B:** Public RSS / sitemap / documented feed. Acceptable.
- **C:** Structured data (JSON-LD, schema.org) embedded in HTML. Acceptable *only* if the site publishes structured markup — no fragile HTML scraping.
- **D (prohibited):** HTML scraping without structured markup. Not built in any sub-project.

v1 hardcodes no adapters. v1.5 builds them.

## 8. Matching rules (v1.5 preview — informs v1 schema)

### 8.1 AI scoring prompt (job discovery)

Given a `Job` and `UserProfile`, the AI returns:

```typescript
type MatchResult = {
  match_score: number          // 0..100
  strengths: string[]
  red_flags: string[]
  reasoning: string            // one paragraph
  location_match: 'priority_1' | 'priority_2' | 'priority_3' | 'remote' | 'mismatch'
  seniority_match: 'match' | 'stretch_up' | 'stretch_down' | 'mismatch'
  stack_overlap: string[]      // profile.skills ∩ jd.tech_stack
  stack_gaps: string[]         // jd.requirements ∖ profile.skills
  industry_match: 'strong' | 'adjacent' | 'weak' | 'mismatch'
}
```

Prompt-encoded rules the AI must follow:
- Fintech/payments/banking/regtech industry match: **+15 boost**
- Startup (size ≤ 50) with strong stack match: **no small-company penalty**
- Rate stack overlap by profile.stack_weights, not just presence
- Explicit reasoning is required — no bare score

### 8.2 Deterministic caps (enforced in code, not prompt)

```typescript
function applyCaps(raw: MatchResult, profile: UserProfile, job: Job): number {
  let score = raw.match_score

  // Location cap
  if (raw.location_match === 'mismatch'
      && job.remote_type !== 'remote'
      && !profile.accept_relocation) {
    score = Math.min(score, 30)
  }

  // Seniority cap
  if (raw.seniority_match === 'stretch_down') {
    score = Math.min(score, 40)
  }

  // Must-have benefits (if profile.benefit_prefs.must_haves is non-empty)
  const missingMustHave = profile.benefit_prefs.must_haves.some(
    key => !hasBenefit(job.benefits, key)
  )
  if (missingMustHave) {
    score = Math.min(score, 25)
  }

  return score
}
```

### 8.3 Benefits score

Independent 0–100 score computed deterministically from `job.benefits` and `profile.benefit_prefs.weights`:

```typescript
function benefitsScore(benefits: Benefits, weights: Record<string, number>): number {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  const earned = Object.entries(weights).reduce((sum, [key, w]) => {
    return hasBenefit(benefits, key) ? sum + w : sum
  }, 0)
  return Math.round((earned / totalWeight) * 100)
}
```

`hasBenefit` maps preference keys to benefit-object checks (e.g. `'visa_sponsorship'` → `benefits.visa_sponsorship === true`, `'family_health_insurance'` → `benefits.insurance?.family_covered === true`).

### 8.4 Combined sort (default)

```
combined_score = 0.6 × match_score + 0.4 × benefits_score
```

Discovery inbox sort options: **combined** (default), match only, benefits only, comp, posted_at.

## 9. Auth and security

### 9.1 Auth model

- Auth.js v5 with Google provider
- `NEXTAUTH_URL` and `AUTH_SECRET` set per environment
- Google OAuth client scoped to `email profile` only in v1 (Gmail/Calendar scopes come in v3)
- **Single-user gate:** in `auth.config.ts`, the `signIn` callback rejects any email not equal to `env.ALLOWED_EMAIL`
- When we open signup later: remove the gate, add a proper `waitlist` or `invites` table, and (recommended) enable Postgres RLS

### 9.2 Secrets

All secrets in Vercel env vars. Nothing in the repo. `.env.example` documents required keys. `.env.local` is gitignored.

Required env vars (validated at startup by `lib/env/schema.ts`):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `AUTH_SECRET` | Auth.js session encryption |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `NEXTAUTH_URL` | Full origin (e.g. `https://employ.vercel.app`) |
| `ALLOWED_EMAIL` | The one email allowed to sign in |
| `AI_PROVIDER` | `gemini` (default) \| `anthropic` \| `openai` |
| `GEMINI_API_KEY` | Required if `AI_PROVIDER=gemini` |
| `ANTHROPIC_API_KEY` | Optional |
| `OPENAI_API_KEY` | Optional |
| `FIRECRAWL_API_KEY` | Optional, only used as fallback |
| `CRON_SECRET` | Random string; Vercel Cron sends as bearer token |

The env schema uses Zod's `superRefine` to check "if `AI_PROVIDER=gemini` then `GEMINI_API_KEY` must be set" etc.

### 9.3 JD fetch safety (SSRF)

`lib/ingest/ssrf.ts` enforces before every outbound fetch:
- Scheme must be `https:` (rejects `http:`, `file:`, `gopher:`, etc.)
- Resolve hostname → reject if any resolved IP is in RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.0/8`), link-local (`169.254.0.0/16`), or Cloud metadata (`169.254.169.254`)
- Follow max 3 redirects, re-checking the SSRF rule at every hop
- 5s connect timeout, 10s total; 2 MB response cap; abort otherwise
- Store the extracted markdown, never the raw HTML

### 9.4 Other

- CSRF handled by Auth.js + Next.js server actions natively
- Every `lib/db/queries/*.ts` takes `userId` as the first parameter and includes it in `WHERE`; enforced by convention + integration tests
- Rate limit AI calls at the app layer: a 60s sliding-window bucket per (user, kind) capped at 10/min — protects the free tier
- All AI calls logged to `ai_call_logs` (id, user_id, provider, kind, prompt_tokens, completion_tokens, latency_ms, status, error?, created_at) — enables burn-rate visibility from day one
- `robots.txt` respected in ingest: check root robots on unknown domains, skip fetch if disallowed

## 10. Testing strategy

### 10.1 Layers and targets

| Layer | Framework | Target coverage | What lives here |
|---|---|---|---|
| Unit | Vitest | 90%+ on `lib/` | Pure functions, service logic, ingest cleaners, AI provider (with fixtures), profile importer, matching-cap logic |
| Integration | Vitest + Neon test branch | Every `lib/db/queries/*.ts` and every service function | DB queries against real Postgres, service functions end-to-end |
| Component | Vitest + React Testing Library | Interactive client components | Kanban interactions, forms, dialogs |
| E2E | Playwright | Golden path + one error path per major flow | Sign in → paste URL → app appears → change status → add stage |

Overall coverage target: **80%**.

### 10.2 AI testing

The AI provider is tested with **recorded fixtures**:
- One canonical set of JDs (5–10) stored under `tests/fixtures/jds/`
- A dev-only script `pnpm test:record-ai` calls the real provider and writes JSON responses to `tests/fixtures/ai/`
- Unit tests replay fixtures via a `FixtureAIProvider` — no network in CI
- Anthropic/OpenAI implementations added later must pass the same fixture-conformance tests

### 10.3 Test data

- `tests/factories/` — small factories for each entity (`makeUser`, `makeJob`, `makeApplication`)
- Integration tests use `beforeEach` transaction rollback for isolation
- E2E tests seed a dedicated test user + a set of applications via `pnpm db:seed:e2e`

### 10.4 CI matrix

GitHub Actions:
1. `lint` — ESLint + `tsc --noEmit`
2. `unit` — Vitest without DB
3. `integration` — Vitest with a Neon ephemeral branch spun up per run
4. `e2e` — Playwright against `next start` with the E2E seed
5. `build` — `next build` produces a deployable output

Every PR must pass 1–5. `main` triggers Vercel deploy.

## 11. Deployment and ops

### 11.1 Environments

- **Production:** `main` branch → Vercel prod → Neon `main` branch
- **Preview:** every PR → Vercel preview deployment → Neon ephemeral branch (via Neon-Vercel integration)
- **Local:** `pnpm dev` → local Postgres (Docker) OR a Neon dev branch

### 11.2 Migrations

- `pnpm db:generate` — `drizzle-kit generate` from `lib/db/schema.ts`
- `pnpm db:migrate` — apply pending migrations
- Vercel build step runs `pnpm db:migrate` against the target branch before `next build`
- Migrations are additive-only; destructive changes require a dedicated PR with data-migration steps

### 11.3 Cron

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "0 8 * * *" },
    { "path": "/api/cron/discover",  "schedule": "0 */6 * * *" }
  ]
}
```
Both endpoints exist in v1; `discover` returns 200 no-op until v1.5.

### 11.4 Observability

- Vercel Logs for runtime
- `ai_call_logs` table for AI cost/latency
- `lib/logger` is a structured JSON console logger (fields: `ts, level, event, ...rest`); Vercel captures stdout
- Health check at `GET /api/health` returns `{ ok: true, db: 'up' | 'down' }`

### 11.5 Backups

- Neon PITR (7 days on free tier)
- Weekly manual `pg_dump` via a documented one-liner in `README.md` (belt-and-braces)

## 12. UI conventions

- shadcn/ui components, Tailwind for spacing/layout
- Mobile-responsive by default (Tailwind breakpoints)
- Dark mode via `next-themes` (system default)
- All forms use react-hook-form + Zod schemas shared with server actions
- Toast notifications via shadcn `sonner`
- Loading states via `<Suspense>` and `loading.tsx` per route segment
- Error boundaries via `error.tsx` per route segment
- No custom fonts in v1 (system UI stack)

## 13. File-tree sketch

```
employ/
├── app/
│   ├── (authed)/
│   │   ├── layout.tsx                    — sidebar shell + session guard
│   │   ├── page.tsx                      — dashboard: kanban + digest widget
│   │   ├── applications/
│   │   │   ├── page.tsx                  — list/table view
│   │   │   ├── new/page.tsx              — paste URL + manual form
│   │   │   └── [id]/page.tsx             — detail + timeline + stages + POCs
│   │   ├── companies/
│   │   │   ├── page.tsx                  — watchlist
│   │   │   └── [id]/page.tsx             — company detail
│   │   ├── contacts/page.tsx
│   │   ├── settings/
│   │   │   ├── profile/page.tsx
│   │   │   └── sources/page.tsx
│   │   └── digest/page.tsx
│   ├── (auth)/
│   │   └── signin/page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── cron/reminders/route.ts
│   │   ├── cron/discover/route.ts        — stub, returns 200
│   │   └── health/route.ts
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── env/schema.ts
│   ├── logger/index.ts
│   ├── auth/
│   │   ├── config.ts
│   │   └── allowed-email.ts
│   ├── db/
│   │   ├── client.ts
│   │   ├── schema.ts
│   │   ├── migrations/
│   │   └── queries/
│   │       ├── applications.ts
│   │       ├── jobs.ts
│   │       ├── companies.ts
│   │       ├── contacts.ts
│   │       ├── stages.ts
│   │       ├── activities.ts
│   │       └── profile.ts
│   ├── applications/service.ts
│   ├── jobs/service.ts
│   ├── companies/
│   │   ├── service.ts
│   │   └── ats-detect.ts
│   ├── contacts/service.ts
│   ├── stages/service.ts
│   ├── activities/service.ts
│   ├── profile/
│   │   ├── service.ts
│   │   └── importer.ts
│   ├── ingest/
│   │   ├── fetch.ts
│   │   ├── html-clean.ts
│   │   ├── ssrf.ts
│   │   └── firecrawl.ts
│   └── ai/
│       ├── types.ts
│       ├── index.ts                      — provider factory
│       ├── gemini.ts
│       ├── rate-limit.ts
│       ├── prompts/
│       │   ├── parse-job.ts
│       │   └── parse-profile.ts
│       └── fixtures.ts                   — FixtureAIProvider for tests
├── components/                           — shadcn/ui + app-specific
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── factories/
│   └── fixtures/
├── drizzle.config.ts
├── next.config.js
├── vercel.json
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Gemini free tier changes / rate-limit tightens | AIProvider interface — Anthropic/OpenAI is a one-file swap; `ai_call_logs` gives early warning |
| Vercel free tier limits (function invocations, bandwidth) | Personal use is nowhere near limits; monitor via Vercel dashboard |
| Neon free tier limits (0.5 GB storage) | Personal-use JD text is small; each app ~5–20 KB. Room for 25k+ jobs |
| JD sites block/throttle server IP | Firecrawl fallback; `robots.txt` respected; per-domain rate limit in `ingest.fetch` |
| Auth.js breaking changes between v5 betas | Pin exact version, upgrade deliberately |
| Schema needs a destructive migration later | Prevented by design: all tables carry `user_id` from day one; nullable/optional columns preferred; v1.5 tables stubbed now |
| AI extracts wrong fields | Structured JSON schema output; validation with Zod on the receive side; user reviews on `/applications/[id]` and can correct |
| Data loss on Neon | 7-day PITR; weekly `pg_dump` |

## 15. Open questions (resolved during brainstorming — noted for future reference)

- **Q: Multi-user from day one?** — No. Single-user gate; schema is multi-tenant-ready.
- **Q: Which AI provider?** — Gemini 2.5 Flash (free tier); provider hidden behind interface.
- **Q: LinkedIn/job-board scraping?** — No. Manual paste + AI assist; ATS APIs and RSS only for discovery in v1.5.
- **Q: When does discovery ship?** — Sub-project 1.5, schema hooks in v1.
- **Q: Regional focus?** — GCC (AE, SA, QA, KW, BH, OM) + India (Kerala + metros) as priority 1/2 in profile seed.
- **Q: Sort by benefits?** — Yes; `jobs.benefits` in v1 schema, deterministic `benefits_score`, combined sort default.

## 16. What "done" looks like for v1

A demo of these six flows on the deployed Vercel URL, with real data:
1. Sign in with Google (allowed email only)
2. Import profile from a PROFILE.md / CV file
3. Paste a real JD URL, watch it get parsed into an application
4. Change status from Saved → Applied on the kanban
5. Add an interview stage with a Zoom link and a prep note
6. Add a company to the watchlist, see ATS auto-detected (or not)

Coverage report ≥ 80% overall. CI green. Zero secrets in the repo.
