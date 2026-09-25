import { Badge } from '@/components/ui/badge'
import type { KeywordDetails, KeywordHit } from '@/lib/cv-score/dimensions/keywords'

const TONE = { matched: 'emerald', partial: 'violet', missing: 'rose' } as const

function Group({ title, hits }: { title: string; hits: KeywordHit[] }) {
  if (!hits.length) return null
  const order = { matched: 0, partial: 1, missing: 2 }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {[...hits].sort((a, b) => order[a.status] - order[b.status]).map((h) => (
          <Badge
            key={h.term}
            variant={TONE[h.status]}
            title={
              h.status === 'matched'
                ? `Found in ${h.where.join(', ')}`
                : h.status === 'partial'
                  ? h.via ? `Related skill: ${h.via}` : 'Only listed in Skills'
                  : 'Not found in your CV'
            }
          >
            {h.term}
            {h.status === 'partial' ? (h.via ? ` ≈ ${h.via}` : ' (skills only)') : ''}
          </Badge>
        ))}
      </div>
    </div>
  )
}

/** Matched / partial / missing JD keyword chips, split required vs nice-to-have. */
export function KeywordPanel({ details }: { details: KeywordDetails }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span><span className="font-semibold text-emerald-600">{details.matched.length}</span> matched</span>
        <span><span className="font-semibold text-violet-600">{details.partial.length}</span> partial</span>
        <span><span className="font-semibold text-rose-600">{details.missing.length}</span> missing</span>
      </div>
      <Group title="Required" hits={details.required} />
      <Group title="Nice to have" hits={details.niceToHave} />
    </div>
  )
}
