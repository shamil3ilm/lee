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
