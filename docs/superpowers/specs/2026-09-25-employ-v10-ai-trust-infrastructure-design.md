# Employ — v10 AI Trust Infrastructure Design Spec

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Scope:** Cross-cutting — signal gates + quality feedback + minimal observability
**Depends on:** v1-v9 + all polish passes

---

## 1. Problem

Every AI feature in Employ runs unconditionally when triggered. Two failure modes:

1. **Confidently wrong when input is low-signal** — outreach drafts hallucinate details, CVs get tailored to phantom requirements, follow-ups reference facts that don't exist. The "trying to be helpful with no signal" pattern from the DevDox story.
2. **No feedback loop** — we track latency and tokens (`ai_call_logs`), but not whether the output was useful. Model swaps happen blind; regressions land silently.

## 2. Non-goals

- Full eval-harness with golden fixtures + regression alerts (deferred to v10.1)
- Observability dashboard beyond a single card on `/analytics` (v10.1)
- Prompt versioning / A-B testing (v10.1)
- Context minimization (removing unused fields from prompts) — deferred; current prompts work

## 3. Feature A — Signal check gates

### Principle
Before every AI call, run a deterministic pre-check. If the input lacks signal to produce a grounded output, skip the LLM entirely and return a templated response with a clear reason.

### Central helper

`lib/ai/signal.ts`:
```typescript
export type SignalResult =
  | { ok: true }
  | { ok: false; code: string; message: string; fixHint?: string }

export function checkParseJobSignal(text: string): SignalResult
export function checkTailorCVSignal(app: ApplicationWithJob, master: MasterCV | null): SignalResult
export function checkCoverLetterSignal(app: ApplicationWithJob, master: MasterCV | null): SignalResult
export function checkOutreachSignal(app: ApplicationWithJob, master: MasterCV | null, kind: OutreachKind): SignalResult
export function checkFollowupSignal(app: ApplicationWithJob, daysSince: number): SignalResult
export function checkPrepPackSignal(app: ApplicationWithJob, stage: InterviewStage): SignalResult
export function checkDebriefSignal(stage: InterviewStage, quickNotes: string): SignalResult
export function checkDiscoveryScoringSignal(profile: UserProfile | null): SignalResult
export function checkExpenseClassifySignal(description: string, vendor?: string): SignalResult
```

### Signal rules

**parseJob:**
- fail if extracted text < 200 chars
- fail if text has no capitalized word (heuristic: no proper nouns → not a JD)

**tailorCV / coverLetter:**
- fail if `master` is null
- fail if `master.experience` is empty
- fail if `job.title` or `application.job.company` is null

**outreach (all kinds):**
- fail if `master.basics.name` empty
- fail if `job.title` empty OR `company.name` empty
- fail if kind='linkedin_message' and no linked contact in `application_contacts`

**followup_email:**
- fail if `application.appliedAt` null (should backfill first)
- fail if `daysSince < 3` (too soon to follow up)
- warn (severity=minor) if there's a recent inbound email activity in last 3 days ("you already heard from them")

**interview_prep_pack:**
- fail if `master` null
- warn if `company.notes_md` and `company.website` and `company.tech_stack.length === 0` (no research to ground on)

**interview_debrief:**
- fail if `stage.status !== 'completed'`
- fail if `quickNotes` (stripped of the template scaffold) is empty

**discovery_scoring:**
- fail (per user, per cron cycle) if `profile.skills.length + profile.industries.length + profile.role_types.length < 3`

**expense_classify:**
- fail if `description` empty AND `vendor` empty

### Integration

Every generator route + service becomes:
```typescript
const signal = checkOutreachSignal(app, master, kind)
if (!signal.ok) {
  return NextResponse.json(
    { skipped: true, code: signal.code, message: signal.message, fixHint: signal.fixHint },
    { status: 200 }  // NOT 4xx — the intent is legitimate, just refused
  )
}
// AI call proceeds...
```

Client callers handle `{skipped: true}` by showing an info toast with `fixHint` (link where possible).

### Templated fallback outputs

For features where a skip should still yield SOMETHING useful (not just refusal), return a structured template:
- **outreach followup with no daysSince signal** → skip, hint "Backfill applied-at date first"
- **tailored CV with no master** → hint "Populate your CV at Settings → CV first" with a button link
- **expense classify with both fields empty** → hint "Type at least a vendor or description"

## 4. Feature B — Quality feedback loop

### Data model

Extend `ai_call_logs` with:
```sql
alter table ai_call_logs add column document_id uuid references documents(id) on delete set null;
alter table ai_call_logs add column user_rating smallint;   -- 1 = 👎, 5 = 👍, null = no rating
alter table ai_call_logs add column user_action text;       -- 'used' | 'regenerated' | 'dismissed' | null
alter table ai_call_logs add column signal_check_passed boolean;
alter table ai_call_logs add column signal_check_code text;
```

Migration additive.

### API

- `POST /api/ai-calls/[id]/rate` — body `{rating: 1|5, action?: 'used'|'regenerated'|'dismissed'}` → updates the ai_call_logs row
- `POST /api/documents/[id]/rate` — body `{rating: 1|5}` → finds the most recent ai_call_logs row linked to this document, updates it

### UI

**Below every AI-generated content view** (outreach card, tailored CV preview, prep pack, debrief AI summary):
- Two icon buttons: 👍 (`ThumbsUp`) and 👎 (`ThumbsDown`) from lucide-react
- On click: POST to `/api/documents/{id}/rate`, toast confirmation, chip stays green/red after
- Below the buttons, muted text: "Ratings help improve future generations"

**Implicit signals:**
- When user clicks Regenerate on a fresh (non-stale) doc, log `user_action='regenerated'` on the previous ai_call_logs row automatically — implicit thumbs-down
- When user's Copy button is clicked on outreach, log `user_action='used'` — implicit thumbs-up
- When user Dismisses a discovery, log `user_action='dismissed'` on the associated scoring ai_call_logs row

## 5. Signal-check observability

Extend AI usage card on `/analytics` (already exists from v6.1):
- New sub-section: "Signal checks — last 30 days"
- Bar chart: skips vs proceeded per kind
- Table row: kind, calls attempted, signal-skipped %, avg rating, regeneration rate

If skip rate is high (>25% for any kind), we know the app has usability gaps forcing users into low-signal states.

## 6. Implementation phases

### Phase S1 — Signal helpers + wire into ALL generators
- Create `lib/ai/signal.ts` with all 9 check functions
- Wire into every generator route
- Return `{skipped, code, message, fixHint}` envelope
- Unit tests for each check

### Phase S2 — Client handling of skip envelope
- `components/outreach-card.tsx`, `documents-card.tsx`, `prep-pack-card.tsx`, `debrief-dialog.tsx`, expense-form auto-categorize button, etc.
- On skip response, show toast + fixHint link
- Don't crash on `{skipped: true}`

### Phase S3 — ai_call_logs schema + logging updates
- Add columns per §4
- Migration
- Update Gemini/Groq/LayaHttp `logCall` to include `documentId`, `signalCheckPassed`, `signalCheckCode`
- Add rate + action routes

### Phase S4 — Rating UI + implicit signal capture
- Add 👍👎 buttons to outreach, tailored CV, prep pack, debrief views
- Wire regenerate + copy + dismiss to implicit signals
- Toast on rating

### Phase S5 — Extend AI usage analytics card
- Add signal-check breakdown section
- Add rating column to the per-kind table
- CSV export includes new metrics

## 7. Testing

- Unit tests for every signal check function (~18 tests)
- Integration tests for skip envelope on every route (~10 tests)
- Integration test for rate route + column updates (~4 tests)
- Analytics update tests (~3 tests)

Target: +35 tests, 618 → 653+.

## 8. What "done" looks like

Live demo:
1. Try to generate a tailored CV with no master CV → toast: "Populate your CV first" + link to `/settings/cv`
2. Try to draft a follow-up on an application with no `appliedAt` → toast: "Set the applied-at date first" + inline backfill
3. Try to draft outreach with no linked contacts + kind='linkedin_message' → toast asks to link a contact first
4. Successfully generate a real outreach → 👍/👎 buttons appear below the text
5. Click Regenerate on a fresh draft → previous log row gets `user_action='regenerated'` (implicit 👎)
6. `/analytics` → AI usage card now shows signal-check skip rate + rating averages per kind
