# lee — v6 Analytics Design Spec

**Date:** 2026-09-25
**Status:** Approved — ready for implementation
**Scope:** Sub-project 6 of 6+ in the lee roadmap
**Depends on:** v1-v5 all shipped, real data in the pipeline

---

## 1. Overview

v6 turns accumulated tracking data into insight: which sources give the best conversion, how long typical response cycles are, whether the AI discovery scoring actually predicts outcomes, weekly/monthly activity trends, time-to-offer distributions. Every chart is a query the user is already asking mentally when they open the app.

## 2. Goals and non-goals

### In scope
- **Analytics dashboard** at `/analytics` — six insight cards
- **Source performance card** — for each source of applications (linkedin/referral/company_page/job_board/discovery/etc.), show funnel Applied → Screen → Interview → Offer counts + conversion %
- **Response time card** — histogram of days between applied_at and first activity kind='email' or 'status_change' to screen/interview
- **Time-to-outcome card** — median/p90 days from applied_at to offer OR rejected
- **Discovery calibration card** — scatter of match_score vs actual outcome (saved → applied → offered), tests whether high match scores predict good outcomes
- **Activity trends card** — bar chart of applications created per week over last 3 months
- **Status distribution card** — pie/donut of current pipeline breakdown
- Chart library: **shadcn/charts** (built on recharts) — matches design system
- CSV export of raw analytics data per card

### Explicitly out of scope
- Predictive ML (already covered by v1.5 AI matching)
- Cohort analysis
- A/B testing infrastructure
- Multi-user analytics (single user only)
- Cost/budget analytics for AI usage (later polish)

### Success criteria
- Open `/analytics` → see all six cards render in <2s
- Each chart interactive (hover tooltips, click to filter)
- Insights are answerable from a glance: "referrals convert 3× better than LinkedIn"; "median time to offer is 42 days"
- Charts empty-state cleanly when data is sparse (e.g., <5 applications)

## 3. Data model

**No schema changes.** All charts derive from existing tables:
- `applications` (status, applied_at, source, created_at)
- `activities` (kind, created_at, application_id)
- `discoveries` (match_score, status, created_at, saved_application_id)
- `interview_stages` (scheduled_at, status, outcome, application_id)

## 4. Analytics service

`lib/analytics/service.ts` — pure query functions:

```typescript
export async function sourceFunnel(userId: string): Promise<SourceFunnelRow[]>
export async function responseTimeDistribution(userId: string): Promise<ResponseTimeBucket[]>
export async function timeToOutcome(userId: string): Promise<TimeToOutcomeStats>
export async function discoveryCalibration(userId: string): Promise<CalibrationPoint[]>
export async function weeklyActivity(userId: string, weeks: number): Promise<WeeklyBar[]>
export async function statusDistribution(userId: string): Promise<StatusSlice[]>
```

Each does one SQL aggregation with `GROUP BY` and `WHERE user_id = ?`. Return typed rows.

Shapes:
```typescript
interface SourceFunnelRow {
  source: string
  applied: number
  screened: number      // status in ('screen','interview','offer')
  interviewed: number   // status in ('interview','offer')
  offered: number       // status='offer'
  rejected: number
}

interface ResponseTimeBucket {
  bucketDays: string    // '0-3', '4-7', '8-14', '15-30', '30+'
  count: number
}

interface TimeToOutcomeStats {
  offer: { median: number; p90: number; count: number }
  rejection: { median: number; p90: number; count: number }
}

interface CalibrationPoint {
  matchScore: number
  outcome: 'saved' | 'applied' | 'interviewed' | 'offered' | 'rejected' | 'dismissed'
  count: number        // dot size in scatter plot
}

interface WeeklyBar {
  weekStart: string    // ISO date of Monday
  count: number
}

interface StatusSlice {
  status: string
  count: number
}
```

## 5. UI

### `/analytics` page

Grid layout, one card per metric. Cards are RSC that render server-computed data + a client child for the interactive chart.

Card headers show:
- Title
- Small "?" tooltip with what the chart means
- CSV export button (downloads raw data as CSV)
- Empty state: "Not enough data yet — need at least N applications" (per-card N threshold)

### Sidebar

Add "Analytics" nav entry under Pipeline group (between Dashboard and Applications), icon `BarChart3`.

## 6. Charts library

Install:
```bash
pnpm add recharts
pnpm dlx shadcn@latest add chart
```

If shadcn CLI fails (v5 hand-wrote components due to Tailwind 4 incompatibility), hand-copy `components/ui/chart.tsx` from shadcn's source.

## 7. Testing

- Unit tests for each service function using factories to seed known data, assert exact aggregation output
- Snapshot tests skipped for charts (recharts renders SVG; component tests brittle)

## 8. What "done" looks like

Live at `/analytics`:
1. Sign in with real data (say, 50+ applications tracked over months)
2. Six cards render with populated charts
3. Hover tooltips show details
4. Click "Export CSV" on any card → raw data downloads
5. Empty states graceful when charts have <5 data points
