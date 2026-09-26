# lee — v2 CV & Documents Design Spec

**Date:** 2026-09-16
**Status:** Approved — ready for implementation planning
**Scope:** Sub-project 2 of 5 in the lee roadmap
**Depends on:** v1 Core Tracker + v1.5 Discovery (both shipped)

---

## 1. Overview

v2 adds document generation: a master CV as structured JSON (source of truth), AI-tailored CV variants per application, cover letter generator, and PDF export. Every document is version-controlled and linked to the application it was made for.

Also folds in **GitHub portfolio sync** — pull public repos to enrich the master CV with concrete OSS/side-project bullets.

## 2. Goals and non-goals

### In scope
- Master CV data model — structured JSON stored on `user_profile` (extending the existing row), editable via `/settings/cv`
- Import master CV from existing profile fields + optional GitHub public repo sync
- Tailored CV generation: given `applicationId`, AI produces a variant highlighting relevant experience against the job's `parsedMeta.requirements`, `techStack`, `industry`
- Cover letter generator: given `applicationId`, AI drafts a role-specific cover letter using master CV + job
- PDF export via `@react-pdf/renderer` — one clean single-column template for v2
- Document library per application: list all generated docs, download, regenerate, delete
- Master CV export (PDF, no tailoring) for baseline versions
- GitHub sync (optional): given a GitHub username, fetch public repos + languages + descriptions, distill into "notable projects" bullets

### Explicitly out of scope
- DOCX export (PDF only in v2)
- Multiple CV templates / styling choices (single template)
- LaTeX or ATS-optimized parsing pass (single template is ATS-friendly by default: no columns, no images, standard fonts)
- Real-time collaborative editing (single-user)
- Storing PDFs in blob storage (generated on-demand from JSON; if needed, cached in DB as bytea)
- Cover letter templates library (AI drafts from scratch each time; user can save "favorite" phrasings later — v2.1)
- LinkedIn profile sync (v4 territory)

### Success criteria
- One-click "Generate tailored CV" on any application → PDF downloads in <10 seconds
- Master CV editable in a dedicated UI, changes reflect in future tailored variants
- Generated docs listed per application with version + timestamp
- GitHub sync pulls top 10 public repos and generates 3-5 project bullets

## 3. Data model

### 3.1 New tables

```sql
create table documents (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  application_id         uuid references applications(id) on delete set null,     -- nullable: master CV has no app
  kind                   text not null,                        -- enum: 'master_cv' | 'tailored_cv' | 'cover_letter'
  version                integer not null default 1,
  title                  text not null,                        -- e.g. "CV for Senior BE @ Stripe"
  content                jsonb not null,                       -- structured CV JSON (§3.2) or cover letter markdown+meta
  ai_prompt_hash         text,                                 -- for change detection / caching
  ai_generation_meta     jsonb not null default '{}'::jsonb,   -- {model, provider, tokens, latencyMs}
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index documents_user_app_idx on documents (user_id, application_id, created_at desc);
create index documents_user_kind_idx on documents (user_id, kind);
```

### 3.2 Master CV JSON shape

Stored either on `user_profile.master_cv` (new column) OR as a `documents` row with `kind='master_cv'`. Design decision: use `documents` row — same versioning story as tailored variants, cleaner separation.

```typescript
type MasterCV = {
  basics: {
    name: string
    headline: string
    email?: string
    phone?: string
    location?: string
    linkedin?: string
    github?: string
    website?: string
  }
  summary: string                        // 2-3 sentence intro
  experience: {
    company: string
    role: string
    location?: string
    start: string                        // ISO YYYY-MM
    end: string | 'present'
    bullets: string[]                    // 3-6 accomplishment bullets each
    tech?: string[]
  }[]
  projects?: {
    name: string
    url?: string
    description: string
    tech?: string[]
    highlights?: string[]
  }[]
  education?: {
    school: string
    degree: string
    start?: string
    end?: string
    location?: string
    honors?: string
  }[]
  skills: {
    primary: string[]                    // top 5-10 that lead the CV
    secondary?: string[]                 // known but less foregrounded
  }
  certifications?: {
    name: string
    issuer: string
    date?: string
    url?: string
  }[]
  languages?: {
    name: string
    proficiency: string                  // Native / Fluent / Professional / Conversational
  }[]
}
```

### 3.3 Tailored CV JSON shape

Same as MasterCV but with a `_tailoring` metadata block appended:

```typescript
type TailoredCV = MasterCV & {
  _tailoring: {
    applicationId: string
    reasoning: string                    // one paragraph on what was emphasized
    highlighted_skills: string[]         // subset of skills reordered to top
    reordered_experience_indices: number[]  // permutation of master.experience indices
    summary_rewrite: boolean             // did AI rewrite the summary for this role?
  }
}
```

### 3.4 Cover letter shape

```typescript
type CoverLetter = {
  applicationId: string
  greeting: string                       // "Dear Hiring Manager," or personalized
  paragraphs: string[]                   // 3-4 body paragraphs
  closing: string                        // "Sincerely, ..."
  senderName: string
}
```

### 3.5 Schema migration

One additive migration:
- Create `documents` table (§3.1)
- No changes to existing tables

## 4. AI additions

Extend `AIProvider` interface:

```typescript
interface AIProvider {
  // existing: parseJob, parseProfile, scoreJob, scoreCompany
  tailorCV(input: { master: MasterCV; application: ApplicationWithJob }): Promise<TailoredCV>
  draftCoverLetter(input: { master: MasterCV; application: ApplicationWithJob }): Promise<CoverLetter>
  distillGithubProjects(input: { repos: GitHubRepo[] }): Promise<MasterCV['projects']>
}
```

Prompts live in `lib/ai/prompts/tailor-cv.ts`, `lib/ai/prompts/cover-letter.ts`, `lib/ai/prompts/distill-github.ts`.

Post-generation validation via Zod against the target shape; retry once if malformed.

## 5. PDF rendering

Install `@react-pdf/renderer`. One template in `lib/pdf/cv-template.tsx`:

```
┌─────────────────────────────────────────────┐
│ NAME                                        │
│ Headline · email · phone · location · link  │
├─────────────────────────────────────────────┤
│ SUMMARY                                     │
│ 2-3 sentence blurb                          │
├─────────────────────────────────────────────┤
│ EXPERIENCE                                  │
│   Company · Role · Location    Start – End  │
│     • bullet                                │
│     • bullet                                │
│     Tech: react, node, postgres             │
├─────────────────────────────────────────────┤
│ PROJECTS                                    │
├─────────────────────────────────────────────┤
│ EDUCATION                                   │
├─────────────────────────────────────────────┤
│ SKILLS · CERTIFICATIONS · LANGUAGES         │
└─────────────────────────────────────────────┘
```

Single column, standard system fonts, no images. ATS-friendly by default.

Cover letter template `lib/pdf/cover-letter-template.tsx` — clean business letter format.

Generation flow:
1. Request `/api/documents/[id]/pdf`
2. Route handler loads document JSON from DB
3. Renders React tree with `@react-pdf/renderer` `Document`, streams PDF back with `Content-Disposition: attachment`
4. Fast (no browser needed; runs in Node runtime)

## 6. GitHub sync

**Adapter:** `lib/github/adapter.ts`
- `fetchPublicRepos(username): GitHubRepo[]` — hits `https://api.github.com/users/{username}/repos?type=public&sort=updated&per_page=30`
- No auth required for public repos (60 requests/hour rate limit unauthenticated — enough for occasional sync)
- Optional `GITHUB_TOKEN` env var bumps rate limit to 5000/hour if user provides one

**UI:** On `/settings/cv`, a "Sync from GitHub" button prompts for username, fetches repos, distills via AI into 3-5 project bullets, appends to master CV `projects` array (user reviews before save).

## 7. UI

### `/settings/cv` — Master CV editor
- Tabs: **Overview** (basics + summary) | **Experience** | **Projects** | **Education** | **Skills** | **Import**
- Each section: list of entries + Add button; each entry expands to inline form
- GitHub sync in Import tab
- Save button per tab (autosave stretches to v2.1)
- "Preview PDF" opens a new tab with the rendered PDF of the master CV

### `/applications/[id]` — enhanced right column
- New "Documents" card:
  - List of documents attached to this application (version, kind badge, timestamp)
  - Actions per row: Download PDF, View content (opens edit modal), Regenerate, Delete
  - "+ Generate tailored CV" button — calls AI, creates new doc row, downloads immediately
  - "+ Draft cover letter" button — same pattern

### `/documents` — document library
- Table of all generated documents across all applications
- Columns: kind, title, application (link), version, created, actions
- Filter by kind, application
- Bulk download (later polish)

### Sidebar
- Add "CV" nav entry under Personal group between Profile and Digest → links to `/settings/cv`
- Add "Documents" nav entry between Applications and Companies → links to `/documents`

## 8. Cost implications

Per generation, using Groq's `openai/gpt-oss-20b`:
- Tailored CV: ~2K input + ~2K output tokens ≈ $0.0018 (free tier absorbs it)
- Cover letter: ~1K + ~500 tokens ≈ $0.00075
- Master CV distill from GitHub: ~3K + ~1K tokens ≈ $0.001

At Groq's free tier (250K tokens/min), user can generate ~50 tailored CVs per minute. Real usage: maybe 5-10 per week. Fits comfortably.

## 9. Testing

- Unit test PDF renderer — snapshot output length + structural presence of sections
- Unit test each new AI prompt builder — template correctness
- Integration test `tailorCV` service — fixtures for master + application, assert TailoredCV shape
- Integration test GitHub adapter — mocked fetch
- E2E: manual smoke test — generate one PDF, confirm it opens

Target: 80% coverage on `lib/pdf/`, `lib/documents/`.

## 10. What "done" looks like for v2

Live demo:
1. `/settings/cv` — populate a master CV (or import from profile + GitHub)
2. `/applications/[id]` — click "Generate tailored CV" → PDF downloads in <10 sec
3. PDF opens cleanly, is single-column, has correct name/roles/bullets
4. Document appears in the application's Documents list
5. "Draft cover letter" → PDF downloads, has role-appropriate content
6. `/documents` — shows both docs with correct metadata
