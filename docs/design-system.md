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
| Card title | `CardTitle` (`font-semibold leading-none tracking-tight`), usually `text-sm` |
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

## Components

| Primitive | Rules |
|---|---|
| `Button` | `default` for the one primary action per view; `outline` for secondary; `ghost` for icon buttons and toolbars; `destructive` only for irreversible actions (behind `ConfirmDialog`). |
| `Card` | `rounded-xl`, `data-slot="card"`. One topic per card; title `text-sm font-semibold`. |
| `Badge` | Status uses tone variants (`success`, `warning`, `danger`, `info`, `neutral`, stage names). Tags use `outline` or `secondary`. The legacy colour names are aliases; don't use them in new code. |
| `Input`, `Textarea`, `Select` | Card-coloured field, `border-input`, shared focus ring. Always paired with a `Label`. |
| `Tabs` | Muted track, active tab on the card surface. Route-backed tabs use `RouteTabs`. |
| `Dialog`, `Sheet` | Navy-tinted overlay, card surface, `rounded-xl` dialogs. Destructive confirmations use `ConfirmDialog`. |
| `Table` | `components/ui/table.tsx`; the wrapper scrolls horizontally on phones so pages never scroll sideways. |
| `Tooltip` | Primary surface, short text only; never the only way to reach information. |
| `Skeleton` | `bg-skeleton` pulse, shaped like the content it replaces. |
| `EmptyState` | Every empty list, table, card and board column uses it (or the board's column empty slot): brand illustration (logo arc + circle), one-line title, optional hint and one action. `size="sm"` inside cards. |
| `PageHeader` | Every page starts with it: title, one-line description, actions on the right (the Board/List toggle goes here). |
| `Board` | See "Boards" below. |

### Focus

One indicator everywhere: `focusRing` from `components/ui/focus-ring.ts`
(`ring-2 ring-ring ring-offset-2 ring-offset-background`). Plain links and
`[tabindex]` elements get an equivalent outline from `globals.css`.

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
- Keyboard: focus a card, Space to lift, arrow keys to change column,
  Space to drop, Escape to cancel. Every card's "..." menu offers
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
- Use `EmptyState` and `PageHeader` rather than hand-built equivalents.
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
