# Employ v1.5 Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Ship v1.5 Discovery — 9 adapters, polling cron, AI matcher with caps, inbox UI, source management UI.

**Spec:** `docs/superpowers/specs/2026-09-15-employ-v1_5-discovery-design.md`
**Depends on:** v1 Core Tracker shipped and live at https://employ4me.vercel.app

**Working dir:** `employ`

---

## Phase D1 — Adapter framework + first ATS adapter (Greenhouse)

**Files:**
- Create: `lib/discovery/adapters/types.ts`, `lib/discovery/adapters/greenhouse.ts`, `lib/discovery/adapters/index.ts`
- Test: `tests/unit/discovery-greenhouse.test.ts`, `tests/fixtures/discovery/greenhouse.json`

- [ ] **Step 1** — Types file per spec §3.1 (DiscoveryItem, NormalizedJob, NormalizedCompany, DiscoveryAdapter).
- [ ] **Step 2** — Fixture: capture one live Greenhouse response by running `curl "https://boards-api.greenhouse.io/v1/boards/stripe/jobs" | head -c 100000 > tests/fixtures/discovery/greenhouse.json` (do this via Bash; if fetch blocked, hand-craft a minimal valid response with 3 jobs).
- [ ] **Step 3** — Write failing test that mocks fetch to return the fixture and asserts `.fetch({company:'stripe'})` returns array of NormalizedJob with correct fields.
- [ ] **Step 4** — Implement `GreenhouseAdapter`:
```ts
export class GreenhouseAdapter implements DiscoveryAdapter {
  readonly kind = 'greenhouse'
  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { company } = z.object({ company: z.string() }).parse(config)
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${company}/jobs`)
    if (!res.ok) throw new Error(`greenhouse ${res.status}`)
    const { jobs } = await res.json()
    return jobs.map(j => ({
      sourceItemId: String(j.id),
      raw: j,
      normalized: {
        kind: 'job',
        title: j.title,
        companyName: company,
        location: j.location?.name,
        applyUrl: j.absolute_url,
        descriptionMd: '',  // fetch per-job description in a follow-up if needed
        techStack: [],
        postedAt: j.updated_at ? new Date(j.updated_at) : undefined,
        raw: j,
      } as NormalizedJob,
    }))
  }
}
```
- [ ] **Step 5** — Registry in `adapters/index.ts` with `getAdapter(kind)`.
- [ ] **Step 6** — Test passes → commit: `feat(discovery): adapter framework + greenhouse`.

## Phase D2 — Remaining ATS adapters (Lever, Ashby, Workable)

Same pattern as D1 for each. URLs:
- Lever: `https://api.lever.co/v0/postings/{company}?mode=json`
- Ashby: `https://api.ashbyhq.com/posting-api/job-board/{company}`
- Workable: `https://apply.workable.com/api/v3/accounts/{company}/jobs`

Response shapes differ — hand-craft minimal fixture per adapter with 2 jobs. Test each. One commit per adapter or one bundled commit `feat(discovery): lever/ashby/workable adapters`.

## Phase D3 — Feed adapters (RemoteOK, HN Who's Hiring, RSS, JSON-LD)

**RemoteOK:** `https://remoteok.com/api` — array of jobs, first element is metadata, filter it out.

**HN Who's Hiring:** query `https://hn.algolia.com/api/v1/search?tags=story&query=Ask+HN+Who+is+hiring&hitsPerPage=1` to find latest thread ID, then `https://hacker-news.firebaseio.com/v0/item/{id}.json` to get kids (comment IDs), then per-comment `.json` for text. Cap at 200 comments per run.

**RSS adapter:** takes `{ url }`. Uses `fast-xml-parser` (install as dep) to parse feed. Each `<item>` → NormalizedJob with title from `<title>`, url from `<link>`, description from `<description>`.

**JSON-LD adapter:** takes `{ url }` or `{ urls[] }`. Fetches HTML, uses cheerio to find `<script type="application/ld+json">`, parses each script tag, filters for `@type === 'JobPosting'`. Maps schema.org JobPosting to NormalizedJob.

Fixtures per adapter. Tests per adapter. Commit: `feat(discovery): remoteok/hn/rss/jsonld adapters`.

## Phase D4 — Company adapter (YC directory)

**YC directory:** `https://www.ycombinator.com/api/companies` (undocumented but public JSON). Filter for `type='hiring'` where possible or just take all. Each company → NormalizedCompany.

Fixture (hand-crafted). Test. Commit: `feat(discovery): yc directory company adapter`.

## Phase D5 — Discovery service + scoring

**Files:**
- Create: `lib/discovery/service.ts`, `lib/discovery/scoring.ts`
- Extend: `lib/ai/types.ts`, `lib/ai/gemini.ts`, `lib/ai/fixtures.ts`, `lib/ai/prompts/score-job.ts`, `lib/ai/prompts/score-company.ts`
- Test: `tests/integration/discovery-service.test.ts`, `tests/unit/discovery-scoring.test.ts`

- [ ] `AIProvider.scoreJob` and `AIProvider.scoreCompany` interface additions
- [ ] Gemini impl for both — use JSON schema output
- [ ] FixtureAIProvider stub impls
- [ ] `scoring.ts` with `applyCaps(rawResult, job, profile) → finalScore` and `benefitsScore(benefits, weights) → number` per spec v1 §8
- [ ] `service.ts` with:
  - `runDiscoveryCycleForUser(userId)` — iterates enabled sources, calls adapter, upserts discoveries, scores new ones
  - `promoteJobDiscovery(userId, discoveryId)` — creates Job + Application via v1 services
  - `promoteCompanyDiscovery(userId, discoveryId)` — creates Company via `addWatchedCompany`
  - `dismissDiscovery(userId, discoveryId)` / `dismissCompanyDiscovery(...)`
- [ ] Integration test seeds a user + profile + one mock source, runs a cycle, asserts discoveries + scores populated

Commit: `feat(discovery): service + scoring with deterministic caps`

## Phase D6 — Cron endpoint

**Files:**
- Modify: `app/api/cron/discover/route.ts` (currently a no-op stub)
- Modify: `vercel.json` — add `/api/cron/discover` at `0 9 * * *`

- [ ] Route calls `runDiscoveryCycleForUser` for every user (in v1 single-user, still iterate)
- [ ] Wrap each source in try/catch; failures bump `error_count`
- [ ] Return `{ users, sources_polled, new_discoveries, errors }`

Commit: `feat(cron): activate discover endpoint + vercel schedule`

## Phase D7 — Discovery inbox UI (`/discoveries`)

**Files:**
- Create: `app/(authed)/discoveries/page.tsx`, `app/(authed)/discoveries/actions.ts`, `components/discovery-inbox.tsx`, `components/discovery-row.tsx`, `components/discovery-filters.tsx`
- Modify: `components/sidebar.tsx` to add "Discovery" nav entry with unread count badge (query on load)

- [ ] Tabs: Jobs (default), Companies
- [ ] Filters row: min match score slider, country multi-select, source multi-select, status toggle (new/dismissed)
- [ ] Sort dropdown: combined (default), match, benefits, posted
- [ ] Row shows title/company/location/scores/source badges + expand for reasoning
- [ ] Actions: Save (server action → promote) / Dismiss (server action → status='dismissed')
- [ ] Empty state with CTA to Settings → Sources

Commit: `feat(ui): discovery inbox`

## Phase D8 — Source management UI (`/settings/sources`)

**Files:**
- Create: `app/(authed)/settings/sources/page.tsx`, `actions.ts`, `components/add-source-dialog.tsx`, `components/source-row.tsx`
- Modify: `components/sidebar.tsx` if settings nav needs a Sources entry (or link from profile page)

- [ ] Table of sources with edit/delete/toggle-enabled
- [ ] Dialog for adding new source — kind picker, conditional config fields
- [ ] Show `last_polled_at`, `last_error` with hover tooltip, `error_count`
- [ ] "Popular starters" chips when zero sources

Commit: `feat(ui): source management`

## Phase D9 — Dashboard integration

**Files:**
- Modify: `app/(authed)/page.tsx`
- Create: `components/fresh-discoveries.tsx`

- [ ] Widget below "Needs Attention" showing top 5 discoveries from last 24h
- [ ] Compact row layout; click through to `/discoveries`

Commit: `feat(ui): fresh discoveries dashboard widget`

## Verification

- `pnpm typecheck` clean
- `pnpm test` — 130+ tests (105 existing + ~25 new across adapters + service + scoring)
- `pnpm build` succeeds
- Manual smoke test after deploy: add a Greenhouse source (`stripe`), wait for or manually trigger `/api/cron/discover?secret=$CRON_SECRET`, check `/discoveries` for results

## Push cadence

Per-phase commits. Push at end of each phase. Vercel redeploys each push automatically.
