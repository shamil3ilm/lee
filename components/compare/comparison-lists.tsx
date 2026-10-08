import Link from 'next/link'
import { AlertTriangle, ExternalLink, Minus, Plus, HelpCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Comparison } from '@/lib/compare/compare'
import type { ListItem } from '@/lib/compare/verdict'
import { SourceLine } from './confidence'

/** Gains / losses / unknowns, red flags and reviews for one comparison. */

function ItemList({ title, items, icon: Icon, testId }: { title: string; items: readonly ListItem[]; icon: typeof Plus; testId: string }) {
  return (
    <div className="min-w-0 space-y-1.5" data-testid={testId}>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {title} <span className="tabular-nums">({items.length})</span>
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i, n) => (
            <li key={`${i.topic}-${n}`} className="text-sm">
              <span>{i.text}</span> <SourceLine source={i.source} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function GainsLosses({ c }: { c: Comparison }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ItemList title="Gains" items={c.gains} icon={Plus} testId="compare-gains" />
      <ItemList title="Losses" items={c.losses} icon={Minus} testId="compare-losses" />
      <ItemList title="Unknowns" items={c.unknowns} icon={HelpCircle} testId="compare-unknowns" />
    </div>
  )
}

export function RedFlagsList({ c }: { c: Comparison }) {
  if (c.redFlags.length === 0) return null
  return (
    <section aria-labelledby={`flags-${c.key}`} className="space-y-2">
      <h3 id={`flags-${c.key}`} className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
        Red flags
      </h3>
      <ul className="space-y-1.5">
        {c.redFlags.map((f, i) => (
          <li key={i} className="text-sm">
            <Badge variant={f.confirmed ? 'danger' : 'warning'} className="mr-1.5 text-[10px]">
              {f.confirmed ? 'Confirmed' : 'To check'}
            </Badge>
            {f.text} <SourceLine source={f.source} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ReviewsSection({ c }: { c: Comparison }) {
  const r = c.reviews
  return (
    <section aria-labelledby={`reviews-${c.key}`} className="space-y-2">
      <h3 id={`reviews-${c.key}`} className="text-sm font-semibold">
        Reviews
      </h3>
      {r.ratings.length > 0 ? (
        <p className="text-sm">
          Your recorded ratings average <span className="font-medium tabular-nums">{r.average}/5</span> across{' '}
          {r.ratings.map((x) => `${x.site} ${x.rating}`).join(', ')}.{' '}
          {r.companyHref ? (
            <Link href={r.companyHref} className="text-xs underline underline-offset-2">
              Company reputation
            </Link>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No ratings recorded yet.{' '}
          {r.companyHref ? (
            <Link href={r.companyHref} className="underline underline-offset-2">
              Record what you read
            </Link>
          ) : (
            'Read the sites below, then record a rating on the company page.'
          )}
        </p>
      )}
      {r.links.length > 0 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {r.links.map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {l.label}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">lee never scrapes review sites; these links open a search you read yourself.</p>
    </section>
  )
}
