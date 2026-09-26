'use client'
import * as React from 'react'
import * as Recharts from 'recharts'
import { cn } from '@/lib/utils'

/**
 * Chart primitives — a hand-rolled port of shadcn/ui's chart primitive.
 * We can't run the shadcn CLI (Tailwind 4 incompatibility), so we mirror
 * the same public API (`ChartContainer`, `ChartTooltip`, `ChartLegend`)
 * so callers look the same as in the shadcn docs.
 *
 * The core idea: `ChartContainer` takes a `config` map keyed by data
 * series and emits CSS custom properties (`--color-<key>`) for each
 * series' colour, then wraps the chart in `ResponsiveContainer` so it
 * fills its parent. Individual recharts primitives can then read the
 * colour with `fill="var(--color-<key>)"` without threading the theme
 * through every prop.
 */

export interface ChartConfig {
  [key: string]: {
    label: string
    color?: string
  }
}

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

export function useChart(): { config: ChartConfig } {
  const ctx = React.useContext(ChartContext)
  if (!ctx) throw new Error('useChart must be used inside <ChartContainer>')
  return ctx
}

interface ChartContainerProps {
  config: ChartConfig
  className?: string
  children: React.ReactElement
}

/**
 * Wraps a recharts element in ResponsiveContainer + a theme-scoped div that
 * exposes each configured series colour as a CSS custom property. Use a
 * fixed `height` on the wrapping card body — recharts needs the parent to
 * have a real height for ResponsiveContainer to size itself.
 */
export function ChartContainer({ config, className, children }: ChartContainerProps) {
  const cssVars = React.useMemo(() => {
    const out: Record<string, string> = {}
    for (const [key, cfg] of Object.entries(config)) {
      if (cfg.color) out[`--color-${key}`] = cfg.color
    }
    return out
  }, [config])

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn(
          'flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-polar-grid_line]:stroke-border/50 [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_line]:stroke-border',
          className,
        )}
        style={cssVars as React.CSSProperties}
      >
        <Recharts.ResponsiveContainer>{children}</Recharts.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

// -----------------------------------------------------------------------
// Tooltip
// -----------------------------------------------------------------------

// Recharts tooltip types are loose (unknown payloads keyed by field), so
// keep the shape narrow for the fields we actually read.
interface TooltipPayloadEntry {
  name?: string | number
  value?: string | number
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

interface TooltipContentProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string | number
  labelFormatter?: (value: string | number, payload: TooltipPayloadEntry[]) => React.ReactNode
  valueFormatter?: (value: string | number, name: string) => React.ReactNode
  hideLabel?: boolean
  className?: string
}

/**
 * Styled tooltip content, safe to pass as `content={<ChartTooltipContent />}`
 * to a `<Tooltip>` recharts element. Reads series labels from the surrounding
 * ChartContainer's config so `payload.name` in the DOM matches the label the
 * user sees on axes and legends.
 */
export const ChartTooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  function ChartTooltipContent(
    { active, payload, label, labelFormatter, valueFormatter, hideLabel, className },
    ref,
  ) {
    const { config } = useChart()
    if (!active || !payload || payload.length === 0) return null

    return (
      <div
        ref={ref}
        className={cn(
          'grid min-w-[8rem] items-start gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs shadow-md',
          className,
        )}
      >
        {!hideLabel && label !== undefined ? (
          <div className="font-medium text-foreground">
            {labelFormatter ? labelFormatter(label, payload) : String(label)}
          </div>
        ) : null}
        <div className="grid gap-1.5">
          {payload.map((entry, i) => {
            const key = String(entry.dataKey ?? entry.name ?? i)
            // Pie slices share one dataKey; fall back to the slice name.
            const cfg = config[key] ?? config[String(entry.name)]
            const displayName = cfg?.label ?? String(entry.name ?? key)
            const value = entry.value ?? ''
            return (
              <div key={`${key}:${i}`} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: entry.color ?? cfg?.color ?? 'currentColor' }}
                  />
                  <span className="text-muted-foreground">{displayName}</span>
                </div>
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {valueFormatter ? valueFormatter(value, String(entry.name ?? key)) : String(value)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  },
)

// Re-export the recharts Tooltip as ChartTooltip so consumers pass content
// via `<ChartTooltip content={<ChartTooltipContent />} />` — mirrors the
// shadcn API even though we're just aliasing.
export const ChartTooltip = Recharts.Tooltip

// -----------------------------------------------------------------------
// Legend
// -----------------------------------------------------------------------

interface LegendItem {
  value?: string | number
  color?: string
  dataKey?: string | number
}

interface ChartLegendContentProps {
  payload?: LegendItem[]
  className?: string
  hideIcon?: boolean
}

export function ChartLegendContent({ payload, className, hideIcon }: ChartLegendContentProps) {
  const { config } = useChart()
  if (!payload || payload.length === 0) return null
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-4 pt-3 text-xs', className)}>
      {payload.map((entry, i) => {
        const key = String(entry.dataKey ?? entry.value ?? i)
        // Pie legends repeat one dataKey per slice: key by index and
        // resolve the label from the slice value.
        const cfg = config[key] ?? config[String(entry.value)]
        const label = cfg?.label ?? String(entry.value ?? key)
        return (
          <div key={`${key}:${i}`} className="flex items-center gap-1.5 text-muted-foreground">
            {hideIcon ? null : (
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: entry.color ?? cfg?.color ?? 'currentColor' }}
              />
            )}
            <span>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export const ChartLegend = Recharts.Legend
