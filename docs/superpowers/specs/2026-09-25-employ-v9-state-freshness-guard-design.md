# Employ — v9 State Freshness Guard (SFG) Design Spec

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Scope:** Architectural pattern applied across all AI-generated actions
**Depends on:** v1-v8 + all polish passes

---

## 1. Problem statement

An AI generates an action based on state at time T. A human reviews and approves. By the time the action executes at T+Δ, the underlying state may have changed in ways that make the action wrong, embarrassing, or actively harmful.

**Concrete recurring pattern in Employ:**

| Scenario | Stale action | Impact |
|---|---|---|
| Follow-up draft generated at day 14 | Says "haven't heard back" — but a recruiter emailed since | Awkward-to-embarrassing |
| Tailored CV against job.parsedMeta v1 | JD re-parsed with new requirements | Misaligned CV downloaded |
| Discovery scored & saved | User dismissed it in another tab | Zombie application appears |
| Prep pack for tech_screen | Stage rescheduled & re-typed | Wrong prep material |
| Calendar push for scheduled stage | scheduledAt moved before push | Wrong event on calendar |
| Weekly digest at Monday 09:00 | Multiple apps status-changed since snapshot | Stale numbers in email |

Human approval alone doesn't catch these — the human approved what they saw, but the state changed underneath.

## 2. Goals and non-goals

### In scope
- Every AI-generated `documents` row stores a `stateSnapshot` in its content payload — the subset of source fields that determine correctness
- Generic staleness check util that compares snapshot vs current state per document kind
- UI: staleness banner on document views + one-click regenerate
- Server-side execution guard: 409 Conflict when write-actions attempt on stale bases
- Weekly digest gets its own late-check right before email send

### Explicitly out of scope
- Automatic re-generation on every open (too expensive; user opts in)
- Cross-user staleness (e.g., team members editing shared docs — we're single-user)
- Real-time subscriptions / websockets (poll on document open is enough for our volumes)
- Version-vector CRDTs — plain timestamp + hash comparison is sufficient

### Success criteria
- Opening a stale outreach draft shows a clear "Since generated: X changed" banner with regenerate button
- Attempting to promote a dismissed discovery returns 409 with diff summary
- Weekly digest re-runs its snapshot at send time (not at gather time) — numbers are accurate at delivery
- All existing 566 tests still pass; +15 staleness tests

## 3. Data model

### Snapshot shape in `documents.content`

Every AI-produced document (kinds: `master_cv`, `tailored_cv`, `cover_letter`, `interview_prep_pack`, `interview_debrief`, `outreach_*`, `merged_pdf`) gets a mandatory `stateSnapshot`:

```typescript
type StateSnapshot = {
  // Wall clock at generation
  capturedAt: string  // ISO
  // Kind-specific hashes of source records
  hashes: Record<string, string>  // e.g. { 'application': '<sha256 of relevant fields>', 'job': '...', 'master_cv': '...' }
  // Optional: raw fields for richer diffs (skip for large content like descriptionMd — hash only)
  fields: Record<string, unknown>
}
```

**Kind-specific snapshot builders** (`lib/staleness/snapshot.ts`):
```typescript
export function snapshotForOutreach(app: Application, job: Job, master: MasterCV): StateSnapshot
export function snapshotForTailoredCV(app: Application, job: Job, master: MasterCV): StateSnapshot
export function snapshotForPrepPack(app: Application, stage: InterviewStage, job: Job): StateSnapshot
export function snapshotForFollowup(app: Application, latestActivity: Activity | null, daysSince: number): StateSnapshot
export function snapshotForDebrief(stage: InterviewStage, app: Application, job: Job): StateSnapshot
```

Each returns hashes of the relevant fields — e.g. outreach hash = sha256 of `{applicationId, status, appliedAt, jobId, jobTitle, companyId, companyName}`.

### Migration

No new columns. `documents.content jsonb` already exists. Backfill unnecessary — pre-v9 docs simply have no `stateSnapshot`; the check util treats missing snapshots as "unknown, don't warn."

## 4. Staleness check

`lib/staleness/check.ts`:

```typescript
export type Severity = 'critical' | 'minor' | 'fresh'

export interface StalenessResult {
  severity: Severity
  changedFields: string[]  // human-readable field names
  summary: string          // "Status changed applied→interview; 1 new email since"
  currentSnapshot: StateSnapshot
  previousSnapshot: StateSnapshot | null  // null if the doc predates v9
}

export async function checkDocumentStaleness(
  userId: string,
  documentId: string,
): Promise<StalenessResult>
```

Internally dispatches by document kind, rebuilds current snapshot from live DB state, compares hashes and specific fields, applies per-kind severity rules per spec §5.

## 5. Severity rules (per kind)

- **`outreach_followup_email`:** critical if any activity of kind `email` or `status_change` newer than `capturedAt`; also critical if `application.status` differs
- **`outreach_linkedin_*` / `outreach_recruiter_reply`:** critical if `application.status` differs; minor if only `job.description_md` differs
- **`tailored_cv`:** critical if `job.parsedMeta` differs (recompute hash) or `master_cv` version changed; minor if only `job.benefits` differs
- **`cover_letter`:** same as tailored_cv
- **`interview_prep_pack`:** critical if `stage.kind` changed OR `stage.scheduledAt` moved > 6h OR stage cancelled; minor if `prep_notes_md` changed
- **`interview_debrief`:** rarely stale (post-hoc doc). Only critical if the underlying stage was deleted
- **`merged_pdf`:** critical if any component document's version increased since snapshot

## 6. UI

### Document detail views (application detail card, documents library)

When a user opens or hovers a document that would be consumed (copy button, download button):
1. Client calls `GET /api/documents/[id]/staleness` (fast, single query per source)
2. Response includes `{severity, summary}` — on `critical` or `minor`, render a banner:
   ```
   ⚠ Stale: Application status changed applied → interview since this draft was generated.
   [Regenerate] [Copy anyway] [Dismiss warning]
   ```
3. **Regenerate** triggers the appropriate generation route (POST) with the same inputs; response returns new documentId + downloadUrl
4. **Copy anyway** proceeds with the stale content but records `activity kind='stale_action_taken'` for audit
5. **Dismiss warning** hides the banner for this session (sessionStorage keyed by documentId)

### Application detail

Existing document card rows get a small badge next to the version chip:
- 🟢 `Fresh` when staleness = fresh (or no snapshot)
- 🟡 `Minor drift` when severity = minor
- 🔴 `Stale` when severity = critical

Same badge on `/documents` library rows.

## 7. Execution guards (server-side)

For every route that consumes an AI-generated document to WRITE state (not just download PDF), re-check at execution:

- `POST /api/discoveries/[id]/save` → refuse if discovery.status != 'new' at execute time (return 409 with `{conflict: 'discovery_not_new', current: '<status>'}`)
- `POST /api/stages/[id]/push-to-calendar` → refuse if `stage.googleEventId` was set since generation OR if `scheduledAt` moved > 6h (409)
- `POST /api/digest/send-now` → re-gather snapshot right before send (no separate stale-check needed — recompute pattern instead)
- Weekly digest cron: same — snapshot inside the send loop, not in a separate pass

Every 409 returns a `{conflict: <code>, message: <human>}` shape that the client toasts + surfaces link to view the current state.

## 8. Implementation phases

### Phase F1 — Snapshot infrastructure
- `lib/staleness/types.ts`, `lib/staleness/snapshot.ts`, `lib/staleness/hash.ts`
- Unit tests for hashing determinism + snapshot builders

### Phase F2 — Generator updates
- Each generator writes `stateSnapshot` into `content` at persist time
- Migrate: `lib/documents/tailor.ts`, `coverLetter.ts`, `outreach.ts`, `prep.ts`, `debrief.ts`, `merge.ts`
- Integration tests verify snapshot present in saved rows

### Phase F3 — Check util + route
- `lib/staleness/check.ts` with dispatch table per kind
- `GET /api/documents/[id]/staleness` route
- Integration tests for each kind's staleness rules

### Phase F4 — UI banner + badge
- `components/staleness-banner.tsx` — inline banner with 3 buttons
- Extend `components/documents-card.tsx`, `components/documents-table.tsx` with the freshness badge
- Client hook `useStaleness(documentId)` — fetches once on mount, cached

### Phase F5 — Server-side execution guards
- Extend save/promote/push routes with re-check logic
- Return 409 with `{conflict, message}` on drift
- Update client callers to handle 409 → toast + refresh

### Phase F6 — Digest late-check
- Weekly digest cron re-snapshots inside the send loop
- Ensures accuracy at delivery time

## 9. Testing

- Unit: hash determinism, snapshot builders (~10 tests)
- Integration: each check dispatch case + severity classification (~15 tests)
- Route tests: /staleness returns correct shape, 409 on drift for write routes (~8 tests)

Target: +30 tests, from 566 → 596+.

## 10. What "done" looks like

Live demo scenarios:
1. Generate an outreach followup at day 14
2. Simulate an inbound email activity (POST to /api/gmail/sync or add activity manually)
3. Open the draft → red banner "Since generated: 1 new email received. Regenerate?"
4. Click Regenerate → new draft acknowledges the recent email

5. Generate a tailored CV for job X
6. Re-parse the JD via a fresh URL fetch (simulate job.parsedMeta change)
7. Open the CV → yellow "Minor drift" badge; drill in shows changed fields

8. Score a discovery in cron, dismiss it in the UI
9. In another tab, attempt to click Save on the discovery → 409 with "This discovery was dismissed since scored"
