# lee v4.1 Polish Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Goal:** Close the top gaps that show up in daily use after v1-v4 shipped. No new sub-project; targeted hardening + UX affordances.

**Depends on:** v1-v4 all shipped. 266 tests passing.

**Working dir:** `employ`

## Scope

Six focused improvements, each self-contained:

1. **P1 — Timezone from user preferences** — add `user_profile.timezone`, use it everywhere times are displayed / Calendar events created / digest schedule
2. **P2 — Global command menu (⌘K)** — currently a stub. Wire real search across applications / companies / contacts / discoveries with keyboard navigation.
3. **P3 — Bulk actions on discoveries** — "Dismiss all older than 7d" + multi-select checkbox dismiss
4. **P4 — CSV export of applications** — one endpoint + download button on `/applications`
5. **P5 — Response-rate funnel widget** — dashboard card showing Applied → Screen → Interview → Offer conversion with counts
6. **P6 — Applied-at backfill** — inline date input on application cards for backfilling `applied_at` when apps were added late

---

## Phase P1 — Timezone

**Files:**
- Modify: `lib/db/schema.ts` — add `timezone` on `user_profile`, default `'Asia/Dubai'`
- Migration: `pnpm db:generate`
- Modify: `lib/calendar/service.ts` — read timezone from profile instead of hardcoded
- Modify: `lib/digest/weekly.ts` — use user's timezone for Monday check (`isMondayInTz(tz)`)
- Modify: `components/timeline.tsx`, dashboard widgets — format dates in user timezone
- Create: `lib/ui/timezone.ts` — helpers (`formatInTz`, `getUserTimezone` client-side via `Intl.DateTimeFormat().resolvedOptions().timeZone`)
- Modify: `components/profile-form.tsx` — add timezone select (populated from `Intl.supportedValuesOf('timeZone')`)

- [ ] Schema addition, migration
- [ ] `getUserTimezone` server helper reads profile, falls back to `Asia/Dubai`
- [ ] Client "auto-detect" button on profile form pre-fills browser's TZ
- [ ] `isMondayInTz(tz)` uses Intl to check Monday in that TZ
- [ ] Calendar events created with user's timezone in start.timeZone / end.timeZone

Commit: `feat(tz): per-user timezone preference + calendar/digest respect it`

## Phase P2 — Global command menu

**Files:**
- Modify: `components/command-menu-button.tsx` — replace toast stub with real dialog
- Create: `components/command-menu-dialog.tsx` — Radix-inspired command palette (or use plain shadcn Dialog with input + list)
- Create: `app/api/search/route.ts` — POST `{q}`, returns `{applications, companies, contacts, discoveries}` (max 5 each)
- Create: `lib/search/service.ts` — `search(userId, query)` — fuzzy match via SQL `ilike '%q%'` on names/titles/emails

- [ ] Global `⌘K` / `Ctrl+K` hotkey handler (`useEffect` binding in the button component)
- [ ] Dialog opens with autofocused input
- [ ] Typing triggers debounced fetch (300ms)
- [ ] Results grouped by kind, each row clickable → navigates via `router.push`
- [ ] Keyboard nav: ↑↓ to move, Enter to select, Esc to close
- [ ] Empty state / loading state

Commit: `feat(search): global ⌘K command menu`

## Phase P3 — Bulk discovery actions

**Files:**
- Modify: `components/discovery-inbox.tsx` — add multi-select checkboxes per row + bulk action bar
- Modify: `app/(authed)/discoveries/actions.ts` — add `dismissMultiple(ids: string[])`, `dismissOlderThan(days: number)`
- Modify: `lib/db/queries/discoveries.ts` — add `dismissByIds(userId, ids)`, `dismissOlderThan(userId, days)` methods

- [ ] Row checkbox appears on hover or always-visible
- [ ] Selected count + "Dismiss selected" button appears when ≥1 selected
- [ ] "Dismiss older than 7 days" one-click action at top of inbox
- [ ] Both call server actions; toast + revalidate

Commit: `feat(discovery): bulk dismiss actions`

## Phase P4 — CSV export

**Files:**
- Create: `app/api/applications/export/route.ts` — GET, returns CSV of all applications with joined job + company
- Modify: `app/(authed)/applications/page.tsx` — add "Export CSV" button in header

- [ ] CSV columns: Company, Title, Status, Source, Applied At, Location, Remote Type, Salary Min, Salary Max, Currency, Interest Level, Next Action At, Notes URL, Source URL, Added At
- [ ] Escape commas + quotes properly
- [ ] Serve as `text/csv` with `Content-Disposition: attachment; filename=employ-applications-{date}.csv`

Commit: `feat(applications): csv export`

## Phase P5 — Response-rate funnel widget

**Files:**
- Create: `components/funnel-widget.tsx`
- Modify: `app/(authed)/page.tsx` — mount widget below existing dashboard cards

- [ ] Fetches counts of applications grouped by status
- [ ] Horizontal bar: Applied → Screen → Interview → Offer, showing count + conversion % from previous stage
- [ ] Rejected + Withdrawn shown as a smaller footnote below
- [ ] Empty state: "No applications yet"

Commit: `feat(dashboard): funnel widget with conversion %`

## Phase P6 — Applied-at backfill

**Files:**
- Modify: `components/applications-table.tsx` — for status='applied' rows without applied_at, show inline "Set date" button
- Create: `app/(authed)/applications/actions.ts` (or extend existing) — `setAppliedAt(applicationId, date)` server action

- [ ] Inline date input appears next to the applied badge when applied_at is null AND status='applied' (or later stage)
- [ ] On save: server action updates applications.applied_at + logs activity
- [ ] Also show manually in detail page header if backfill needed

Commit: `feat(applications): applied-at backfill affordance`

## Verification

- `pnpm typecheck` clean
- `pnpm test` — 275+ passing (~10 new)
- `pnpm build` succeeds
- `pnpm db:migrate` against pglite:memory:// succeeds

## Push at end

```
git push origin main
```
