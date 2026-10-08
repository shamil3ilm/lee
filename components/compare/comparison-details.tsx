import Link from 'next/link'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { ChecklistRow, Verdict } from '@/lib/compare/checklist'
import type { Comparison } from '@/lib/compare/compare'
import { formatMoney } from '@/lib/compare/fx'
import type { TakeHome } from '@/lib/compare/take-home'
import { BASIS_LABELS } from '@/lib/compare/take-home'
import { CRITERIA, CRITERION_LABELS } from '@/lib/compare/types'
import { ConfidenceBadge, ScoreText, SourceLine } from './confidence'

/** Pay, benefits checklist and per-criterion breakdown for one comparison. */

function range(lo: number, hi: number, currency: Comparison['pay']['currency']): string {
  return Math.round(lo) === Math.round(hi) ? formatMoney(hi, currency) : `${formatMoney(lo, currency)} – ${formatMoney(hi, currency).replace(`${currency} `, '')}`
}

function TakeHomeLine({ label, th, currency }: { label: string; th: TakeHome | null; currency: Comparison['pay']['currency'] }) {
  if (!th) return null
  const value = th.disposable ?? th.net
  return (
    <div className="space-y-1">
      <p className="text-sm">
        <span className="font-medium">{label}:</span>{' '}
        {value === null ? (
          <span className="text-muted-foreground">take-home unknown</span>
        ) : (
          <span className="tabular-nums">
            ≈ {formatMoney(th.net ?? value, currency)}/mo after tax
            {th.disposable !== null ? `, ${formatMoney(th.disposable, currency)}/mo left after living costs` : ''}
          </span>
        )}
      </p>
      <ul className="list-inside list-disc text-xs text-muted-foreground">
        {th.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  )
}

export function PayDetails({ c }: { c: Comparison }) {
  const p = c.pay
  return (
    <section aria-labelledby={`pay-${c.key}`} className="space-y-2">
      <h3 id={`pay-${c.key}`} className="flex items-center gap-2 text-sm font-semibold">
        Pay <ConfidenceBadge confidence={c.job.criteria.pay.confidence} />
      </h3>
      {!p.postedText ? (
        <p className="text-sm text-muted-foreground">The posting states no pay. Unknown, not guessed.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <p>
            Posted: <span className="font-medium">{p.postedText}</span>
          </p>
          {p.monthly && p.annual ? (
            <p className="tabular-nums">
              {range(p.monthly.min, p.monthly.max, p.currency)} a month · {range(p.annual.min, p.annual.max, p.currency)} a year
              {p.conversionLabel ? <span className="text-xs text-muted-foreground"> ({p.conversionLabel})</span> : null}
            </p>
          ) : p.missingFx ? (
            <p className="text-muted-foreground">
              Add a {p.missingFx} rate in{' '}
              <Link href="/settings/current-job#assumptions" className="underline underline-offset-2">
                your FX table
              </Link>{' '}
              to convert it.
            </p>
          ) : null}
          {p.deltaPct !== null && p.basis ? (
            <p className="font-medium">
              Estimated {p.deltaPct >= 0 ? '+' : ''}
              {p.deltaPct}% {BASIS_LABELS[p.basis]} vs your current job.
            </p>
          ) : null}
          <TakeHomeLine label="This job" th={p.job} currency={p.currency} />
          <TakeHomeLine label="Current job" th={p.current} currency={p.currency} />
        </div>
      )}
    </section>
  )
}

const VERDICT_BADGE: Readonly<Record<Verdict, { label: string; variant: BadgeProps['variant'] }>> = {
  better: { label: 'Better', variant: 'success' },
  same: { label: 'Same', variant: 'neutral' },
  worse: { label: 'Worse', variant: 'danger' },
  unknown: { label: 'Unknown', variant: 'outline' },
}

export function BenefitsTable({ rows, id }: { rows: readonly ChecklistRow[]; id: string }) {
  return (
    <section aria-labelledby={`benefits-${id}`} className="space-y-2">
      <h3 id={`benefits-${id}`} className="text-sm font-semibold">
        Benefits, side by side
      </h3>
      <ul className="divide-y rounded-lg border text-sm" data-testid="benefits-checklist">
        {rows.map((r) => (
          <li key={r.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_5rem] sm:items-center">
            <span className="font-medium">{r.label}</span>
            <span className="text-xs text-muted-foreground sm:text-sm sm:text-foreground">
              <span className="sm:hidden">Now: </span>
              {r.current}
            </span>
            <span className="text-xs text-muted-foreground sm:text-sm sm:text-foreground">
              <span className="sm:hidden">Here: </span>
              {r.job}
            </span>
            <span>
              <Badge variant={VERDICT_BADGE[r.verdict].variant} className="text-[10px]">
                {VERDICT_BADGE[r.verdict].label}
              </Badge>
            </span>
            {r.source ? (
              <span className="sm:col-span-4">
                <SourceLine source={r.source} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function CriteriaBreakdown({ c }: { c: Comparison }) {
  return (
    <section aria-labelledby={`criteria-${c.key}`} className="space-y-2">
      <h3 id={`criteria-${c.key}`} className="text-sm font-semibold">
        Criteria and evidence
      </h3>
      <div className="space-y-2">
        {CRITERIA.map((k) => {
          const r = c.job.criteria[k]
          return (
            <details key={k} className="rounded-lg border px-3 py-2">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{CRITERION_LABELS[k]}</span>
                <span className="text-muted-foreground">
                  this job <ScoreText score={r.score} /> · now <ScoreText score={c.current?.scores[k] ?? null} />
                </span>
                <ConfidenceBadge confidence={r.confidence} />
              </summary>
              {r.evidence.length === 0 ? (
                <p className="pt-2 text-xs text-muted-foreground">Nothing known yet.</p>
              ) : (
                <ul className="space-y-1.5 pt-2">
                  {r.evidence.map((e) => (
                    <li key={e.id} className="text-sm">
                      <span>{e.text}</span>
                      {e.effect !== 0 ? (
                        <span className="ml-1 text-xs tabular-nums text-muted-foreground">
                          ({e.effect > 0 ? '+' : ''}
                          {e.effect})
                        </span>
                      ) : null}{' '}
                      <SourceLine source={e.source} />
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )
        })}
      </div>
    </section>
  )
}
