# lee v3 Communications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Ship v3 — Google OAuth scope expansion + Gmail read-only sync + Calendar event push + consolidated daily cron.

**Spec:** `docs/superpowers/specs/2026-09-24-employ-v3-communications-design.md`
**Depends on:** v1 + v1.5 + v2 all shipped.

**Working dir:** the repository root

---

## Phase M1 — Auth scope expansion + token helper

**Files:**
- Modify: `lib/auth/edge-config.ts` — add Gmail + Calendar scopes to Google provider
- Create: `lib/google/tokens.ts` — reads/refreshes Google tokens from accounts table
- Test: `tests/unit/google-tokens.test.ts`

- [ ] Add `authorization.params.scope` (multiline with Gmail read + Calendar events), `access_type: 'offline'`, `prompt: 'consent'`.
- [ ] `getGoogleTokens(userId)`:
  - Read from `accounts` table WHERE `userId=?` AND `provider='google'`
  - If `expires_at < now + 60s`, POST to `https://oauth2.googleapis.com/token` with grant_type=refresh_token, client_id, client_secret, refresh_token
  - Update accounts row with new access_token, expires_at
  - Return `{ accessToken, refreshToken, expiresAt }`
  - Throw `NoGoogleAccountError` if no row found
- [ ] Unit test with mocked fetch — expired token triggers refresh; fresh token passes through.

Commit: `feat(google): scope expansion + token refresh helper`

## Phase M2 — Schema deltas

**Files:**
- Modify: `lib/db/schema.ts` — add `processed_gmail_threads` table, `syncedGmailAt` / `syncedCalendarAt` on user_profile, `googleEventId` on interview_stages
- Migration: `pnpm db:generate`
- Test: `tests/integration/queries/gmail-threads.test.ts`

- [ ] Table additions per spec §3.5
- [ ] Query module `lib/db/queries/processedGmailThreads.ts` — `has(userId, threadId)`, `markProcessed(userId, threadId, matchedApplicationId?)`

Commit: `feat(db): gmail threads dedup + sync timestamps + calendar event id`

## Phase M3 — Gmail adapter + matcher

**Files:**
- Create: `lib/gmail/adapter.ts` — `listThreads`, `getThread`
- Create: `lib/gmail/matcher.ts` — deterministic match logic
- Test: `tests/unit/gmail-matcher.test.ts` (matcher, no network), `tests/unit/gmail-adapter.test.ts` (fetch mocked)

- [ ] Adapter accepts `{ tokens }` with accessToken, queries Gmail REST API
- [ ] Matcher: rules in priority order per spec §3.3
  1. Sender/recipient email ∈ contacts.email for user
  2. Sender domain ∈ companies.domain for user (linked to applications)
  3. Subject contains active job.title (case-insensitive substring)
- [ ] Unit tests with hand-crafted thread fixtures + factories for contacts/companies/jobs

Commit: `feat(gmail): adapter + deterministic matcher`

## Phase M4 — Gmail sync service

**Files:**
- Create: `lib/gmail/sync.ts` — orchestrates listThreads → match → log activity → dedup
- Test: `tests/integration/gmail-sync.test.ts`

- [ ] `syncGmail({ userId }): { checked: number; matched: number; logged: number }`
- [ ] For each thread returned by listThreads:
  - Skip if `processedGmailThreads.has(userId, threadId)`
  - Call matcher; if matched, `activities.log(userId, applicationId, 'email', payload)`
  - `processedGmailThreads.markProcessed(userId, threadId, matchedApplicationId?)`
- [ ] Update `userProfile.syncedGmailAt = now()` at end
- [ ] Integration test with mocked adapter + factories

Commit: `feat(gmail): sync service with dedup + activity logging`

## Phase M5 — Calendar adapter + service

**Files:**
- Create: `lib/calendar/adapter.ts` — `createEvent`, `updateEvent`, `deleteEvent`
- Create: `lib/calendar/service.ts` — `pushStageToCalendar`, `updateStageEvent`, `deleteStageEvent`
- Test: `tests/unit/calendar-adapter.test.ts`, `tests/integration/calendar-service.test.ts`

- [ ] Adapter hits Google Calendar API v3, primary calendar. Event body from spec §3.4.
- [ ] Service reads interview_stage + application + job + company, constructs event, calls adapter, saves eventId on stage row
- [ ] Handle timezone: use `Asia/Dubai` as fallback; longer-term should read from user_profile or browser (defer to v3.1)

Commit: `feat(calendar): adapter + push service`

## Phase M6 — Hook into stages service

**Files:**
- Modify: `lib/stages/service.ts` — auto-push on create if scheduledAt + user has calendar scope; auto-update on stage update; auto-delete on cancel/delete

- [ ] `createStage` — after DB insert, if `scheduledAt` set, try `pushStageToCalendar` (best-effort; log + continue on error, don't fail the stage save)
- [ ] `updateStage` — if `scheduledAt` changed, call `updateStageEvent` if `googleEventId` exists, else `pushStageToCalendar`
- [ ] `cancelStage` (or set status='cancelled') — call `deleteStageEvent` if `googleEventId` exists
- [ ] Integration test verifying stage save still succeeds when calendar push fails

Commit: `feat(stages): auto-push to google calendar`

## Phase M7 — Manual sync routes

**Files:**
- Create: `app/api/gmail/sync/route.ts` — POST, calls syncGmail
- Create: `app/api/stages/[id]/push-to-calendar/route.ts` — POST manual push
- Create: `app/api/stages/[id]/remove-from-calendar/route.ts` — DELETE

Standard pattern: auth check, call service, return JSON `{success} | {error}`. `runtime='nodejs'`, `dynamic='force-dynamic'`, `maxDuration=30`.

Commit: `feat(api): manual gmail + calendar sync routes`

## Phase M8 — Cron consolidation

**Files:**
- Create: `app/api/cron/sync-all/route.ts`
- Modify: `vercel.json` — replace discover cron with sync-all
- Deprecate: `app/api/cron/discover/route.ts` — mark as still working but not scheduled; keep for manual runs

- [ ] `sync-all` endpoint: for each user, run discovery + gmail sync + reminder check sequentially; log totals
- [ ] Timeout consideration: on Hobby, may hit 10s cap with many users. Single-user is fine.

Commit: `chore(cron): consolidate discover + gmail + reminders into sync-all`

## Phase M9 — Settings integrations UI

**Files:**
- Create: `app/(authed)/settings/integrations/page.tsx`, `actions.ts`, `components/integrations-panel.tsx`
- Modify: `components/sidebar.tsx` — add "Integrations" under Personal group

- [ ] Card for Google account: email + scopes granted + last Gmail sync + last Calendar sync + "Sync now" buttons + "Reconnect" button that signs out and back in
- [ ] Sync-now buttons hit the manual sync routes; toast on completion

Commit: `feat(ui): integrations settings page`

## Phase M10 — Application detail: email activities + calendar push

**Files:**
- Modify: `components/timeline.tsx` — recognize `activity.kind === 'email'` and render distinctively (mail icon, from address, subject, snippet)
- Modify: `components/stage-list.tsx` — add "Push to calendar" or "In Calendar" indicator per stage; button toggles

- [ ] Timeline row for email: Mail icon + `From: {email}` + subject in bold + snippet muted
- [ ] Stage row: if `googleEventId` present, show green check + "In Calendar" text; if absent + user has calendar scope, show "Push to calendar" button

Commit: `feat(ui): email timeline + calendar push toggle`

## Phase M11 — Dashboard sync status widget

**Files:**
- Create: `components/sync-status.tsx`
- Modify: `app/(authed)/page.tsx` — mount widget between Needs Attention and Kanban

- [ ] Reads `user_profile.syncedGmailAt`, counts activities of kind='email' from last 24h, counts stale applications
- [ ] Compact: "Synced 2h ago · 3 new emails today · 2 need follow-up"
- [ ] Fallback: "Not connected — grant Gmail access at Settings → Integrations"

Commit: `feat(ui): dashboard sync status widget`

## Verification

- `pnpm typecheck` clean
- `pnpm test` — 200+ passing (~15-20 new tests)
- `pnpm build` succeeds
- Manual smoke test after deploy:
  1. Sign out; sign in (see new consent screen for Gmail + Calendar)
  2. Add a contact with your test recruiter email to an application
  3. Send yourself an email from that address
  4. `/settings/integrations` → Sync now → see email land on the app timeline
  5. Add interview stage with a future date → check Google Calendar for the event

## Push cadence

Per-phase commits. Push at end of each phase or batch. Vercel auto-deploys.
