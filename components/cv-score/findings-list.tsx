'use client'
import { Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ComponentHeadlineKey, CvFinding, Severity } from '@/lib/cv-score/types'
import { HEADLINE_ORDER, HEADLINE_SHORT, SEVERITY_BADGE, SEVERITY_ORDER } from './client'

interface FindingsListProps {
  findings: CvFinding[]
  severity: Severity | 'all'
  headline: ComponentHeadlineKey | 'all'
  onSeverity: (s: Severity | 'all') => void
  onHeadline: (h: ComponentHeadlineKey | 'all') => void
  onPreviewFix?: (ids: string[]) => void
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

export function FindingsList({ findings, severity, headline, onSeverity, onHeadline, onPreviewFix }: FindingsListProps) {
  const visible = findings.filter(
    (f) => (severity === 'all' || f.severity === severity) && (headline === 'all' || f.headlines.includes(headline)),
  )
  const fixable = visible.filter((f) => f.autoFixable)
  const presentHeadlines = HEADLINE_ORDER.filter((h) => findings.some((f) => f.headlines.includes(h)))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={severity === 'all'} onClick={() => onSeverity('all')}>All ({findings.length})</Chip>
        {SEVERITY_ORDER.map((s) => {
          const n = findings.filter((f) => f.severity === s).length
          return n ? (
            <Chip key={s} active={severity === s} onClick={() => onSeverity(s)}>
              {s} ({n})
            </Chip>
          ) : null
        })}
      </div>
      {presentHeadlines.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={headline === 'all'} onClick={() => onHeadline('all')}>Every score</Chip>
          {presentHeadlines.map((h) => (
            <Chip key={h} active={headline === h} onClick={() => onHeadline(h)}>
              {HEADLINE_SHORT[h]}
            </Chip>
          ))}
        </div>
      ) : null}
      {fixable.length > 1 && onPreviewFix ? (
        <Button size="sm" variant="outline" onClick={() => onPreviewFix(fixable.map((f) => f.id))}>
          <Wand2 /> Preview all {fixable.length} fixes
        </Button>
      ) : null}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No findings match these filters.</p>
      ) : (
        SEVERITY_ORDER.map((s) => {
          const group = visible.filter((f) => f.severity === s)
          if (!group.length) return null
          return (
            <section key={s} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s}</h4>
              <ul className="space-y-2">
                {group.map((f) => (
                  <li key={f.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 font-medium">{f.message}</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={SEVERITY_BADGE[f.severity]}>{f.severity}</Badge>
                        {f.headlines.map((h) => (
                          <Badge key={h} variant="outline" className="font-normal">
                            {HEADLINE_SHORT[h]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {f.location ? (
                      <p className="mt-1.5 border-l-2 pl-2 text-xs italic text-muted-foreground">
                        {f.location.section}: “{f.location.excerpt}”
                      </p>
                    ) : null}
                    {f.suggestion ? <p className="mt-1.5 text-xs">{f.suggestion}</p> : null}
                    {f.autoFixable && onPreviewFix ? (
                      <Button size="sm" variant="secondary" className="mt-2" onClick={() => onPreviewFix([f.id])}>
                        <Wand2 /> Preview fix
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
