# lee — v8 Todos + Reminders + Voice Input Design Spec

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Scope:** Four related features
**Depends on:** v1-v7 all shipped

---

## 1. Feature list

- **A. Todos** — general-purpose task list (independent of applications OR linked to any entity: application, stage, contact, expense)
- **B. Reminders** — scheduled notifications for todos and existing activity: browser notifications + digest inclusion
- **C. Expense graph enhancements** — MoM/YoY comparisons, category trends, top vendors, budget adherence over time
- **D. Voice-to-text via Groq Whisper** — microphone input on any text field where paste-a-lot is useful (todo text, expense description, activity notes, outreach draft edits)

## 2. Feature A — Todos

### Data model
New table:
```sql
create table todos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  title           text not null,
  notes_md        text,
  status          text not null default 'open',    -- open | done | archived
  priority        smallint not null default 0,     -- 0-3 (none/low/med/high)
  due_at          timestamptz,
  completed_at    timestamptz,
  -- Optional links to any existing entity
  application_id  uuid references applications(id) on delete set null,
  stage_id        uuid references interview_stages(id) on delete set null,
  contact_id      uuid references contacts(id) on delete set null,
  company_id      uuid references companies(id) on delete set null,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index todos_user_status_due_idx on todos (user_id, status, due_at);
create index todos_application_idx on todos (application_id) where application_id is not null;
```

### Routes
- `GET /api/todos?status=open&applicationId=X` — list with filters
- `POST /api/todos` — create
- `PATCH /api/todos/[id]` — update
- `DELETE /api/todos/[id]`

### UI
- Sidebar entry: **Todos** (icon `CheckSquare`) between Applications and Companies
- `/todos` page: header (this-week / today filter chips) + quick-add form + list grouped by due date (Overdue / Today / This week / Later / No due date)
- Each row: checkbox for status toggle, title, priority chip, due-date badge, linked entity chip (application/company/etc.), quick edit, delete
- Application detail: new "Todos" mini-card in right column showing todos linked to this application, "+ Add todo" button
- Dashboard: **Today's todos** row on `NeedsAttention` widget (top 3 by priority)

## 3. Feature B — Reminders

### Approach
Two channels:
1. **Digest inclusion** — extend v4 weekly digest with an "Upcoming this week" section listing todos with `due_at <= end of week`
2. **Browser notifications** — Web Notifications API with user permission; served on page load via a small client hook

### Schema
No new tables. Reuse `todos.due_at` + `activities` table for logging notification events.

### Implementation
- `lib/notifications/browser.ts`:
  - `requestPermission()`, `showNotification({title, body, url})`
  - `useNotificationScheduler()` React hook — polls `/api/todos?status=open&dueWithin=24h` every 5 min on mount, fires browser notifications for todos crossing their due time
- Extend digest weekly template with upcoming todos + follow-up recommendations

## 4. Feature C — Expense graph enhancements

### New analytics cards
- **`MonthOverMonthCard`** — bar chart comparing current month to previous month per category; delta % labeled
- **`ExpenseCategoryTrendCard`** — line chart of top-5 categories over last 6 months
- **`TopVendorsCard`** — horizontal bars of top 10 vendors by spend (this month or last 3 months)
- **`BudgetAdherenceHistoryCard`** — heatmap or grid showing which months each category was under/over budget

### Service additions to `lib/analytics/service.ts`
```typescript
monthOverMonthByCategory(userId, month, prevMonth): ComparisonRow[]
expenseCategoryTrend(userId, months=6): CategoryTrendRow[]  // (month, category, total) grid
topVendors(userId, months=3, limit=10): VendorRow[]
budgetAdherenceHistory(userId, months=12): AdherenceCell[]  // (month, category, budgetCents, spentCents, adherence: 'under'|'over')
```

### CSV exports
Extend the analytics export endpoint with each new metric.

## 5. Feature D — Voice-to-text via Groq Whisper

### Approach
- Free tier: Groq hosts `whisper-large-v3` at $0.111/hour (~free for personal use)
- Client: browser MediaRecorder captures audio → POST as multipart to `/api/voice/transcribe` → returns `{text}`
- No streaming; single-shot record → stop → upload → text

### Route
`POST /api/voice/transcribe`:
- Multipart body with `file` field (audio blob, webm/opus or mp4/mp3)
- Auth check
- Forward to `https://api.groq.com/openai/v1/audio/transcriptions` with model=`whisper-large-v3`, response_format=`json`
- Return `{text}`
- `maxDuration=30`, `runtime='nodejs'`, `dynamic='force-dynamic'`

### UI component
`components/voice-input-button.tsx`:
- Reusable icon button (`Mic` / `MicOff`) that toggles recording
- On stop, uploads blob, appends transcribed text to the target field (via a callback prop)
- Loading state during transcription
- Toast error if permission denied or transcription fails

### Placement (initial)
Add microphone button next to:
- Todo quick-add input on `/todos`
- Expense description input on expense form
- Activity note textarea (application detail)
- Outreach draft editable textarea (`components/outreach-card.tsx`)

## 5b. Feature E — Laya decision provider

### Purpose
Laya (`github.com/NandhaKishorM/laya`, Apache 2.0) is a decision engine — typed choice / score / yes-no over text, no free-form generation. Extremely well-suited for narrow classification tasks where Gemini/Groq are overkill.

### Provider abstraction
`lib/decisions/types.ts`:
```typescript
export interface DecisionProvider {
  choice<T extends string>(input: {
    text: string
    options: T[]
    context?: string
  }): Promise<{ pick: T; confidence: number }>
  yesNo(input: { text: string; question: string }): Promise<{ answer: boolean; confidence: number }>
  score(input: { text: string; rubric: string; scale?: [number, number] }): Promise<{ score: number }>
}
```

### Implementations
- `lib/decisions/groq.ts` — **default**. Uses the existing `GROQ_API_KEY` with `openai/gpt-oss-20b` model + `response_format: json_object`. Structured prompts: `choice` returns `{pick: enumValue, confidence: 0-1}`; `yesNo` returns `{answer: bool, confidence}`; `score` returns `{score: number}`. Free tier already covers all usage.
- `lib/decisions/heuristic.ts` — deterministic keyword-match fallback. Used when Groq call fails or `DECISION_PROVIDER=heuristic` is set. Never fails, always instant, lower quality but zero latency + zero cost.
- `lib/decisions/laya-hf.ts` — **deferred / opt-in**. HuggingFace Inference API impl for a hosted Laya checkpoint (`nandhakishoreconvai/laya-multilingual`). Only activated if `DECISION_PROVIDER=laya` AND `HF_TOKEN` is set. If HF doesn't host the checkpoint (likely), this impl throws on first use — kept as a stub so migrating later is a config change, not a rewrite.
- `lib/decisions/index.ts` — `getDecisionProvider()` — env-driven: `DECISION_PROVIDER=groq` (default) uses Groq with heuristic fallback on error; `heuristic` uses heuristic directly; `laya` attempts HF Inference then falls back to heuristic.

### First use case: expense auto-categorization
- New API route `POST /api/expenses/classify` — body `{description: string, vendor?: string}` → returns `{category, subcategory?, confidence}`
- On expense form, "Auto-categorize" button next to Category field: fills the select based on Description + Vendor input
- Uses Laya's `choice` with our 22-value category enum
- If Laya unavailable, falls back to heuristic keyword match (Netflix → subscription, DEWA → electricity, etc.)

### Later use cases (deferred, but interface is ready)
- Discovery pre-filter (yesNo before Gemini scoring)
- Email triage relevance (yesNo replacing keyword matcher)
- Follow-up timing (yesNo "should I follow up today?")

### Env vars
- `DECISION_PROVIDER` — `groq | heuristic | laya` (default: `groq`, uses existing `GROQ_API_KEY`)
- `HF_TOKEN` — HuggingFace API token, only needed if `DECISION_PROVIDER=laya` (free at huggingface.co/settings/tokens)
- `LAYA_HF_MODEL` — override the HF model id when using Laya (default: `nandhakishoreconvai/laya-multilingual`)

### Rationale
Groq is the immediate default because we already have the API key, it's on the free tier, and it can do the same structured-choice task via JSON mode. Laya's per-call speed/cost advantage doesn't matter at personal-use volumes (dozens of decisions/day). Real Laya is deferred until either (a) HuggingFace hosts the checkpoint on their free Inference API, or (b) the user wants to self-host on HF Spaces / Modal — both are additive: the interface + heuristic fallback are already in place.

## 6. Constraints and non-goals
- **No streaming transcription** in v8 (single-shot only)
- **No cross-device sync of notifications** — browser-only
- **No shared todos** — single user only
- **No calendar sync for todos** — only for interview_stages via v3 (extending to todos deferred)

## 7. Success criteria

**Todos:**
- Create a todo in <5 sec, mark done in one click
- Link a todo to an application; see it on the application detail
- Overdue todos surface on dashboard

**Reminders:**
- Grant browser notification permission → get pinged when todos come due
- Weekly digest includes upcoming todos

**Expense graphs:**
- Open `/analytics` → see MoM comparison, category trends, top vendors, budget history
- Each new card exports CSV

**Voice:**
- Click mic icon on todo quick-add → speak → text appears in input within 3-5s
- Same on expense description and outreach draft
