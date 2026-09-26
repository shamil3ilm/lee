# lee — v3 Communications Design Spec

**Date:** 2026-09-24
**Status:** Approved — ready for implementation planning
**Scope:** Sub-project 3 of 5 in the lee roadmap
**Depends on:** v1 + v1.5 + v2 (all shipped)

---

## 1. Overview

v3 wires Gmail and Google Calendar into the tracker. Emails matching known contacts/companies auto-log to the application timeline; interview stages can push events to your calendar; a follow-up nudge surfaces stale threads. Everything runs off the same Google OAuth account you sign in with — no extra credentials.

## 2. Goals and non-goals

### In scope
- Extend Auth.js Google provider to request `gmail.readonly` + `calendar.events` scopes
- Persist refresh_token so background sync survives session expiry
- Gmail sync: pull last-30-days threads, match to applications, log matched threads as `activity` rows
- Calendar push: when creating/updating an interview_stage with `scheduledAt`, create a Google Calendar event; store event id
- Manual "Sync inbox" and "Push to Calendar" buttons on Settings + application detail
- Sync-status widget on dashboard: last sync time + counts (matched today, unmatched pending)
- Reincorporate `/api/cron/reminders` into the daily cron (share the slot with discover via a single "sync-all" cron)

### Explicitly out of scope
- Sending email from the app (v3 is read-only for Gmail)
- Calendar reverse-sync (detect interviews FROM calendar events) — v3.1 polish
- iCal file export
- Slack / Teams / Discord — never planned
- Draft replies (v4 territory)

### Success criteria
- Sign in with Google (existing flow) prompts for the new scopes on first authorization
- Trigger "Sync inbox" → within 10s, matched emails appear as activities on relevant applications
- Add an interview stage with a `scheduledAt` → event lands on Google Calendar within 3s
- Daily cron polls once, syncs both discovery + email + reminders in a single run

## 3. Architecture

### 3.1 Scopes and tokens

Update `lib/auth/edge-config.ts` (and thus full config):
```typescript
Google({
  clientId: env.AUTH_GOOGLE_ID,
  clientSecret: env.AUTH_GOOGLE_SECRET,
  authorization: {
    params: {
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.events',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',   // ensure refresh_token is returned
    },
  },
})
```

Auth.js's DrizzleAdapter already stores `accounts.access_token`, `refresh_token`, `expires_at`. On first login after the scope change, user must re-consent (Google returns a fresh refresh_token only with `prompt=consent`).

### 3.2 Token access helper

`lib/google/tokens.ts`:
```typescript
export async function getGoogleTokens(userId: string): Promise<GoogleTokens>
```
Reads from `accounts` table (`WHERE userId = ? AND provider = 'google'`). If `expires_at <= now`, refresh via Google OAuth token endpoint using `refresh_token`, then write new access_token + expires_at back.

### 3.3 Gmail sync

`lib/gmail/adapter.ts`:
- `listThreads({tokens, since}): GmailThread[]` — hits `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=newer_than:30d&maxResults=100`
- `getThread({tokens, threadId}): GmailThreadFull` — full messages of a thread

`lib/gmail/matcher.ts`:
- `matchThreadToApplication({ thread, userId }): { applicationId: string; reason: string } | null`
- Match rules (in priority order):
  1. Thread involves an email address in `contacts.email` for one of the user's applications → that application
  2. Thread's `From` domain matches a `companies.domain` linked to an application → that application
  3. Thread's subject contains a `jobs.title` for an active application → that application
  4. No match → skip (leave for user to link manually later)

`lib/gmail/sync.ts`:
- `syncGmail({ userId, ai }): SyncResult`
  - Fetch tokens
  - `listThreads` with `since = user_profile.syncedGmailAt ?? 30 days ago`
  - For each thread not already in `processed_gmail_threads`:
    - Match via `matcher`
    - If matched, log activity kind='email' payload={threadId, from, subject, snippet, matchReason}
    - Insert into `processed_gmail_threads` regardless (dedup)
  - Update `user_profile.syncedGmailAt = now()`

### 3.4 Calendar push

`lib/calendar/adapter.ts`:
- `createEvent({tokens, event}): { eventId }` — POST to `https://www.googleapis.com/calendar/v3/calendars/primary/events` with `summary`, `description`, `start`, `end`, `location`, `attendees`
- `updateEvent({tokens, eventId, event})` — PATCH
- `deleteEvent({tokens, eventId})` — DELETE

`lib/calendar/service.ts`:
- `pushStageToCalendar({ userId, stageId }): { eventId }` — reads interview_stage + application + job, builds event summary like `"Interview: {job.title} @ {company.name}"`, calls adapter.createEvent, saves `eventId` back on interview_stage row
- `updateStageEvent({ userId, stageId })` — patches Google event when stage is updated (scheduledAt, meetingUrl, etc.)
- `deleteStageEvent({ userId, stageId })` — deletes Google event when stage is cancelled

Auto-push hook: modify `lib/stages/service.ts:createStage` — if the new stage has `scheduledAt` set AND user's Google account has calendar scope, push to calendar automatically. Failure is non-blocking (log + toast, but stage is still saved locally).

### 3.5 Schema deltas

Two new tables + additions to existing:

```sql
-- Dedup for Gmail sync — one row per processed thread id.
create table processed_gmail_threads (
  user_id                uuid not null references users(id) on delete cascade,
  thread_id              text not null,
  matched_application_id uuid references applications(id) on delete set null,
  processed_at           timestamptz not null default now(),
  primary key (user_id, thread_id)
);

-- Track sync state per user (extends user_profile).
alter table user_profile add column synced_gmail_at    timestamptz;
alter table user_profile add column synced_calendar_at timestamptz;

-- Track calendar event id on interview stages.
alter table interview_stages add column google_event_id text;
```

### 3.6 Cron consolidation

Replace `vercel.json` cron entry to run `/api/cron/sync-all` daily at 09:00 UTC:
```json
{ "path": "/api/cron/sync-all", "schedule": "0 9 * * *" }
```

New endpoint `/api/cron/sync-all/route.ts`:
1. Auth via `CRON_SECRET`
2. For each user:
   a. Run discovery cycle
   b. Run Gmail sync
   c. Run reminder check (log activity for stale next_action_at)
3. Return totals

Keeps the Hobby 1-cron limit intact while ferrying all three background jobs.

## 4. UI

### `/settings/integrations` — new page
- Card per integration: Google account (email displayed), scopes granted (list), last sync time, "Sync now" button per integration
- "Reconnect" button if scopes need re-consent

### `/settings/sidebar`
- Add "Integrations" nav entry under Personal group

### Dashboard
- Add compact sync-status widget: "Last synced 2h ago · 3 new emails matched · 1 needs follow-up"

### Application detail
- Existing timeline: show `activity.kind='email'` items with mail icon, expand shows snippet
- "Push to calendar" button on each interview stage row (or auto-push toggle in settings)

### Signin
- No change; Google consent screen automatically shows new scopes on first re-login after v3 deploys. Existing users must sign out and back in to grant Gmail/Calendar access.

## 5. Testing

- Unit test `lib/gmail/matcher.ts` with fixtures — match by contact, by domain, by title, no match
- Unit test `lib/google/tokens.ts` — refresh flow with mocked fetch
- Integration test `lib/gmail/sync.ts` — mocked adapter + factories → assert activities logged + dedup works
- Integration test `lib/calendar/service.ts:pushStageToCalendar` — mocked adapter → assert event id saved
- E2E stays golden path only; real Google APIs not exercised in CI

## 6. Cost + rate limits

- Gmail API: 1B quota units/day free. Each `threads.list` = 5 units, `threads.get` = 10 units. 100 threads/sync = 1005 units. Room for thousands of syncs/day.
- Calendar API: 1M queries/day free. Trivial.
- No AI cost bump — matching is deterministic, no LLM calls (v3.1 could add AI-based match confidence scoring).

## 7. Migration path for existing user

On first deploy of v3:
1. Existing users signed in via old scopes still work for the app (no Gmail/Calendar until re-consent)
2. Prompt on dashboard: "Grant Gmail + Calendar access to enable email + interview sync — [Reconnect Google]"
3. Reconnect button signs out + signs back in with new scopes

## 8. What "done" looks like for v3

Live demo:
1. Sign out → sign in — see new Gmail/Calendar consent screen
2. Add a contact with your recruiter's email to any application
3. `/settings/integrations` → "Sync now" — matched email from recruiter appears as activity on application within 5s
4. Add an interview stage with `scheduledAt = tomorrow 3pm` — event appears on Google Calendar
5. Delete the stage — event disappears from Calendar
6. Cron endpoint runs once, syncs discovery + gmail + reminders in one call
