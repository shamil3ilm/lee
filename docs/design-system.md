# lee design system

The look of **lee** comes from its logo (`app/icon.svg`, `components/brand/logo.tsx`):
a navy tile with a slate-blue glyph of a head resting in an open arc. The
system keeps that mood (calm, supportive, professional) and its shape
language: a rounded tile (corner radius about 22% of its size), round stroke
caps, arcs and circles.

Source of truth: `app/globals.css` (tokens), `lib/ui/tones.ts` (status colour
vocabulary), `lib/ui/chart-palette.ts` (charts). Contrast is enforced by
`tests/unit/design-tokens.test.ts`: change a token, run `pnpm test`.

## Brand anchors

| Name | Hex | HSL | Role |
|---|---|---|---|
| Tile navy | `#1A2B4C` | `220 49% 20%` | `--primary` in light mode, `--brand-navy`, overlays |
| Glyph slate-blue | `#A9BCD6` | `215 35% 75%` | `--primary` in dark mode, `--brand-slate`, tints |

The favicon, logo and wordmark are fixed; never recolour them.

## Tokens

All colours are bare HSL triples on `:root` (light) and `.dark`, exposed to
Tailwind through `@theme inline`, so `bg-primary`, `text-muted-foreground`,
`bg-success-soft`, `border-danger/30` and `hsl(var(--info))` all work.

### Surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `220 33% 98%` | `222 40% 7%` | page |
| `foreground` | `220 45% 13%` | `214 32% 92%` | body text |
| `card` / `popover` | `0 0% 100%` | `222 36% 10%` | raised surfaces, inputs |
| `primary` | `220 49% 20%` (navy) | `215 35% 75%` (slate-blue) | primary actions, links, tooltips |
| `primary-foreground` | white | `220 49% 14%` | text on primary |
| `secondary` | `216 36% 93%` | `220 30% 17%` | secondary buttons, chips |
| `muted` | `216 30% 94.5%` | `221 30% 14%` | wells, table headers, board columns |
| `muted-foreground` | `219 17% 38%` | `216 18% 68%` | secondary text |
| `accent` | `215 42% 91%` | `219 32% 20%` | hover/selected rows, menus, drop targets |
| `destructive` | `356 66% 43%` | `356 80% 72%` | delete / irreversible |
| `border` / `input` | `216 26% 87%` / `216 22% 78%` | `220 26% 20%` / `220 22% 30%` | hairlines / control borders |
| `ring` | `216 52% 44%` | `215 45% 66%` | the focus ring |
| `skeleton` | `215 35% 90%` | `220 28% 18%` | loading placeholders |

### Status and semantic palette

Every tone has three tokens: `--x` (strong: text, icons, solid fills),
`--x-foreground` (text on a solid `--x`) and `--x-soft` (tinted surface for
badges, callouts, column headers). Always pair **soft surface + strong text**
or **solid + foreground**, never strong text on a solid of the same tone.

| Tone | Meaning | Used by |
|---|---|---|
| `success` | done, healthy, safe | offer, todo done, scam "safe", cv grade 85+, quota OK, contact referral |
| `warning` | needs attention, waiting | todo waiting, scam "caution", cv grade 50 to 74, over a WIP limit, near budget |
| `danger` | failed, risky, overdue | rejected, overdue todos, "likely scam", cv grade below 50, over budget |
| `info` | in motion, informative | applied, todo in progress, new discoveries, scheduled stages |
| `neutral` | parked, inactive | to-do, dismissed, cancelled, minor severity |

Pipeline stages form a cool arc from slate through the brand blue to violet,
ending in the semantic outcomes:

| Stage | Token | Light strong | Dark strong |
|---|---|---|---|
| Saved | `stage-saved` | `217 22% 36%` | `216 22% 72%` |
| Applied | `stage-applied` | `214 62% 36%` | `214 70% 74%` |
| Screen | `stage-screen` | `191 70% 26%` | `188 55% 62%` |
| Interview | `stage-interview` | `250 42% 44%` | `250 70% 80%` |
| Offer | `stage-offer` (= success) | `152 58% 26%` | `150 45% 62%` |
| Rejected | `stage-rejected` (= danger) | `356 66% 40%` | `356 80% 74%` |
| Withdrawn | `stage-withdrawn` | `220 9% 38%` | `220 10% 66%` |

In code, pick a `Tone` and use the maps in `lib/ui/tones.ts`:
`TONE_TEXT`, `TONE_SOFT`, `TONE_BG`, `TONE_BORDER`, and `toneColor(tone)` for
SVG/recharts. `STATUS_TONE` (lib/ui/status.ts) maps application statuses to
their stage tone; `<Badge variant="interview">` renders the same colours.

### Contrast (WCAG 2.2 AA)

Text pairs need 4.5:1. The focus ring and chart marks (non-text graphics)
need 3:1 against the card surface. The numbers below are computed from the
tokens and re-checked on every test run.

| Pair | Light | Dark | Min |
|---|---:|---:|---:|
| `foreground` on `background` | 16.16 | 15.79 | 4.5 |
| `foreground` on `card` | 16.98 | 14.92 | 4.5 |
| `muted-foreground` on `background` | 6.42 | 8.19 | 4.5 |
| `muted-foreground` on `card` | 6.74 | 7.74 | 4.5 |
| `muted-foreground` on `muted` | 5.91 | 6.99 | 4.5 |
| `primary-foreground` on `primary` | 14.1 | 8.56 | 4.5 |
| `primary` on `background` | 13.43 | 9.86 | 4.5 |
| `primary` on `card` | 14.1 | 9.32 | 4.5 |
| `secondary-foreground` on `secondary` | 11.87 | 12.33 | 4.5 |
| `accent-foreground` on `accent` | 11.26 | 11.78 | 4.5 |
| `destructive-foreground` on `destructive` | 6.37 | 6.79 | 4.5 |
| `destructive` on `background` | 6.06 | 7.37 | 4.5 |
| `destructive` on `card` | 6.37 | 6.97 | 4.5 |
| `popover-foreground` on `popover` | 16.98 | 14.92 | 4.5 |
| `card-foreground` on `card` | 16.98 | 14.92 | 4.5 |
| `foreground` on `muted` | 14.87 | 13.47 | 4.5 |
| `success` on `background` | 6.36 | 9.7 | 4.5 |
| `success` on `card` | 6.68 | 9.17 | 4.5 |
| `success` on `success-soft` | 5.81 | 7.14 | 4.5 |
| `success-foreground` on `success` | 6.68 | 7.92 | 4.5 |
| `warning` on `background` | 6.19 | 10.36 | 4.5 |
| `warning` on `card` | 6.51 | 9.79 | 4.5 |
| `warning` on `warning-soft` | 5.69 | 7.94 | 4.5 |
| `warning-foreground` on `warning` | 6.51 | 8.92 | 4.5 |
| `danger` on `background` | 6.74 | 7.9 | 4.5 |
| `danger` on `card` | 7.08 | 7.47 | 4.5 |
| `danger` on `danger-soft` | 6.07 | 6.54 | 4.5 |
| `danger-foreground` on `danger` | 7.08 | 7.28 | 4.5 |
| `info` on `background` | 7.2 | 9.2 | 4.5 |
| `info` on `card` | 7.56 | 8.7 | 4.5 |
| `info` on `info-soft` | 6.49 | 7.14 | 4.5 |
| `info-foreground` on `info` | 7.56 | 8.44 | 4.5 |
| `neutral` on `background` | 6.89 | 8.71 | 4.5 |
| `neutral` on `card` | 7.23 | 8.23 | 4.5 |
| `neutral` on `neutral-soft` | 6.12 | 6.7 | 4.5 |
| `neutral-foreground` on `neutral` | 7.23 | 8.22 | 4.5 |
| `stage-saved` on `background` | 6.96 | 9.17 | 4.5 |
| `stage-saved` on `card` | 7.31 | 8.67 | 4.5 |
| `stage-saved` on `stage-saved-soft` | 6.18 | 7.09 | 4.5 |
| `stage-saved-foreground` on `stage-saved` | 7.31 | 8.66 | 4.5 |
| `stage-applied` on `background` | 7.2 | 9.2 | 4.5 |
| `stage-applied` on `card` | 7.56 | 8.7 | 4.5 |
| `stage-applied` on `stage-applied-soft` | 6.49 | 7.14 | 4.5 |
| `stage-applied-foreground` on `stage-applied` | 7.56 | 8.44 | 4.5 |
| `stage-screen` on `background` | 6.83 | 9.62 | 4.5 |
| `stage-screen` on `card` | 7.17 | 9.09 | 4.5 |
| `stage-screen` on `stage-screen-soft` | 6.19 | 7.27 | 4.5 |
| `stage-screen-foreground` on `stage-screen` | 7.17 | 8.15 | 4.5 |
| `stage-interview` on `background` | 7.66 | 8.96 | 4.5 |
| `stage-interview` on `card` | 8.05 | 8.47 | 4.5 |
| `stage-interview` on `stage-interview-soft` | 6.89 | 7.09 | 4.5 |
| `stage-interview-foreground` on `stage-interview` | 8.05 | 8.18 | 4.5 |
| `stage-offer` on `background` | 6.36 | 9.7 | 4.5 |
| `stage-offer` on `card` | 6.68 | 9.17 | 4.5 |
| `stage-offer` on `stage-offer-soft` | 5.81 | 7.14 | 4.5 |
| `stage-offer-foreground` on `stage-offer` | 6.68 | 7.92 | 4.5 |
| `stage-rejected` on `background` | 6.74 | 7.9 | 4.5 |
| `stage-rejected` on `card` | 7.08 | 7.47 | 4.5 |
| `stage-rejected` on `stage-rejected-soft` | 6.07 | 6.54 | 4.5 |
| `stage-rejected-foreground` on `stage-rejected` | 7.08 | 7.28 | 4.5 |
| `stage-withdrawn` on `background` | 6.2 | 7.78 | 4.5 |
| `stage-withdrawn` on `card` | 6.51 | 7.36 | 4.5 |
| `stage-withdrawn` on `stage-withdrawn-soft` | 5.53 | 5.88 | 4.5 |
| `stage-withdrawn-foreground` on `stage-withdrawn` | 6.51 | 7.3 | 4.5 |
| `ring` on `background` | 5.58 | 7.29 | 3.0 |
| `ring` on `card` | 5.86 | 6.89 | 3.0 |
| `chart-1` on `card` | 6.74 | 7.18 | 3.0 |
| `chart-2` on `card` | 5.55 | 7.98 | 3.0 |
| `chart-3` on `card` | 6.05 | 7.29 | 3.0 |
| `chart-4` on `card` | 5.22 | 8.04 | 3.0 |
| `chart-5` on `card` | 4.33 | 9.48 | 3.0 |
| `chart-6` on `card` | 5.81 | 6.73 | 3.0 |
| `chart-7` on `card` | 4.38 | 5.98 | 3.0 |
| `chart-8` on `card` | 14.1 | 11.4 | 3.0 |
| `chart-seq-1` on `card` | 3.51 | 3.42 | 3.0 |
| `chart-seq-2` on `card` | 4.29 | 3.58 | 3.0 |
| `chart-seq-3` on `card` | 6.52 | 5.61 | 3.0 |
| `chart-seq-4` on `card` | 10.02 | 8.49 | 3.0 |
| `chart-seq-5` on `card` | 14.1 | 12.08 | 3.0 |

## Radius

`--radius: 0.75rem` (12px). The scale steps in 4px so corners stay in the
logo tile's proportion (about 22% of a 36px control):

| Class | Value | Use |
|---|---|---|
| `rounded-sm` | 6px | menu items, tiny chips |
| `rounded-md` | 8px | buttons, inputs, selects, badges, tabs |
| `rounded-lg` | 12px (`--radius`) | panels, board columns and cards, popovers |
| `rounded-xl` | 16px | `Card`, dialogs, empty states |
| `rounded-full` | n/a | status dots, avatars, the logo's circle |

## Spacing

Tailwind's 4px scale. Page sections `space-y-6`; card padding `p-6`
(`CardContent` `pt-0` after a header); list rows `px-3 py-2`; board columns
`gap-3`, cards inside `gap-2 p-2`, card body `p-3`. The page gutter comes from
the authed layout; do not add horizontal padding inside pages.

## Typography

System UI stack (`--font-sans`), antialiased.

| Role | Classes |
|---|---|
| Page title (h1) | `text-2xl font-semibold tracking-tight` (via `PageHeader`) |
| Section title | `text-sm font-semibold`, or `text-sm font-semibold uppercase tracking-wider text-muted-foreground` |
| Card title | `CardTitle` (`text-sm font-semibold leading-snug tracking-tight`); do not restyle per card |
| Body | `text-sm` |
| Meta / helper | `text-xs text-muted-foreground` |
| Micro labels (badges, counts) | `text-[11px]` / `text-[10px] font-medium`, never below 10px |
| Numbers in tables and counters | add `tabular-nums` |

## Charts

`lib/ui/chart-palette.ts`, backed by `--chart-*` tokens (theme-aware):

- **Categorical** `CHART_CATEGORICAL` / `categorical(i)`: 8 distinct series
  (brand blue, teal, violet, green, amber, rose, slate, navy). Repeats after 8.
- **Sequential** `CHART_SEQUENTIAL`: 5 steps from light slate-blue to the
  logo navy (brightness reversed in dark mode) for one measure over buckets.
- `CHART_PRIMARY` for single-series charts, `CHART_MUTED` for a comparison
  series (e.g. previous month).
- Status-coded series (pipeline statuses, over/under budget, proceeded or
  skipped) use `toneColor()` so charts agree with badges and board columns.
- Pass colours through `ChartContainer`'s `config` and reference them as
  `var(--color-<key>)`; never hard-code `hsl(...)` in a chart.

### Chart defaults

Every Recharts chart spreads the shared defaults from
`components/ui/chart-defaults.tsx` instead of hand-tuning margins and axis
widths (hand-tuned negative margins are what clipped y-axis labels):

| Export | What it does |
|---|---|
| `CHART_MARGIN` | Plot margin, never negative. `CHART_MARGIN_LABELLED` adds top room for `LabelList position="top"`. |
| `VALUE_AXIS` | Numeric axis; `width: 'auto'` sizes it to its widest tick ("$0.002", "80K"). |
| `TIME_AXIS` | Dates and weeks; thins ticks (`preserveStartEnd`, `minTickGap`) so they never collide. |
| `CATEGORY_AXIS` | Category x-axis: every category labelled (`interval: 0`), humanised, and truncated to the width of its band by `CategoryTick` (full text in the tick's title). |
| `CATEGORY_Y_AXIS` | Category y-axis for horizontal bars (vendors): every row labelled, auto width. |
| `LEGEND_PROPS` | Legend below the plot, centred. |
| `formatCompactNumber` | `1200` → `1.2k` for count axes. |
| `VALUE_X_AXIS` | Numeric x-axis for horizontal bars, with 16px right padding so the last tick ("100K") is never clipped. |
| `lineProps(n)` | Spread on every `<Line>`: always `type="linear"`, with a dot on each point below `SHORT_SERIES_POINTS` (6). |
| `hasEnoughForStats(n)` / `MIN_STAT_POINTS` | `false` below 5 points: show no median, percentile or average. |
| `orderByDomain(keys, order)` | Series, stacks and legends in domain order (e.g. `APPLICATION_STATUSES`), never alphabetical. |
| `ChartNotEnoughData` | "Not enough data yet" panel on the muted surface, with an optional hint ("3 outcomes so far. A median needs 5."). |

`ChartContainer` wraps the chart in a responsive container that fills its
parent (give the parent a fixed height, e.g. the analytics card's `h-56`).
For pies and donuts pass the legend as HTML through `legend`, so the ring is
sized to the space left and the legend can wrap without covering it.
Tooltips and legends humanise keys that have no `config` label.

```tsx
<ChartContainer config={CONFIG} className="h-full w-full">
  <BarChart data={data} margin={CHART_MARGIN}>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="kind" {...CATEGORY_AXIS} />
    <YAxis {...VALUE_AXIS} allowDecimals={false} />
    <ChartTooltip content={<ChartTooltipContent />} />
    <ChartLegend {...LEGEND_PROPS} content={<ChartLegendContent />} />
    <Bar dataKey="count" fill="var(--color-count)" radius={[2, 2, 0, 0]} />
  </BarChart>
</ChartContainer>

// Donut: HTML legend below the plot.
<ChartContainer
  config={config}
  className="h-full w-full"
  legend={<ChartLegendContent payload={data.map((d) => ({ value: d.status, color: d.fill }))} />}
>
  <PieChart>
    <Pie data={data} dataKey="count" nameKey="status" innerRadius="55%" outerRadius="90%" />
  </PieChart>
</ChartContainer>
```

### Chart choice rules

- No radar chart beyond 6 axes and no pie or donut beyond 5 slices: use
  sorted horizontal bars (`CATEGORY_Y_AXIS` plus `VALUE_X_AXIS`, value
  labels at the end of each bar).
- Lines are never smoothed: spread `lineProps(points.length)`.
- No median, percentile or other statistic below 5 data points
  (`hasEnoughForStats`); show `ChartNotEnoughData` or "Not enough … yet"
  with the count so far.
- Every chart with more than one series has a legend
  (`<ChartLegend {...LEGEND_PROPS} content={<ChartLegendContent />} />`).
- Series, stacks and legends follow domain order (`orderByDomain`).
- Sparklines need at least 3 points; chart dates go through `shortDay`.

Non-chart analytics cards (lists, heatmaps) pass `body="content"` to
`AnalyticsCardShell` so they grow to their natural height instead of being
cut off at the card edge.

## Components

| Primitive | Rules |
|---|---|
| `Button` | `default` for the one primary action per view; `outline` for secondary; `ghost` for icon buttons and toolbars; `destructive` only for irreversible actions (behind `ConfirmDialog`). |
| `Card` | `rounded-xl`, `data-slot="card"`. One topic per card; title `text-sm font-semibold`. |
| `Badge` | Status uses tone variants (`success`, `warning`, `danger`, `info`, `neutral`, stage names). Tags use `outline` or `secondary`. The legacy colour names are aliases; don't use them in new code. |
| `Input`, `Textarea`, `Select` | Card-coloured field, `border-input`, shared focus ring. Always paired with a `Label`. |
| `Checkbox` | Selection and opt-ins. Never a native unstyled `<input type="checkbox">`. See "Checkbox and Switch" below. |
| `Switch` | An "enabled" setting that applies at once. No "On"/"Off" text beside it. |
| `Tabs` | Muted track, active tab on the card surface. Route-backed tabs use `RouteTabs`. |
| `Dialog`, `Sheet` | Navy-tinted overlay, card surface, `rounded-xl` dialogs. Destructive confirmations use `ConfirmDialog`. |
| `Table` | `components/ui/table.tsx`; the wrapper scrolls horizontally on phones so pages never scroll sideways. |
| `Tooltip` | Primary surface, short text only; never the only way to reach information. |
| `Skeleton` | `bg-skeleton` pulse, shaped like the content it replaces. |
| `EmptyState` | Every empty list, table, card and board column uses it (or the board's column empty slot): brand illustration (logo arc + circle), one-line title, optional hint and one action. `size="sm"` inside cards. |
| `PageHeader` | Every page starts with it: title, one-line description, actions on the right (the Board/List toggle goes here). |
| `Board` | See "Boards" below. |

### Shared primitives

Use these instead of hand-built equivalents; each one fixes a layout bug
that recurred when pages rolled their own.

**`PageHeader` and `Toolbar`** (`components/page-header.tsx`). The h1, a
one-line description and the page's primary actions. Actions sit on the
title row from `lg` up and drop under the description below that, so a
button row never squeezes the title. Filters and view controls go in a
`Toolbar` under the header, never in `actions`.

```tsx
<PageHeader
  title="Applications"
  description="Every role you're tracking, newest first."
  actions={<Button size="sm">New application</Button>}
/>
<Toolbar label="Filter applications">
  <NativeSelect className="h-8 w-40" aria-label="Status">…</NativeSelect>
  <Button size="sm" variant="outline">Export CSV</Button>
</Toolbar>
```

**`FormField` and `FormActions`** (`components/ui/form-field.tsx`). The one
label / control / help / error layout. The label row has a fixed height, so
controls in a grid row line up whatever the label text; `FormActions` puts a
trailing submit button level with the controls, not the labels.

```tsx
<div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
  <FormField htmlFor="vendor" label="Vendor" hint="(optional)" help="As on the receipt.">
    <Input id="vendor" name="vendor" aria-describedby="vendor-help" />
  </FormField>
  <FormField htmlFor="amount" label="Amount" error={errors.amount}>
    <Input id="amount" name="amount" aria-describedby="amount-error" />
  </FormField>
  <FormActions>
    <SubmitButton size="sm">Add</SubmitButton>
  </FormActions>
</div>
```

**`NativeSelect`** (`components/ui/native-select.tsx`). A native `<select>`
styled like `Input` and the Radix `SelectTrigger`. Use it for URL-driven
filters, sort orders, long option lists and GET forms in server components:
long option text truncates instead of being clipped. Keep the Radix
`Select` for short, rich option lists inside client forms.

```tsx
<NativeSelect id="disc-sort" value={sort} onChange={(e) => update({ sort: e.target.value })} className="h-8">
  <option value="combined">Combined (match + benefits)</option>
  <option value="posted">Recently posted</option>
</NativeSelect>
```

**`Checkbox` and `Switch`** (`components/ui/checkbox.tsx`,
`components/ui/switch.tsx`). Both are styled native inputs (a transparent
`<input type="checkbox">` over a token-drawn box or track), so they submit
with GET and server-action forms (`name`, `value`, `defaultChecked`),
render from server components, and keep `getByRole('checkbox')` /
`getByRole('switch')`. The box is 16px and the track 36×20, both
`shrink-0` so a long title never squashes them, and the input overhangs
them to a 24px hit area (WCAG 2.5.8). Off states are outlined in
`muted-foreground` (6.74:1 light, 7.74:1 dark on `card`), on states fill
with `primary`; focus shows the shared ring on the box or track.

- **Checkbox** for selecting rows and for opt-ins inside a form that has
  its own Save. **Switch** for an "enabled" state that takes effect
  immediately (notifications, a source, Scam Shield); never add "On"/"Off"
  text next to a Switch, the control says it.
- Pass `label` (and optional `description`, linked by
  `aria-describedby`) to render the control and its text as one clickable
  row. Without `label`, give it an `aria-label` or wrap it in your own
  `<label>`; `className` then positions the box (e.g. `mt-0.5` beside a
  multi-line block).
- `indeterminate` (client components) draws a dash on the primary fill and
  reads as "mixed": a parent with only some children selected (the region
  picker's tree).

```tsx
<Checkbox name="remote" defaultChecked={prefs.remote} label="Remote only" description="Hide on-site roles." />
<Checkbox checked={selected} onChange={(e) => toggle(e.currentTarget.checked)} aria-label={`Select ${row.title}`} />
<Switch checked={enabled} onChange={(e) => save(e.currentTarget.checked)} label="Send the weekly digest"
  description="Mondays, from your own Gmail." />
```

**Filters: `AutoApplyForm` and `useUrlFilters`** (`components/filters/`).
URL-driven filters apply on change; there is no Filter or Apply button.
Selects, checkboxes and radios apply immediately, text and search inputs
after a 300 ms pause, and Enter applies at once. The query string is the
state (server pages read `searchParams`), a change resets `page`, and
`router.replace` keeps Back from stepping through each keystroke. Pass the
result count as `status` (it is announced in a polite live region after
each change) and `clearHref` to offer "Clear" while a filter is set.
Without JavaScript the form is a plain GET form with an Apply button.

```tsx
<AutoApplyForm action="/settings/logs" label="Filter logs" status={plural(rows.length, 'event')}
  clearHref="/settings/logs" defaults={{ range: '7d' }} className="grid gap-3 sm:grid-cols-3">
  <FormField htmlFor="logs-level" label="Level">
    <NativeSelect id="logs-level" name="level" defaultValue={filters.level ?? ''}>…</NativeSelect>
  </FormField>
</AutoApplyForm>

// Client filter components with controlled fields:
const { searchParams, setParams, pending } = useUrlFilters()
<NativeSelect value={searchParams.get('sort') ?? 'combined'} onChange={(e) => setParams({ sort: e.target.value })} />
<Input defaultValue={searchParams.get('q') ?? ''} onChange={(e) => setParams({ q: e.target.value }, { debounce: true })} />
```

**Error and 404 screens** (`components/errors/`). `app/not-found.tsx`
(unmatched URLs), `app/(authed)/not-found.tsx` (`notFound()` inside the
shell), `app/error.tsx`, `app/(authed)/error.tsx` and `app/global-error.tsx`
all render `StatusView`: the brand illustration, one sentence, and a way
back ("Go home", "Go back" or "Try again"; signed in, also Search, the main
sections and Settings › Logs). Never show the raw error: the boundary
reports it to `/api/client-errors` (server errors are already logged with
their digest by `instrumentation.ts`) and shows only the digest as an
error code. `global-error` renders its own document, so it imports the
tokens and applies the saved theme itself.

**Navigation feedback.** The shell shows a 2px `primary` bar at the top of
the viewport while a link's route is loading (`NavigationProgress`, only
after 120ms so prefetched navigations never flash) and sets `aria-busy` on
`<main>`. Sidebar items turn active as soon as they are clicked
(`LinkPendingHint`, built on `useLinkStatus`). Route segments keep their
`loading.tsx` skeletons (`PageSkeleton`: `list`, `cards`, `form`,
`detail`).

**`Card` and `CardTitle`** (`components/ui/card.tsx`). `CardTitle` is
`text-sm font-semibold leading-snug`; don't restyle it per card. Put an icon
before it in a `flex items-center gap-2` row and a count `Badge` or ghost
action on the right of the `CardHeader`.

```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
    <CardTitle className="flex items-center gap-2"><Mail className="size-4" />Weekly digest</CardTitle>
    <Badge variant="secondary">3</Badge>
  </CardHeader>
  <CardContent>…</CardContent>
</Card>
```

**`Badge` rules.** Status and outcome use a tone or stage variant
(`<Badge variant={STATUS_BADGE[status]}>`); counts use `secondary`; free
tags use `outline` or `neutral`. Badge text is human: map machine values
through a label (`STATUS_LABELS`, `workModeLabel`, `humanizeLabel`), never
render `snake_case` or lowercase enum values. The legacy colour variants
(`slate`, `blue`, `emerald`, `rose` …) are aliases kept for old code.

**`RouteTabs`** (`components/route-tabs.tsx`). Link-based tabs for sibling
routes (Settings, Analytics, Playground). The active tab is the longest
matching href; on phones the bar scrolls sideways with an edge fade instead
of wrapping. Use `Tabs` only for in-page panels that don't change the URL.

```tsx
<RouteTabs
  label="Settings sections"
  tabs={[
    { href: '/settings/profile', label: 'Profile' },
    { href: '/settings/integrations', label: 'Integrations' },
  ]}
/>
```

**`MarkdownText`** (`components/markdown-text.tsx`). Renders job
descriptions, notes and AI summaries written in light Markdown (headings as
small section labels, lists, bold, inline code). No HTML injection and no
dependency; use it instead of `whitespace-pre-wrap` on raw Markdown.

```tsx
<MarkdownText source={job.descriptionMd} className="text-sm" />
```

**Page structure primitives** (added after the Oct 8 UX audit):

| Primitive | Rule |
|---|---|
| `NoticeArea` (`components/discovery/notice-area.tsx`) | At most **one** notice above a list. Pass notices highest priority first; the rest wait behind "+N more". Notices are one line where possible (compact banner, not a card). |
| `SectionNav` (`components/section-nav.tsx`) | Sticky in-page anchor chips under the header for pages taller than ~3 screens. Targets get `SECTION_ANCHOR` (`scroll-mt-28`). |
| `CollapsibleSection` (`components/collapsible-section.tsx`) | A titled group that folds to a one-line status summary ("12 on · 1 failing"). `collapseOnMobile` closes it below `md` without layout shift. Never a native `<details>` triangle. |
| `ResponsivePopover` (`components/responsive-popover.tsx`) | Rich popovers are anchored popovers from `sm` up and **bottom sheets** on phones (max 85dvh, internal scroll). |
| `RegionPicker` (`components/regions/`) | Every region choice (Discovery and Shortlist `RegionFilter`, Settings `RegionField`): search over names, old spellings, IT parks and free zones; quick picks; a tree whose parents show mixed (`Checkbox indeterminate`); removable chips. A parent includes its descendants; children alone narrow (`lib/regions/selection.ts`). Locations on cards use `PlaceLabel` ("Kochi, Kerala · Infopark", chain on hover). |
| Settings links that return (`lib/ui/settings-links.ts`) | Links from a page into Settings carry `?from=<path>`; the settings page offers "Back to …". Only internal paths are accepted. |

Filters: primary filters inline in a toolbar row, the rest under a "More filters (n)" popover, **applied on change** (URL state), with a ghost "Clear" when anything differs from the default. No Filter/Apply buttons.

#### Score vocabulary

Every job shows **one** number: **Fit** (`MatchBadge`, "Fit 76"), coloured by band (75+ strong, 55–74 good, 35–54 fair, below 35 weak). Fit = (Match + AI) ÷ 2 when both exist, otherwise whichever exists (`blendScores`, `lib/discovery/match/blend.ts`). "Fit ~45" means it rests on the job title only. Match (deterministic, from ready profile evidence), AI, Benefits, ranking notes and the shortlist's rank parts appear only inside "Why this score". Never use "%" for a 0–100 score. The shortlist shows its order as "#1", never a second number.

### Labels, meta lines and times

- **Machine keys → words:** `humanizeLabel` (`lib/ui/labels.ts`) is the one
  label map ("score_job" → "Job scoring", "company_site" → "Company site");
  unknown keys are sentence-cased. Work modes use `workModeLabel`:
  "Remote", "Hybrid", "On-site".
- **Meta lines** ("Juspay · Bengaluru, IN"): build them with `joinMeta` /
  `metaParts` (`lib/ui/meta.ts`) from the parts that are present, so a
  missing value never leaves a stray leading "·" or "— ·". Render the line
  as one run of text so a wrapped line never starts with "·".
- **Counts:** `plural(n, 'item')` (`lib/ui/labels.ts`) gives "1 item",
  "3 items"; never "item(s)".
- **No machine words:** no ATS vendor names as labels (keep them in a
  tooltip), no raw event keys, ids or `key=value` text; those belong in a
  "Details" disclosure.
- **Times:** always in the user's timezone (Settings › Profile) and US style.
  Use `<LocalTime date={d} />` (`components/local-time.tsx`) from server or
  client components; `format` is `datetime` ("Sep 27, 2:30 PM"),
  `datetime-year`, `date`, `date-year`, `time` or `relative` ("2h ago", full
  time on hover). Server code that builds strings uses
  `formatDateTime(d, format, await getUserTimeZone(userId))`. Calendar days
  stored as `YYYY-MM-DD` use `shortDay`.
- **Errors:** show a friendly message and keep the raw provider text one click
  away under a "Details" disclosure (`components/lab/error-details.tsx`);
  log the raw error server-side.
- **Empty previews:** never a blank white panel; use `EmptyState` on a token
  surface with the next step ("Compile to see the PDF").

### Focus

One indicator everywhere: `focusRing` from `components/ui/focus-ring.ts`
(`ring-2 ring-ring ring-offset-2 ring-offset-background`). Plain links,
hand-built buttons, selects, tabs, switches and `[tabindex]` elements get
an equivalent outline from a zero-specificity rule in `globals.css`, so a
component's own ring always wins.

### Accessibility baseline

- **Skip link.** The root layout renders `SkipLink` ("Skip to content") as
  the first Tab stop; every layout's `<main>` has `id="main"`
  (`MAIN_CONTENT_ID`) and `tabIndex={-1}`.
- **No opacity on text.** Never de-emphasise text with `opacity-*`; it
  drops tone and muted text below 4.5:1 where the token test can't see it.
  Use `text-muted-foreground` or `font-normal`.
  `tests/unit/no-text-opacity.test.ts` fails on a bare `opacity-N` outside
  a short allow-list (icons and disabled or busy controls).
- **Targets.** Every pointer target is at least 24×24 px (WCAG 2.5.8):
  icon buttons `size-6` or larger (`size="icon"` is 36px), `Checkbox` and
  `Switch` overhang to 24px, pager links are 32px. Inline text links in a
  sentence are exempt.
- **Links are not toggles.** A link that shows the current view uses
  `aria-current="page"`, never `aria-pressed` (`BoardViewToggle`,
  `RouteTabs`).
- **No nested controls.** A card is never itself a button around links
  or menus: board cards are a plain container with the title link, the
  "..." menu and (for the keyboard) the move handle as siblings.
- **Gate.** `tests/e2e/a11y.spec.ts` runs axe-core (WCAG 2.2 A/AA) on the
  main routes in light and dark, and the target-size rule at 390px; any
  serious or critical violation fails CI.

### Motion

Short (150 to 200ms) colour and shadow transitions only.
`prefers-reduced-motion` disables animations globally.

## Boards

`components/board/board.tsx` is the one kanban implementation. A board
declares its columns (`id`, `title`, `tone`, optional `wipLimit`, `hint`,
`defaultCollapsed`), a card renderer, and an `onMove` server action.

- Column colour = the status tone, so a column matches that status's badge.
- The static board renders first (server + first paint); `@dnd-kit` loads
  after hydration. Never import `@dnd-kit` outside `board-dnd.tsx`.
- Moves are optimistic, roll back on failure with a friendly toast, and are
  announced in a polite live region.
- Keyboard: Tab to a card's move handle (it appears on focus), Space to
  lift, arrow keys to change column, Space to drop, Escape to cancel. Every card's "..." menu offers
  "Move to" as the non-drag alternative.
- Columns collapse (remembered per board and column) and show a soft WIP
  hint when over their limit.
- Pages offer a Board/List switch with `BoardViewToggle`; the view lives in
  `?view=` and the last choice is remembered per page.

## Do / Don't

**Do**
- Reach for a token or a tone before any colour class.
- Pair soft surfaces with strong tone text, and solids with `-foreground`.
- Use the same tone for the same meaning on every page (a rejected
  application is `stage-rejected` in its badge, board column and chart).
- Use `EmptyState`, `PageHeader`, `Toolbar`, `FormField`, `NativeSelect`,
  `Checkbox`, `Switch`, `AutoApplyForm`, `RouteTabs`, `MarkdownText`,
  `LocalTime` and the chart defaults rather than hand-built equivalents.
- Run `pnpm test` after changing a token: the contrast test is the gate.

**Don't**
- Don't use raw palette classes (`bg-blue-500`, `text-emerald-600`,
  `dark:text-rose-400`) or hex/hsl literals in components. Exceptions: email
  HTML (`lib/digest/email-template.tsx`, `lib/notifications/discovery.tsx`,
  because mail clients can't read CSS variables), LaTeX template previews
  (`lib/latex/previews.ts`, which depict each template's own colours), the
  PDF preview's white paper, and the logo itself (`BRAND_COLORS`).
- Don't add `dark:` colour overrides; tokens already switch with the theme.
- Don't encode meaning in colour alone: pair it with a label, icon or text.
- Don't recolour the logo or set the wordmark in anything but the text colour.
