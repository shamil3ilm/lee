# lee v2 CV & Documents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Ship v2 — master CV editor, AI-tailored CVs and cover letters per application, PDF export, GitHub sync.

**Spec:** `docs/superpowers/specs/2026-09-16-employ-v2-cv-documents-design.md`
**Depends on:** v1 + v1.5 shipped and live at `https://employ4me.vercel.app`

**Working dir:** `employ`

---

## Phase C1 — Schema + queries

**Files:**
- Modify: `lib/db/schema.ts` — add `documents` table (spec §3.1)
- Create: `lib/db/queries/documents.ts`
- Migration: `pnpm db:generate`
- Test: `tests/integration/queries/documents.test.ts`

- [ ] Add `documents` table Drizzle definition. Indexes: `(userId, applicationId, createdAt desc)` and `(userId, kind)`.
- [ ] Generate migration. Commit both schema and migration.
- [ ] Query module: `create`, `list(userId, opts?: {applicationId?, kind?})`, `getById(userId, id)`, `update(userId, id, patch)`, `remove(userId, id)`, `nextVersion(userId, applicationId, kind) → number` (finds current max version for that app+kind, returns +1).
- [ ] Integration tests: create/list/scoping/version increment.

Commit: `feat(db): documents table + queries`

## Phase C2 — Types + AI prompts

**Files:**
- Create: `lib/documents/types.ts` — Zod schemas for `MasterCV`, `TailoredCV`, `CoverLetter` per spec §3.2-3.4
- Create: `lib/ai/prompts/tailor-cv.ts`, `lib/ai/prompts/cover-letter.ts`, `lib/ai/prompts/distill-github.ts`

- [ ] Zod schemas + TypeScript types (inferred).
- [ ] Prompt builders: each takes structured input, returns a prompt string constraining the AI to produce JSON matching the schema. Include few-shot examples inline for consistency.

Commit: `feat(documents): types + prompts`

## Phase C3 — AI provider extensions

**Files:**
- Modify: `lib/ai/types.ts` — add `tailorCV`, `draftCoverLetter`, `distillGithubProjects` methods
- Modify: `lib/ai/gemini.ts`, `lib/ai/groq.ts`, `lib/ai/fixtures.ts` — implement each method
- Test: extend AI provider unit tests with fixture-based generation

- [ ] Interface additions with typed inputs and outputs.
- [ ] Implementations follow existing pattern (structured JSON output, retry chain, log to `ai_call_logs`).
- [ ] FixtureAIProvider returns deterministic pseudo-output for tests.

Commit: `feat(ai): tailorCV + draftCoverLetter + distillGithubProjects`

## Phase C4 — Master CV service + GitHub adapter

**Files:**
- Create: `lib/documents/master.ts` — service for master CV CRUD
- Create: `lib/github/adapter.ts` — public repo fetcher

- [ ] `getMasterCV(userId) → MasterCV | null` — reads latest `documents` row with `kind='master_cv'`
- [ ] `saveMasterCV(userId, cv: MasterCV) → Document` — creates new version
- [ ] `bootstrapFromProfile(userId) → MasterCV` — reads `user_profile` + generates a starter MasterCV from existing fields
- [ ] `syncFromGithub(userId, username) → { proposed: MasterCV['projects'] }` — fetches repos via adapter, calls `ai.distillGithubProjects`, returns proposal (user reviews before merge)
- [ ] `lib/github/adapter.ts`:
  - `fetchPublicRepos(username, token?)` — hits GitHub API, returns typed `GitHubRepo[]`
  - Handles 60 req/hr unauthenticated rate limit gracefully
- [ ] Integration tests with mocked fetch for GitHub adapter, FixtureAIProvider for distill.

Commit: `feat(documents): master cv service + github sync`

## Phase C5 — Tailored CV + cover letter services

**Files:**
- Create: `lib/documents/tailor.ts` — tailored CV service
- Create: `lib/documents/coverLetter.ts` — cover letter service

- [ ] `generateTailoredCV({ userId, applicationId, ai }) → Document`
  - Load master CV via `getMasterCV`
  - Load application + job via `applications.queries.getById`
  - Call `ai.tailorCV({ master, application })`
  - Validate result with Zod
  - Save as new `documents` row with `kind='tailored_cv'`, `applicationId`, next version
  - Return document row
- [ ] `generateCoverLetter({ userId, applicationId, ai }) → Document` — same pattern
- [ ] Integration tests: fixture master CV + fixture application → assert tailored/cover document persisted

Commit: `feat(documents): tailored cv + cover letter generation`

## Phase C6 — PDF rendering

**Files:**
- Install: `pnpm add @react-pdf/renderer`
- Create: `lib/pdf/cv-template.tsx`, `lib/pdf/cover-letter-template.tsx`, `lib/pdf/render.ts`
- Test: `tests/unit/pdf-template.test.tsx`

- [ ] CV template component per spec §5 layout — takes `MasterCV | TailoredCV`, renders React tree using `@react-pdf/renderer` primitives (Document, Page, Text, View, StyleSheet)
- [ ] Cover letter template — business letter format from `CoverLetter` shape
- [ ] `renderCvPdf(cv) → Buffer` / `renderCoverLetterPdf(letter) → Buffer`
- [ ] `next.config.ts` — externalize `@react-pdf/renderer` if bundling issues appear
- [ ] Tests: snapshot output size + structural markers (sections present, correct name in output)

Commit: `feat(pdf): cv + cover letter templates + renderer`

## Phase C7 — Route handlers

**Files:**
- Create: `app/api/documents/[id]/pdf/route.ts` — streams PDF
- Create: `app/api/documents/[id]/route.ts` — GET (JSON) / DELETE
- Create: `app/api/applications/[id]/documents/generate-tailored/route.ts` — POST triggers tailoredCV generation
- Create: `app/api/applications/[id]/documents/generate-cover-letter/route.ts` — POST triggers cover letter
- Create: `app/api/github/sync/route.ts` — POST triggers GitHub sync

- [ ] Each route: auth check → call service → return JSON or PDF bytes with correct `Content-Type` + `Content-Disposition`
- [ ] `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `maxDuration = 30`

Commit: `feat(api): document routes`

## Phase C8 — Master CV editor UI

**Files:**
- Create: `app/(authed)/settings/cv/page.tsx`, `actions.ts` (optional if using route handlers), `components/cv-editor.tsx`, `components/cv-editor-tabs/*.tsx`
- Modify: `components/sidebar.tsx` — add "CV" under Personal

- [ ] Tabs per spec §7: Overview, Experience, Projects, Education, Skills, Import
- [ ] Each tab: form fields backed by react-hook-form + Zod (schemas from `lib/documents/types.ts`)
- [ ] Save button per tab writes MasterCV via service
- [ ] "Preview PDF" button opens `/api/documents/{masterCvId}/pdf` in new tab
- [ ] Import tab: GitHub sync UI (username input + preview of proposed projects before merge)

Commit: `feat(ui): master cv editor`

## Phase C9 — Application detail Documents card

**Files:**
- Modify: `app/(authed)/applications/[id]/page.tsx`
- Create: `components/documents-card.tsx`

- [ ] "Documents" card in right column
- [ ] Lists all documents for this application, kind badges, version, timestamp
- [ ] "+ Generate tailored CV" and "+ Draft cover letter" buttons — POST to generate routes, on success show toast + refresh
- [ ] Per-doc actions: Download PDF (link to route handler), Regenerate (POST again → new version), Delete (DELETE route)

Commit: `feat(ui): documents card on application detail`

## Phase C10 — Documents library page

**Files:**
- Create: `app/(authed)/documents/page.tsx`, `components/documents-table.tsx`
- Modify: `components/sidebar.tsx` — add "Documents" between Applications and Companies

- [ ] Table with columns: kind, title, application (link), version, created, actions
- [ ] Filters: kind (all/master/tailored/cover_letter), applicationId
- [ ] Actions per row: Download, Delete
- [ ] Empty state

Commit: `feat(ui): documents library`

## Verification

- `pnpm typecheck` clean
- `pnpm test` — 170+ passing (153 existing + ~20 new across queries, services, PDF, GitHub)
- `pnpm build` succeeds
- Manual smoke test after deploy:
  1. Populate master CV via `/settings/cv`
  2. Open an application → Generate tailored CV → PDF downloads
  3. Open PDF, verify structure and content

## Push cadence

Per-phase commits; push at end of each phase (or batch and push at end of C10). Vercel auto-deploys.
