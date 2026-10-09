import { BAND_LABELS, cappedFit, FIT_FORMULA, scoreBand } from '@/lib/discovery/match/blend'
import type { MatchComponent, MatchDetail, RequirementCheck } from '@/lib/discovery/match/types'
import { cn } from '@/lib/utils'

/**
 * "Why this score": the content behind every Fit badge. Fit is the one
 * number on cards; Match, AI, Benefits and every reason live here.
 */

export interface MatchWhyProps {
  match: number | null
  ai: number | null
  detail: MatchDetail | null
  /** Filtered by the relevance gate: AI never scores it, the Match Score still shows. */
  filtered?: boolean
  /** Benefits score (not part of Fit; the Combined sort uses it). */
  benefits?: number | null
  /** More reasons from the surface (shortlist rank parts, ranking notes). */
  extra?: React.ReactNode
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function ComponentRow({ c }: { c: MatchComponent }) {
  const tone = c.points < 0 ? 'text-danger' : c.points === 0 ? 'text-muted-foreground' : 'text-foreground'
  return (
    <li className="flex items-start justify-between gap-3 py-1">
      <span className="min-w-0 text-xs leading-snug">{c.label}</span>
      <span className={cn('shrink-0 text-xs font-medium tabular-nums', tone)}>
        {signed(c.points)}
        {c.max > 0 ? <span className="text-muted-foreground">/{c.max}</span> : null}
      </span>
    </li>
  )
}

const STATUS_LABEL: Readonly<Record<RequirementCheck['status'], string>> = {
  met: 'Met',
  partial: 'Partial',
  missing: 'Missing',
  unchecked: 'Not checked',
}

const STATUS_TONE: Readonly<Record<RequirementCheck['status'], string>> = {
  met: 'text-success',
  partial: 'text-warning',
  missing: 'text-danger',
  unchecked: 'text-muted-foreground',
}

function RequirementList({ items, label }: { items: readonly RequirementCheck[]; label: string }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium">{label}</p>
      <ul className="mt-1 space-y-1" aria-label={label}>
        {items.map((r, i) => (
          <li key={`${r.text}-${i}`} className="text-xs leading-snug">
            <span className={cn('mr-1 font-medium', STATUS_TONE[r.status])}>{STATUS_LABEL[r.status]}:</span>
            {r.text}
            {r.evidence ? <span className="block pl-3 text-[11px] text-muted-foreground">“{r.evidence}”</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function BreakdownRow({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        <span className="ml-1.5 text-muted-foreground">{hint}</span>
      </span>
      <span className="shrink-0 font-medium tabular-nums">{value ?? '—'}</span>
    </li>
  )
}

function Breakdown({ match, ai, benefits, filtered }: Pick<MatchWhyProps, 'match' | 'ai' | 'benefits' | 'filtered'>) {
  const aiHint = ai !== null ? 'AI read of the whole posting' : filtered ? 'not run on filtered postings' : 'not scored yet'
  return (
    <div className="rounded-md bg-muted px-2.5 py-1.5">
      <ul className="divide-y divide-border" aria-label="Fit breakdown">
        <BreakdownRow label="Match" value={match} hint={match !== null ? 'your ready profile evidence' : 'computed shortly'} />
        <BreakdownRow label="AI" value={ai} hint={aiHint} />
        {benefits !== undefined && benefits !== null ? (
          <BreakdownRow label="Benefits" value={benefits} hint="not in Fit; used by the Combined sort" />
        ) : null}
      </ul>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground" data-testid="fit-formula">
        {FIT_FORMULA}
      </p>
    </div>
  )
}

export function MatchWhy({ match, ai, detail, filtered, benefits, extra }: MatchWhyProps) {
  const fit = cappedFit(match, ai, detail)
  return (
    <div data-testid="match-why" className="space-y-2.5">
      <div>
        <p className="text-sm font-semibold">Why this score</p>
        <p className="text-xs text-muted-foreground">
          {fit !== null ? `Fit ${fit}/100 · ${BAND_LABELS[scoreBand(fit)]}` : 'Not scored yet (computed shortly)'}
        </p>
        {detail?.confidence === 'title_only' ? (
          <p className="mt-1 rounded-md bg-warning-soft px-2 py-1 text-xs text-warning" data-testid="match-low-confidence">
            Low confidence: title only. Paste or fetch the JD to score it properly. Capped at {detail.ceiling?.score ?? 55} until then.
          </p>
        ) : detail?.ceiling ? (
          <p className="mt-1 rounded-md bg-danger-soft px-2 py-1 text-xs text-danger" data-testid="match-ceiling">
            {detail.ceiling.reason}: capped at {detail.ceiling.score} (weak fit) while you don’t speak it well.
          </p>
        ) : null}
      </div>
      <Breakdown match={match} ai={ai} benefits={benefits} filtered={filtered} />
      {detail && detail.components.length > 0 ? (
        <div>
          <p className="text-xs font-medium">Match, part by part</p>
          <ul className="divide-y" aria-label="Score components">
            {detail.components.map((c) => (
              <ComponentRow key={c.key} c={c} />
            ))}
          </ul>
        </div>
      ) : null}
      {detail ? (
        <div className="space-y-2">
          <RequirementList label="Must-haves" items={detail.requirements.filter((r) => r.weight === 'must')} />
          <RequirementList label="Nice to have" items={detail.requirements.filter((r) => r.weight === 'nice')} />
        </div>
      ) : null}
      {detail && detail.missing.length > 0 ? (
        <p className="rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger" data-testid="match-missing">
          <span className="font-medium">Missing:</span> {detail.missing.join(', ')}
        </p>
      ) : null}
      {extra}
      {filtered ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Filtered postings are not AI-scored; the Match Score uses only your ready profile evidence.
        </p>
      ) : null}
    </div>
  )
}
