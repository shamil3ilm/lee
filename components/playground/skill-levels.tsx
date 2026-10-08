import { CHART_SEQUENTIAL } from '@/lib/ui/chart-palette'
import type { RadarPoint } from '@/lib/academy/service/hub'

const MAX_LEVEL = 5

/** Sorted strongest first; unassessed domains (level 0) last, in their original order. */
export function sortByLevel(points: readonly RadarPoint[]): RadarPoint[] {
  return points
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.level - a.p.level || a.i - b.i)
    .map((x) => x.p)
}

/** Sequential step for a level: deeper navy for higher levels. */
function fillFor(level: number): string {
  const step = Math.min(CHART_SEQUENTIAL.length, Math.max(1, Math.round(level)))
  return CHART_SEQUENTIAL[step - 1]!
}

/**
 * Average level per domain (0–5) as sorted horizontal bars. Replaces a
 * 16-axis radar whose labels were truncated and whose shape was hard to
 * read: every domain name is shown in full and the value is printed.
 */
export function SkillLevels({ data }: { data: readonly RadarPoint[] }) {
  return (
    <ul className="space-y-2" aria-label="Average level by domain, 0 to 5">
      {sortByLevel(data).map((r) => (
        <li key={r.domainId} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3 text-xs">
          <span className="leading-snug">{r.domain}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {r.level > 0 ? (
              <span
                className="block h-full rounded-full"
                style={{ width: `${(Math.min(r.level, MAX_LEVEL) / MAX_LEVEL) * 100}%`, background: fillFor(r.level) }}
              />
            ) : null}
          </span>
          <span className="text-right tabular-nums text-muted-foreground">
            {r.level > 0 ? r.level.toFixed(1) : <span aria-label="Not assessed">–</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
