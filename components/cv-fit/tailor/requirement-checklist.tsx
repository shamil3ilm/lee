import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { ChecklistItem, ReqStatus } from '@/lib/cv-fit/tailor/types'

const STATUS: Readonly<Record<ReqStatus, { label: string; variant: BadgeProps['variant'] }>> = {
  met: { label: 'Met', variant: 'success' },
  partial: { label: 'Partial', variant: 'warning' },
  missing: { label: 'Missing', variant: 'danger' },
}

const ON_CV: Readonly<Record<ReqStatus, string>> = {
  met: 'shown on this CV',
  partial: 'partly shown on this CV',
  missing: 'not on this CV yet',
}

/**
 * Each must-have and nice-to-have, met / partial / missing against your
 * ready profile, with the line that backs it and whether this CV shows it.
 */
export function RequirementChecklist({ items }: { items: readonly ChecklistItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">The posting lists no requirements lee can check. Paste the full JD on the posting to tailor against it.</p>
  }
  return (
    <ul className="divide-y rounded-lg border" aria-label="Requirement checklist" data-testid="tailor-checklist">
      {items.map((c) => (
        <li key={c.id} className="space-y-1 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>
            <Badge variant="outline">{c.weight === 'must' ? 'Must-have' : 'Nice to have'}</Badge>
            {c.status !== 'missing' ? <span className="text-[11px] text-muted-foreground">{ON_CV[c.inCv]}</span> : null}
          </div>
          <p className="text-sm leading-snug">{c.text}</p>
          {c.evidence ? <p className="text-xs text-muted-foreground">Evidence: “{c.evidence}”</p> : null}
        </li>
      ))}
    </ul>
  )
}
