import type { Coverage } from '@/lib/cv-fit/types'
import type { DiffLine, DiffSection, TailorOutcome } from '@/lib/cv-fit/tailor/types'
import { cn } from '@/lib/utils'

const LINE_TONE: Readonly<Record<DiffLine['state'], string>> = {
  same: '',
  moved: 'bg-info-soft text-info',
  added: 'bg-success-soft text-success',
  removed: 'bg-danger-soft text-danger line-through',
}

const LINE_LABEL: Readonly<Record<DiffLine['state'], string>> = { same: '', moved: 'Moved: ', added: 'Added: ', removed: 'Removed: ' }

function Lines({ lines, label }: { lines: readonly DiffLine[]; label: string }) {
  return (
    <ul className="space-y-0.5" aria-label={label}>
      {lines.map((l, i) => (
        <li key={`${i}-${l.text}`} className={cn('rounded px-1.5 py-0.5 text-xs leading-snug', LINE_TONE[l.state])}>
          {l.state !== 'same' ? <span className="sr-only">{LINE_LABEL[l.state]}</span> : null}
          {l.text}
        </li>
      ))}
    </ul>
  )
}

function changed(s: DiffSection): boolean {
  return [...s.before, ...s.after].some((l) => l.state !== 'same')
}

function counts(c: Coverage): string {
  return `${c.met} met · ${c.partial} partial · ${c.missing} missing`
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

/** Requirement coverage and CV Score before → after, then the changed sections side by side. */
export function BeforeAfter({ outcome }: { outcome: TailorOutcome }) {
  const delta = outcome.scoreBefore !== null && outcome.scoreAfter !== null ? outcome.scoreAfter - outcome.scoreBefore : null
  const sections = outcome.diff.filter(changed)
  return (
    <div className="space-y-3" data-testid="tailor-before-after">
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md bg-muted px-2.5 py-2">
          <dt className="font-medium">Must-haves on the CV</dt>
          <dd className="tabular-nums">
            <span className="block text-muted-foreground">Before: {counts(outcome.before)}</span>
            <span className="block">After: {counts(outcome.after)}</span>
          </dd>
        </div>
        <div className="rounded-md bg-muted px-2.5 py-2">
          <dt className="font-medium">CV Score for this JD</dt>
          <dd className="tabular-nums" data-testid="tailor-score-delta">
            {outcome.scoreBefore ?? '—'} → {outcome.scoreAfter ?? '—'}
            {delta !== null ? <span className="ml-1 font-medium">({signed(delta)})</span> : null}
          </dd>
        </div>
        <div className="rounded-md bg-muted px-2.5 py-2">
          <dt className="font-medium">Length</dt>
          <dd className="tabular-nums">
            About {outcome.pagesBefore} → {outcome.pagesAfter} pages
          </dd>
        </div>
      </dl>
      {sections.length === 0 ? (
        <p className="text-xs text-muted-foreground">No change yet: accept a suggestion to see it here.</p>
      ) : (
        <div className="space-y-3" aria-label="Side-by-side changes">
          {sections.map((s) => (
            <section key={s.label} className="space-y-1">
              <h4 className="text-xs font-semibold">{s.label}</h4>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="min-w-0 rounded-md border p-2">
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">Before</p>
                  <Lines lines={s.before} label={`${s.label} before`} />
                </div>
                <div className="min-w-0 rounded-md border p-2">
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">After</p>
                  <Lines lines={s.after} label={`${s.label} after`} />
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
