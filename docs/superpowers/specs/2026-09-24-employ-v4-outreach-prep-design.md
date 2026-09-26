# lee — v4 Outreach & Interview Prep Design Spec

**Date:** 2026-09-24
**Status:** Approved — ready for implementation planning
**Scope:** Sub-project 4 of 5 in the lee roadmap (final sub-project)
**Depends on:** v1 + v1.5 + v2 + v3 (all shipped)

---

## 1. Overview

v4 closes the loop: AI-drafted outreach messages (LinkedIn / recruiter replies) that you copy-paste, per-application interview prep packs (likely questions, STAR-formatted answers grounded in your CV, company research summary), and a weekly digest email that ships every Monday at 08:00 UTC via the existing Gmail scope.

## 2. Goals and non-goals

### In scope
- **Outreach drafts** — three kinds: `linkedin_connection` (short intro request), `linkedin_message` (longer follow-up), `recruiter_reply` (response to an inbound recruiter thread). AI generates from master CV + application context. Stored as `documents` rows with new kinds. Copy-paste UX; no LinkedIn/email sending.
- **Interview prep pack** — per application, per stage kind (recruiter_screen / tech_screen / system_design / behavioral / take_home). AI generates:
  - Likely questions (5-10 per kind)
  - STAR-formatted answers referencing specific bullets from master CV
  - Company research summary (industry, recent news via web search if provider supports it, stack, notable engineering blog posts)
  - Talking points to raise
  - Red flags to probe
  Rendered as a nicely-formatted in-app page + PDF export.
- **Weekly digest email** — Monday 08:00 UTC via Gmail API (`gmail.send` scope required — extend v3 scope). Content: applications by status, upcoming interviews, discoveries needing triage, stale follow-ups. Sent from user's own Gmail to themselves.
- Fold weekly digest into existing `/api/cron/sync-all` cron (runs daily; only email on Monday).

### Explicitly out of scope
- Actually sending LinkedIn messages (LinkedIn TOS blocks automation)
- Auto-replying to recruiter emails (v5 territory if ever)
- Voice/video interview simulation
- Coding challenge solvers
- Salary negotiation drafting (may fold into v4.1 polish)
- Multi-recipient digest (single user only)

### Success criteria
- Click "Draft outreach" on any application → three-tab UI (Connection / Message / Recruiter Reply) → each has AI-drafted content ready to copy in <5 seconds
- Click "Prep pack" on any interview stage → full-page prep with questions/answers/company research in <15 seconds → downloadable PDF
- Weekly Monday email lands in inbox with pipeline summary
- Zero LinkedIn or third-party API calls (all outreach is copy-paste; digest uses user's own Gmail send)

## 3. Data model

### Reuses existing `documents` table

Three new `kind` values (no migration; kind is text column):
- `outreach_linkedin_connection`
- `outreach_linkedin_message`
- `outreach_recruiter_reply`
- `interview_prep_pack`

### New schema addition

Add one column to `user_profile`:
```sql
alter table user_profile add column digest_last_sent_at timestamptz;
```

Used to prevent duplicate digest sends if cron runs twice on Monday (idempotency guard).

## 4. Content shapes

```typescript
type OutreachDraft = {
  kind: 'linkedin_connection' | 'linkedin_message' | 'recruiter_reply'
  applicationId: string
  subject?: string           // for recruiter_reply
  body: string               // markdown-ish plain text, copy-ready
  tone: 'formal' | 'friendly' | 'enthusiastic'
  wordCount: number
  notes?: string             // AI reasoning on why this framing
}

type InterviewPrepPack = {
  applicationId: string
  stageId?: string           // null = general pack for the whole app
  stageKind: string          // recruiter_screen | tech_screen | etc.
  companyResearch: {
    summary: string
    industry: string[]
    notable_facts: string[]  // recent news, funding, product launches
    tech_stack: string[]     // known engineering choices
    culture_signals: string[]
  }
  likelyQuestions: {
    question: string
    category: 'technical' | 'behavioral' | 'system_design' | 'take_home' | 'culture' | 'salary'
    difficulty: 'easy' | 'medium' | 'hard'
    star_answer?: {          // present for behavioral questions
      situation: string
      task: string
      action: string
      result: string
      cv_bullet_ref?: string // which master-CV bullet supports this
    }
    technical_notes?: string // present for technical questions
  }[]
  talkingPoints: string[]    // things to bring up unprompted
  redFlags: string[]         // things to probe about the company
  yourQuestions: string[]    // questions to ask the interviewer
}
```

## 5. AI additions

Extend `AIProvider` interface:
```typescript
draftOutreach(input: {
  master: MasterCV
  application: ApplicationWithJob
  kind: 'linkedin_connection' | 'linkedin_message' | 'recruiter_reply'
  tone: 'formal' | 'friendly' | 'enthusiastic'
}): Promise<OutreachDraft>

generateInterviewPrepPack(input: {
  master: MasterCV
  application: ApplicationWithJob
  stageKind: string
  stageId?: string
}): Promise<InterviewPrepPack>
```

Prompts in:
- `lib/ai/prompts/outreach-linkedin-connection.ts` (max 300 chars per LinkedIn constraint)
- `lib/ai/prompts/outreach-linkedin-message.ts` (500-1500 chars)
- `lib/ai/prompts/outreach-recruiter-reply.ts` (professional email, 150-400 words)
- `lib/ai/prompts/interview-prep.ts` (JSON with all fields)

Post-generation Zod validation. Retry once on malformed output.

## 6. Weekly digest

**Trigger:** `/api/cron/sync-all` — after the existing discovery/gmail/reminders block, add:

```typescript
if (isMondayUtc() && !alreadySentThisWeek(user)) {
  await sendWeeklyDigest({ userId })
  await profileQ.upsert(userId, { digestLastSentAt: new Date() })
}
```

**Content generation:** `lib/digest/weekly.ts`:
- Queries current pipeline state (applications by status, next 7 days interviews, top 5 discoveries, stale >14 day items)
- Renders as HTML using a small `lib/digest/email-template.tsx` — inline styles only, no external CSS (email client compat)
- Subject: `lee · weekly · {N} apps, {M} interviews this week`

**Sending:** `lib/gmail/send.ts` uses Gmail API `users.messages.send` — requires expanding v3 scope to include `https://www.googleapis.com/auth/gmail.send` (currently only `gmail.readonly`).

**Scope migration:** on v4 deploy, existing users will need to re-consent to grant `gmail.send`. UI banner + reconnect flow (same pattern as v3 rollout).

## 7. UI

### Application detail — new right-column card
- **Outreach** card: three tabs (Connection · Message · Recruiter Reply), each with "Draft" button, tone selector, generated text in copyable textarea + copy-to-clipboard icon
- **Interview prep** card: appears if application has ≥1 interview stage. "Generate prep pack" button per stage. Once generated, expandable section with company research, likely questions (grouped by category, expandable per question to reveal answer), talking points, your questions to ask.

### `/documents` library
- Filter chips extend with: Outreach · Interview Prep
- Outreach docs downloadable as .txt (no PDF for short-form)
- Interview prep downloadable as PDF (use existing `lib/pdf` infra with a new template)

### `/settings/integrations`
- New card row for "Weekly digest" — toggle on/off, "Send test digest now" button, last-sent timestamp

### `/settings/notifications` — new page
- Just the digest toggle for now; future notification prefs land here

### Sidebar
- No new entries — everything hangs off existing pages

## 8. Testing

- Unit tests for each outreach prompt builder (assert prompt structure, few-shot examples present)
- Unit tests for `isMondayUtc`, `alreadySentThisWeek` guards
- Integration test for `sendWeeklyDigest` with mocked Gmail send + factories
- Integration test for `generateInterviewPrepPack` with FixtureAIProvider
- Interview prep PDF renderer snapshot test

## 9. What "done" looks like for v4

Live demo:
1. Application detail → **Draft outreach** → LinkedIn connection tab → text appears in <5s, click Copy → paste into LinkedIn — done
2. Interview stage → **Generate prep pack** → full-page prep with 8 likely questions, STAR answers, company summary → **Download PDF**
3. `/settings/integrations` → **Send test digest now** → within seconds, email lands in your Gmail with pipeline summary
4. Wait until Monday → cron auto-sends the weekly digest
