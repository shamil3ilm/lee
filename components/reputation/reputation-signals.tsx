import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SignalView, SourceStatusView } from '@/lib/reputation/view'
import type { CompanyFacts } from '@/lib/reputation/types'

const CATEGORY_LABEL: Record<string, string> = {
  layoffs: 'Layoffs',
  lawsuit: 'Lawsuit',
  fraud: 'Fraud',
  wage_theft: 'Unpaid wages',
  visa_contract: 'Visa / contract',
  funding: 'Funding',
  other: 'News',
}

function SignalRow({ s }: { s: SignalView }) {
  return (
    <li id={`signal-${s.id}`} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0">
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-start gap-1 font-medium hover:underline"
        >
          <span className="break-words">{s.title}</span>
          <ExternalLink className="mt-1 size-3 shrink-0" />
        </a>
        <div className="text-xs text-muted-foreground">
          {s.sourceLabel}
          {s.dateLabel ? ` · ${s.dateLabel}` : ''}
        </div>
      </div>
      {s.category ? (
        <Badge variant={s.alarming ? 'danger' : s.category === 'funding' ? 'success' : 'neutral'} className="shrink-0">
          {CATEGORY_LABEL[s.category] ?? 'News'}
        </Badge>
      ) : null}
    </li>
  )
}

export function ReputationFacts({ facts }: { facts: CompanyFacts | null }) {
  if (!facts) return null
  const rows: Array<[string, string | null]> = [
    ['Founded', facts.founded],
    ['HQ', facts.headquarters],
    ['Industry', facts.industry],
    ['Employees', facts.employees !== null ? `~${facts.employees.toLocaleString('en-US')}` : null],
  ]
  return (
    <div className="rounded-md border px-3 py-2 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Wikidata</span>
        <a
          href={facts.wikipediaUrl ?? `https://www.wikidata.org/wiki/${facts.wikidataId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Source <ExternalLink className="size-3" />
        </a>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-xs">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  )
}

export function ReputationSignals({ signals, statuses }: { signals: SignalView[]; statuses: SourceStatusView[] }) {
  return (
    <div className="space-y-3">
      {signals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No signals yet. Refresh to search Hacker News, news and Wikidata.</p>
      ) : (
        <ul className="space-y-2">
          {signals.map((s) => (
            <SignalRow key={s.id} s={s} />
          ))}
        </ul>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Source status">
        {statuses.map((st) => (
          <li key={st.source} title={st.error ?? undefined}>
            <span className={st.state === 'error' ? 'text-danger' : undefined}>
              {st.label}: {st.state === 'never' ? 'not fetched' : st.state === 'ok' ? `${st.count} found` : 'failed'}
            </span>
            {st.atLabel ? ` · ${st.atLabel}` : ''}
            {st.error ? <span className="block text-danger">{st.error}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
