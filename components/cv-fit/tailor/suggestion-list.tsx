import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { SUGGESTION_LABELS, type Suggestion } from '@/lib/cv-fit/tailor/types'

function Change({ from, to }: { from: string; to: string }) {
  return (
    <span className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
      <span className="rounded-md bg-muted px-2 py-1">
        <span className="sr-only">Now: </span>
        {from}
      </span>
      <span className="rounded-md bg-info-soft px-2 py-1 text-info">
        <span className="sr-only">Suggested: </span>
        {to}
      </span>
    </span>
  )
}

function Detail({ s }: { s: Suggestion }) {
  switch (s.kind) {
    case 'swap_wording':
    case 'ai_wording':
    case 'headline':
    case 'summary':
      return <Change from={s.from} to={s.text} />
    case 'include':
    case 'lead_bullet':
      return s.text ? <span className="mt-1 block text-xs text-muted-foreground">“{s.text}”</span> : null
    case 'lead_skills':
      return <span className="mt-1 block text-xs text-muted-foreground">{s.names.join(', ')} first</span>
    case 'trim':
      return (
        <span className="mt-1 block text-xs text-muted-foreground">
          About {s.pages} pages → {s.target}. Drops: {s.drops.slice(0, 4).map((d) => `“${d.text}”`).join(', ')}
          {s.drops.length > 4 ? ` and ${s.drops.length - 4} more` : ''}
        </span>
      )
  }
}

/** Every suggested change, each accepted or rejected on its own. */
export function SuggestionList({
  suggestions,
  accepted,
  onToggle,
  disabled,
}: {
  suggestions: readonly Suggestion[]
  accepted: ReadonlySet<string>
  onToggle: (id: string, on: boolean) => void
  disabled?: boolean
}) {
  if (suggestions.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing to change: this CV already leads with your evidence for this posting.</p>
  }
  return (
    <ul className="space-y-2" aria-label="Suggested changes" data-testid="tailor-suggestions">
      {suggestions.map((s) => (
        <li key={s.id} className="rounded-lg border px-3 py-2" data-testid="tailor-suggestion" data-kind={s.kind}>
          <label className="flex items-start gap-2.5">
            <Checkbox
              className="mt-0.5"
              checked={accepted.has(s.id)}
              disabled={disabled}
              onChange={(e) => onToggle(s.id, e.currentTarget.checked)}
              aria-label={`Accept: ${SUGGESTION_LABELS[s.kind]}. ${s.reason}`}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                {SUGGESTION_LABELS[s.kind]}
                {s.kind === 'ai_wording' ? <Badge variant="info">Pending your approval</Badge> : null}
              </span>
              <span className="block text-xs text-muted-foreground">{s.reason}</span>
              <Detail s={s} />
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}
