# lee v4 Outreach & Interview Prep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Ship v4 — AI outreach drafts (LinkedIn / recruiter) + interview prep packs + weekly Gmail digest.

**Spec:** `docs/superpowers/specs/2026-09-24-employ-v4-outreach-prep-design.md`
**Depends on:** v1 + v1.5 + v2 + v3 all shipped.

**Working dir:** `employ`

---

## Phase O1 — Types + prompts

**Files:**
- Modify: `lib/documents/types.ts` — add Zod schemas for `OutreachDraft`, `InterviewPrepPack`
- Create: `lib/ai/prompts/outreach-linkedin-connection.ts`, `outreach-linkedin-message.ts`, `outreach-recruiter-reply.ts`, `interview-prep.ts`
- Update: `lib/db/queries/documents.ts` — no code change; `kind` is a text column so new kinds work implicitly

- [ ] Zod schemas per spec §4
- [ ] Prompt builders per spec §5. LinkedIn Connection ≤300 chars, LinkedIn Message 500-1500 chars, Recruiter Reply 150-400 words. Interview prep prompt returns JSON matching InterviewPrepPack schema.

Commit: `feat(documents): outreach + interview prep types + prompts`

## Phase O2 — AI provider extensions

**Files:**
- Modify: `lib/ai/types.ts` — add `draftOutreach`, `generateInterviewPrepPack` interface methods
- Modify: `lib/ai/gemini.ts`, `lib/ai/groq.ts`, `lib/ai/fixtures.ts` — implement

- [ ] Interface methods signatures per spec §5
- [ ] Gemini + Groq call `generate` + Zod parse
- [ ] Fixture returns deterministic valid shapes for tests

Commit: `feat(ai): draftOutreach + generateInterviewPrepPack`

## Phase O3 — Outreach service

**Files:**
- Create: `lib/documents/outreach.ts`
- Test: `tests/integration/outreach.test.ts`

- [ ] `generateOutreachDraft({ userId, applicationId, kind, tone, ai })`:
  - Load master CV, load app+job
  - Call `ai.draftOutreach`
  - Zod validate
  - Save as new documents row with `kind='outreach_linkedin_connection'` (or matching kind), applicationId, next version, content=result, title auto-generated

Commit: `feat(documents): outreach draft service`

## Phase O4 — Interview prep service

**Files:**
- Create: `lib/documents/prep.ts`
- Test: `tests/integration/prep.test.ts`

- [ ] `generateInterviewPrepPack({ userId, applicationId, stageKind, stageId?, ai })`:
  - Load master, app+job, stage if provided
  - Call `ai.generateInterviewPrepPack`
  - Zod validate
  - Save as documents row `kind='interview_prep_pack'`, applicationId, version, title

Commit: `feat(documents): interview prep pack service`

## Phase O5 — PDF template for prep pack

**Files:**
- Create: `lib/pdf/prep-pack-template.tsx`
- Modify: `lib/pdf/render.ts` — add `renderPrepPackPdf`

- [ ] Prep pack template: A4 pages, sections per InterviewPrepPack shape. Company research at top, likely questions with expandable answers as headings + bullets, talking points, red flags, your questions.
- [ ] `renderPrepPackPdf(pack) → Buffer`

Commit: `feat(pdf): interview prep pack template`

## Phase O6 — Gmail scope expansion + send

**Files:**
- Modify: `lib/auth/edge-config.ts` — add `gmail.send` to scope
- Create: `lib/gmail/send.ts` — `sendEmail({ userId, to, subject, htmlBody })`
- Test: `tests/unit/gmail-send.test.ts`

- [ ] Extend Google provider scope array with `'https://www.googleapis.com/auth/gmail.send'`
- [ ] `sendEmail` uses Gmail API `users.messages.send` — encodes RFC 2822 message + base64url encode → POST to `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`

Commit: `feat(gmail): send capability + scope expansion`

## Phase O7 — Weekly digest

**Files:**
- Modify: `lib/db/schema.ts` — add `digestLastSentAt` on user_profile
- Generate migration
- Create: `lib/digest/weekly.ts`, `lib/digest/email-template.tsx`
- Modify: `app/api/cron/sync-all/route.ts` — after existing block, add Monday digest send

- [ ] `sendWeeklyDigest({ userId })`:
  - Gather pipeline snapshot (apps by status, next 7d interviews, top 5 discoveries, stale >14d items)
  - Render HTML via email-template component (React → renderToString with inline styles)
  - `sendEmail({ userId, to: user.email, subject, htmlBody })`
  - Update `digestLastSentAt = now()`
- [ ] Guards: `isMondayUtc()` + `alreadySentThisWeek(user)` (compares against `digestLastSentAt`)
- [ ] Cron endpoint runs digest AFTER discovery/gmail/reminders, gated by both checks

Commit: `feat(digest): weekly monday email via gmail send`

## Phase O8 — Route handlers

**Files:**
- Create: `app/api/applications/[id]/documents/generate-outreach/route.ts` (POST body `{kind, tone}`)
- Create: `app/api/applications/[id]/documents/generate-prep-pack/route.ts` (POST body `{stageKind, stageId?}`)
- Create: `app/api/digest/send-now/route.ts` (POST, sends test digest immediately)

Standard route pattern; auth via `auth()`; call the service; return JSON.

Commit: `feat(api): outreach + prep pack + digest-send routes`

## Phase O9 — Application detail UI

**Files:**
- Modify: `app/(authed)/applications/[id]/page.tsx` — mount OutreachCard and PrepPackCard
- Create: `components/outreach-card.tsx`, `components/prep-pack-card.tsx`

- [ ] **OutreachCard**: tabs (Connection · Message · Recruiter Reply), tone selector, "Draft" button per tab, generated content in textarea with copy-to-clipboard button, saved automatically as documents row
- [ ] **PrepPackCard**: appears if application has ≥1 interview stage; for each stage, "Generate prep pack" button; once generated, expandable sections (company research, questions by category, talking points, your questions)
- [ ] Both use plain fetch to route handlers with useState pending + toast

Commit: `feat(ui): outreach + prep pack cards on application detail`

## Phase O10 — Documents library extensions

**Files:**
- Modify: `components/documents-table.tsx` — add Outreach + Interview Prep filter chips
- Modify: `app/api/documents/[id]/pdf/route.ts` — dispatch to `renderPrepPackPdf` when kind='interview_prep_pack'; outreach kinds → download as .txt

Commit: `feat(ui): document library outreach + prep pack support`

## Phase O11 — Notifications settings + digest test

**Files:**
- Create: `app/(authed)/settings/notifications/page.tsx`, `actions.ts`, `components/notifications-panel.tsx`
- Modify: `components/sidebar.tsx` — add "Notifications" nav entry under Personal

- [ ] Panel: weekly digest toggle (stored in user_profile as `weeklyDigestEnabled` boolean — add column with default true) + "Send test digest now" button (POST /api/digest/send-now) + last-sent timestamp
- [ ] Toggle disables digest even if it's Monday

Commit: `feat(ui): notifications settings + digest toggle + test send`

## Verification

- `pnpm typecheck` clean
- `pnpm test` — 260+ passing (~28 new)
- `pnpm build` succeeds
- Manual: 
  1. Application detail → Draft outreach → get 3 tabs of copy-ready text
  2. Add an interview stage → Generate prep pack → PDF downloads with all sections
  3. `/settings/notifications` → Send test digest now → email arrives in Gmail

## Push cadence

Per-phase commits, push in batches. Vercel auto-deploys.
