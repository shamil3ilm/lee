# lee — v1.5 Discovery Design Spec

**Date:** 2026-09-15
**Status:** Approved — ready for implementation planning
**Scope:** Sub-project 1.5 of 5 in the lee roadmap
**Depends on:** v1 Core Tracker (shipped)

---

## 1. Overview

v1.5 adds automated job and company discovery from legitimate sources (public ATS JSON APIs, RSS feeds, structured JSON-LD, and free API tiers). No fragile HTML scraping. Every discovered item is scored against the user's profile by the AI, then presented in an inbox sorted by combined match + benefits score. One click promotes to the pipeline; one click dismisses forever.

The v1 schema already has the tables (`sources`, `discoveries`, `company_discoveries`) — v1.5 fills them.

## 2. Goals and non-goals

### In scope
- Adapter interface — one contract, many implementations
- 6 adapter kinds: `greenhouse`, `lever`, `ashby`, `workable`, `remoteok`, `hn_whoishiring`
- 2 generic adapters: `rss` (config-driven feed URL) and `jsonld` (config-driven page URL)
- 1 company-source adapter: `yc_directory`
- Polling cron (`/api/cron/discover`) — one daily run within Vercel Hobby limits
- AI matcher — job scoring + company scoring using existing `AIProvider` interface
- Deterministic scoring caps (location/seniority/must-haves) applied post-AI
- Discovery inbox UI (`/discoveries`) — jobs and companies tabs, filters, one-click save/dismiss
- Source management UI (`/settings/sources`) — add/remove/enable/disable, error state visibility
- One-click promote → creates jobs/applications or company via existing service layer

### Out of scope (deferred)
- Regional adapters that need JSON-LD-only pages (Bayt, GulfTalent, Naukri, Cutshort, KSUM directory) — v1.6 polish pass. Users can add these as `rss` or `jsonld` generic sources today if they publish structured markup.
- Adzuna — deferred; free tier is 250/mo, low ROI vs ATS adapters
- Firecrawl-based scraping — not v1.5 (violates our "no fragile scraping" principle)
- Real-time discovery notifications — email/push arrives with v3

## 3. Architecture

### 3.1 Adapter interface

```typescript
// lib/discovery/adapters/types.ts

export interface DiscoveryItem {
  sourceItemId: string           // stable id from source
  raw: unknown                   // full source payload
  normalized: NormalizedJob | NormalizedCompany
}

export interface NormalizedJob {
  kind: 'job'
  title: string
  companyName: string
  companyDomain?: string
  companyWebsite?: string
  location?: string
  remoteType?: 'remote' | 'hybrid' | 'onsite' | 'unknown'
  employmentType?: 'fulltime' | 'contract' | 'parttime' | 'internship' | 'unknown'
  descriptionMd: string
  applyUrl: string
  postedAt?: Date
  techStack: string[]
  salary?: { min?: number; max?: number; currency?: string }
  raw: unknown
}

export interface NormalizedCompany {
  kind: 'company'
  name: string
  domain?: string
  website?: string
  description?: string
  industry?: string[]
  size?: string
  stage?: string
  hqCountry?: string
  hqCity?: string
  officeLocations?: string[]
  techStack?: string[]
  fundingUsd?: number
  raw: unknown
}

export interface DiscoveryAdapter {
  kind: string                                 // matches sources.kind
  fetch(config: unknown): Promise<DiscoveryItem[]>
}
```

### 3.2 Adapter registry

```typescript
// lib/discovery/adapters/index.ts

const registry: Record<string, DiscoveryAdapter> = {
  greenhouse: new GreenhouseAdapter(),
  lever: new LeverAdapter(),
  ashby: new AshbyAdapter(),
  workable: new WorkableAdapter(),
  remoteok: new RemoteOkAdapter(),
  hn_whoishiring: new HnWhoIsHiringAdapter(),
  rss: new RssAdapter(),
  jsonld: new JsonLdAdapter(),
  yc_directory: new YcDirectoryAdapter(),
}

export function getAdapter(kind: string): DiscoveryAdapter | null {
  return registry[kind] ?? null
}
```

Every adapter is testable in isolation with `vi.mock` on `fetch`. Fixtures under `tests/fixtures/discovery/<kind>.json`.

### 3.3 Cron flow

```
GET /api/cron/discover  (Vercel Cron, once daily)
  → verify CRON_SECRET
  → for each enabled source (all users):
      try adapter.fetch(source.config)
      for each item:
        upsert into discoveries / company_discoveries (unique by source_id + source_item_id)
        if new (freshly inserted, matchScore null):
          score via AI matcher
          apply deterministic caps
          update discovery row
      update source.lastPolledAt, clear last_error / error_count
    catch:
      set source.lastError = message, source.errorCount++
      continue (never abort the whole run on one source failure)
  → return { sources_polled, new_discoveries, errors }
```

Constraints:
- 10s Vercel function timeout — process sources in parallel via `Promise.allSettled` with concurrency limit of 4 to avoid free-tier rate limits on Gemini
- AI scoring batched: send 5 items per call to reduce token overhead (structured JSON schema output; deterministic caps still applied per-item post-response)
- If a source's `error_count >= 5`, skip it and require manual re-enable

### 3.4 AI matcher

Extend `AIProvider` interface:

```typescript
interface AIProvider {
  parseJob(text: string): Promise<ParsedJob>
  parseProfile(input: {...}): Promise<ParsedProfile>
  scoreJob(job: NormalizedJob, profile: UserProfile): Promise<JobMatchResult>       // NEW
  scoreCompany(company: NormalizedCompany, profile: UserProfile): Promise<CompanyMatchResult>  // NEW
}

interface JobMatchResult {
  match_score: number          // 0-100 (before caps)
  strengths: string[]
  red_flags: string[]
  reasoning: string
  location_match: 'priority_1' | 'priority_2' | 'remote' | 'mismatch'
  seniority_match: 'match' | 'stretch_up' | 'stretch_down' | 'mismatch'
  stack_overlap: string[]
  stack_gaps: string[]
  industry_match: 'strong' | 'adjacent' | 'weak' | 'mismatch'
}

interface CompanyMatchResult {
  match_score: number
  strengths: string[]
  red_flags: string[]
  reasoning: string
  industry_match: 'strong' | 'adjacent' | 'weak' | 'mismatch'
  size_match: 'match' | 'small' | 'large'
}
```

Prompts live in `lib/ai/prompts/score-job.ts`, `lib/ai/prompts/score-company.ts`.

`lib/discovery/scoring.ts` wraps AI call + applies deterministic caps (spec v1 §8.2) + computes `benefits_score` (spec v1 §8.3).

### 3.5 Data model deltas

No new tables. Existing v1 tables:
- `sources` — now actively used
- `discoveries` — populated by cron
- `company_discoveries` — populated by cron

No migrations needed for v1.5.

## 4. UI

### `/discoveries` — inbox
- Tabs: **Jobs** (default) | **Companies**
- Filters row: match score (slider 0-100), location (countries multi-select from `user_profile.location_prefs`), source (multi-select), status (new | dismissed — saved hidden by default)
- Sort options: combined (default) | match | benefits | posted (newest)
- Each row (job): title · company (badge) · location · match_score badge · benefits_score badge · source badge · one-click **Save** button → creates Job + Application via existing service · **Dismiss** button
- Each row (company): name · domain · size/stage badges · match_score · reasoning excerpt · **Add to watchlist** → uses `addWatchedCompany` (also auto-detects ATS as usual) · **Dismiss**
- Row expand: shows full reasoning, strengths, red_flags, stack gaps
- Empty state: "No new discoveries. Add sources at Settings → Sources."

### `/settings/sources` — source management
- Table of sources: name · kind · config summary · enabled toggle · last_polled_at · error state (icon + tooltip with `last_error`) · row menu (edit / delete)
- **+ Add Source** dialog:
  - Kind dropdown → shows only relevant config fields
  - `greenhouse`/`lever`/`ashby`/`workable`: single field `company` (slug)
  - `remoteok`: no config, just enable
  - `hn_whoishiring`: no config
  - `rss`: `url` field
  - `jsonld`: `url` field (single URL) or `urls` field (bulk paste, newline-separated)
  - `yc_directory`: no config
- Seed suggestion when user has 0 sources: chips of "popular starter" configs — clicking populates the dialog

### Dashboard
- Add third row: **Fresh discoveries (last 24h)** — top 5 highest match score, mini row layout, link to `/discoveries` for full list

### Sidebar
- Add "Discovery" nav item between "Applications" and "Companies" — points to `/discoveries` (badge shows unread count)

## 5. Vercel cron

Update `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "0 8 * * *" },
    { "path": "/api/cron/discover",  "schedule": "0 9 * * *" }
  ]
}
```
Two crons, both daily — fits Hobby tier (2 crons max, daily minimum).

## 6. Testing

- Unit test each adapter with a stubbed HTTP response fixture (record real responses once via `pnpm test:record-discovery`, replay in CI)
- Unit test `scoring.applyCaps` — deterministic logic
- Integration test `runDiscoveryCycle(userId)` — end-to-end with FixtureAIProvider, mock adapters, verify discoveries persisted
- Component test the discovery inbox filter/sort — later polish, skip for MVP

## 7. Success criteria for v1.5
- User adds a Greenhouse source (e.g. `stripe`) → polls next cycle → discoveries appear scored
- One-click Save creates an application in the pipeline
- Dismissed items never reappear even after re-poll
- Full discovery cycle for 10 sources completes in <30 seconds
- 80%+ test coverage on `lib/discovery/*`
