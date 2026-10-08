import { humanizeLabel } from '@/lib/ui/labels'

/**
 * Shared Recharts defaults. Every chart spreads these instead of hand-tuning
 * margins and axis widths, which is what clipped tick labels before:
 *
 * - Margins are never negative. The y-axis sizes itself to its widest tick
 *   (`width: 'auto'`), so "$0.25" or "80K" always fits.
 * - Category axes show every tick (`interval: 0`) and humanise machine keys
 *   through `humanizeLabel`, truncating long names instead of dropping them.
 * - Legends sit below the plot and are drawn by `ChartLegendContent`.
 *
 * Usage:
 *   <BarChart data={d} margin={CHART_MARGIN}>
 *     <XAxis dataKey="kind" {...CATEGORY_AXIS} />
 *     <YAxis {...VALUE_AXIS} tickFormatter={formatMoneyAxis} />
 */

/** Plot margin: a little air on top and right, nothing negative. */
export const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 } as const

/** Extra top room for value labels drawn above bars (LabelList position="top"). */
export const CHART_MARGIN_LABELLED = { ...CHART_MARGIN, top: 20 } as const

/** Font size for every tick, in px. */
export const CHART_TICK_FONT_SIZE = 11

/** Longest category tick before it is truncated with an ellipsis. */
export const CATEGORY_TICK_MAX_CHARS = 14

const AXIS_BASE = {
  tickLine: false,
  axisLine: false,
  fontSize: CHART_TICK_FONT_SIZE,
} as const

/** Continuous x-axis (dates, weeks): thins ticks so they never collide. */
export const TIME_AXIS = {
  ...AXIS_BASE,
  tickMargin: 6,
  interval: 'preserveStartEnd',
  minTickGap: 16,
} as const

/** Numeric value axis: sizes itself to the widest tick label. */
export const VALUE_AXIS = {
  ...AXIS_BASE,
  width: 'auto',
} as const

/** Shortens a label to `max` characters with an ellipsis. */
export function truncateLabel(label: string, max: number = CATEGORY_TICK_MAX_CHARS): string {
  return label.length > max ? `${label.slice(0, Math.max(1, max - 1)).trimEnd()}…` : label
}

/** Tick formatter for category keys: humanised, then truncated. */
export function formatCategoryTick(value: unknown): string {
  return truncateLabel(humanizeLabel(value as string | number | null | undefined))
}

/** Rough average glyph width as a share of the font size (Inter, 11px). */
const GLYPH_WIDTH_RATIO = 0.58

interface CategoryTickProps {
  x?: number | string
  y?: number | string
  width?: number | string
  visibleTicksCount?: number
  payload?: { value?: unknown }
  textAnchor?: string
  fill?: string
}

/**
 * X-axis category tick that fits its band: the label is humanised, then
 * truncated to the characters that fit the space each category gets, so
 * neighbours never collide at phone widths. The full label is the tooltip.
 */
export function CategoryTick({ x, y, width, visibleTicksCount, payload, fill }: CategoryTickProps) {
  const full = humanizeLabel(payload?.value as string | number | undefined)
  const band = Number(width ?? 0) / Math.max(1, visibleTicksCount ?? 1)
  const fit = Math.floor((band - 4) / (CHART_TICK_FONT_SIZE * GLYPH_WIDTH_RATIO))
  const max = Math.max(3, Math.min(CATEGORY_TICK_MAX_CHARS + 6, fit))
  return (
    <text
      x={Number(x ?? 0)}
      y={Number(y ?? 0)}
      dy="0.71em"
      textAnchor="middle"
      fontSize={CHART_TICK_FONT_SIZE}
      fill={fill}
      className="recharts-cartesian-axis-tick-value"
    >
      <title>{full}</title>
      {truncateLabel(full, max)}
    </text>
  )
}

/** Category x-axis: every category gets a label, humanised and fitted to its band. */
export const CATEGORY_AXIS = {
  ...AXIS_BASE,
  tickMargin: 6,
  interval: 0,
  tick: <CategoryTick />,
} as const

/** Category y-axis for horizontal bar charts (vendors): every row labelled. */
export const CATEGORY_Y_AXIS = {
  ...AXIS_BASE,
  type: 'category',
  width: 'auto',
  interval: 0,
  tickFormatter: formatCategoryTick,
} as const

/** Compact count formatter for value axes: 1200 → "1.2k". */
export function formatCompactNumber(v: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
    .format(v)
    .toLowerCase()
}

/** Legend placement shared by every chart that shows one. */
export const LEGEND_PROPS = { verticalAlign: 'bottom', align: 'center' } as const

/**
 * Statistics (medians, percentiles) need a sample: below this many points a
 * card says "Not enough data yet" instead of a number.
 */
export const MIN_STAT_POINTS = 5

/** True when `n` points are enough to show a median or percentile. */
export function hasEnoughForStats(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_STAT_POINTS
}

/** Below this many points a line shows a dot on every point. */
export const SHORT_SERIES_POINTS = 6

export interface LineSeriesProps {
  type: 'linear'
  strokeWidth: number
  dot: false | { r: number; strokeWidth: number }
  activeDot: { r: number }
}

/**
 * Line props for a series of `points` values. Lines are never smoothed
 * (a curve through three points invents values between them); short
 * series also draw a dot on each point so a reader sees how few there are.
 */
export function lineProps(points: number): LineSeriesProps {
  return {
    type: 'linear',
    strokeWidth: 2,
    dot: points < SHORT_SERIES_POINTS ? { r: 3, strokeWidth: 0 } : false,
    activeDot: { r: 4 },
  }
}

/**
 * Orders series keys by their domain order (pipeline order for statuses),
 * so legends, stacks and bars read the same way everywhere instead of
 * alphabetically. Unknown keys keep their relative order after the known ones.
 */
export function orderByDomain<T extends string>(keys: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((k, i) => [k, i] as const))
  return keys
    .map((k, i) => ({ k, r: rank.get(k) ?? order.length + i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.k)
}

/**
 * Numeric x-axis for horizontal bar charts. The right padding keeps the
 * last tick ("100K") from being cut at the plot edge.
 */
export const VALUE_X_AXIS = {
  ...AXIS_BASE,
  type: 'number',
  padding: { left: 0, right: 16 },
} as const

interface ChartNotEnoughDataProps {
  message?: string
  hint?: string
}

/** Shown in place of a statistic or chart that doesn't have enough data. */
export function ChartNotEnoughData({ message = 'Not enough data yet', hint }: ChartNotEnoughDataProps) {
  return (
    <div className="flex h-full min-h-16 flex-col items-center justify-center gap-0.5 rounded-md bg-muted px-3 py-4 text-center">
      <p className="text-xs font-medium text-muted-foreground">{message}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
