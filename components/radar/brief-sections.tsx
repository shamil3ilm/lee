import { BRIEF_SECTIONS, BRIEF_SECTION_LABELS, SOURCE_KIND_LABELS, type BriefSections, type BriefSource } from '@/lib/radar/brief/types'
import { cn } from '@/lib/utils'

/**
 * The brief's sections; every sentence links to the source it is quoted
 * from, with the verbatim quote as its tooltip. `onToggle` (drafts only)
 * lets the user drop a sentence before confirming.
 */
export function BriefSectionsView({
  sections,
  sources,
  removed,
  onToggle,
}: {
  sections: BriefSections
  sources: readonly BriefSource[]
  removed?: ReadonlySet<string>
  onToggle?: (key: string) => void
}) {
  const byId = new Map(sources.map((s) => [s.id, s]))
  const filled = BRIEF_SECTIONS.filter((id) => (sections[id] ?? []).length > 0)
  return (
    <div className="space-y-4">
      {filled.map((id) => (
        <section key={id} aria-labelledby={`brief-${id}`}>
          <h3 id={`brief-${id}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {BRIEF_SECTION_LABELS[id]}
          </h3>
          <ul className="mt-1 space-y-1.5 text-sm">
            {sections[id].map((s, i) => {
              const key = `${id}:${i}`
              const src = byId.get(s.source)
              const dropped = removed?.has(key) ?? false
              return (
                <li key={key} className={cn('flex min-w-0 items-start gap-2', dropped && 'opacity-50')}>
                  {onToggle ? (
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={!dropped}
                      onChange={() => onToggle(key)}
                      aria-label={`Keep: ${s.text}`}
                    />
                  ) : null}
                  <span className={cn('min-w-0 break-words', dropped && 'line-through')}>
                    {s.text}{' '}
                    {src ? (
                      <a href={src.url} target="_blank" rel="noopener noreferrer" title={`“${s.quote}”`} className="text-xs text-primary hover:underline">
                        [{src.id}]
                      </a>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <section aria-labelledby="brief-sources">
        <h3 id="brief-sources" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sources
        </h3>
        <ol className="mt-1 space-y-1 text-xs">
          {sources.map((s) => (
            <li key={s.id} className="min-w-0 break-words">
              [{s.id}] {SOURCE_KIND_LABELS[s.kind]}:{' '}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
