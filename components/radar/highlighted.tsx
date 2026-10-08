import type { Segment } from '@/lib/radar/match'

/** Text with watch-term matches marked (segments come from lib/radar/match). */
export function Highlighted({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.termId ? (
          <mark key={i} data-watch-match className="rounded-sm bg-warning-soft px-0.5 font-medium text-foreground">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}
