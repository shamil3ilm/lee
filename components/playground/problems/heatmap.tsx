import type { HeatmapDay } from '@/lib/academy/coding/stats'
import { shortDay } from '@/lib/ui/date'

/** Submission calendar: one column per week, Sunday on top; colour from the sequential chart tokens. */
function level(count: number): number {
  if (count === 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

const FILL = ['hsl(var(--muted))', 'hsl(var(--chart-seq-2))', 'hsl(var(--chart-seq-3))', 'hsl(var(--chart-seq-4))', 'hsl(var(--chart-seq-5))']

export function Heatmap({ days }: { days: HeatmapDay[] }) {
  const weeks: HeatmapDay[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max gap-[3px]" role="img" aria-label={`Coding submissions per day over the last ${weeks.length} weeks`}>
          {weeks.map((week, w) => (
            <div key={w} className="flex flex-col gap-[3px]">
              {week.map((d) => (
                <span
                  key={d.day}
                  className="block size-3 rounded-[3px]"
                  style={{ backgroundColor: FILL[level(d.count)] }}
                  title={`${shortDay(d.day)}: ${d.count} submission${d.count === 1 ? '' : 's'}`}
                  data-count={d.count}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-hidden>
        Less
        {FILL.map((f, i) => (
          <span key={i} className="block size-3 rounded-[3px]" style={{ backgroundColor: f }} />
        ))}
        More
      </div>
    </div>
  )
}
