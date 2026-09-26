/**
 * Brand chart palette for recharts. Values are CSS colours that read the
 * theme tokens (`--chart-*` in app/globals.css), so one config works in light
 * and dark. Categorical: distinct series (max 8, then repeat). Sequential:
 * one measure from low to high (navy ramp). Status-coded series use
 * `toneColor()` from lib/ui/tones instead.
 */
export const CHART_CATEGORICAL = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-8))',
] as const

export const CHART_SEQUENTIAL = [
  'hsl(var(--chart-seq-1))',
  'hsl(var(--chart-seq-2))',
  'hsl(var(--chart-seq-3))',
  'hsl(var(--chart-seq-4))',
  'hsl(var(--chart-seq-5))',
] as const

/** The i-th categorical colour, cycling past the end. */
export function categorical(i: number): string {
  const n = CHART_CATEGORICAL.length
  return CHART_CATEGORICAL[((i % n) + n) % n]!
}

/** Primary single-series colour (brand blue). */
export const CHART_PRIMARY = CHART_CATEGORICAL[0]
/** De-emphasised comparison series (e.g. "previous month"). */
export const CHART_MUTED = CHART_CATEGORICAL[6]
