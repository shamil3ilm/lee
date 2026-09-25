# Employ — v8 Todos + Reminders + Voice Input Design Spec

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
- `lib/decisions/laya-hf.ts` — HuggingFace Inference API call to hosted Laya checkpoint (`nandhakishoreconvai/laya-multilingual` or equivalent). Requires `HF_TOKEN` env var (free tier: 1000 requests/day). If the checkpoint isn't available on HF Inference, falls back to raising `LayaUnavailableError`.
- `lib/decisions/heuristic.ts` — fallback: simple keyword-match categorization + regex-based booleans. Never fails, always deterministic. Lower quality.
- `lib/decisions/index.ts` — `getDecisionProvider()` — env-driven: `DECISION_PROVIDER=laya` uses Laya with heuristic fallback on error; anything else uses heuristic.

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
- `HF_TOKEN` — HuggingFace API token (free at huggingface.co/settings/tokens)
- `DECISION_PROVIDER` — `laya | heuristic` (default: `heuristic` for zero-config)
- `LAYA_HF_MODEL` — override the HF model id (default: `nandhakishoreconvai/laya-multilingual`)

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
