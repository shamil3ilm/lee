'use client'
import { Building2, ExternalLink, MapPin, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ReachOutDialog } from './reach-out-dialog'
import { sourceTagLabel, type CompanyCardData } from './types'

/**
 * The secondary detail of a company row, shown on demand: what it does,
 * why it ranks where it does (each fit part with its points), why it is
 * under the radar, where lee found it, and Reach out.
 */

function chipTone(kind: string, warn?: boolean): 'warning' | 'success' | 'info' | 'neutral' {
  if (warn) return 'warning'
  if (kind === 'preferred' || kind === 'warm') return 'success'
  if (kind === 'hiring') return 'info'
  return 'neutral'
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function CompanyDetails({ c }: { c: CompanyCardData }) {
  const fitParts = c.chips.filter((ch) => ch.kind !== 'growth')
  const profile = [c.industries.slice(0, 3).join(' · '), c.sizeBand ? `${c.sizeBand} people` : null, c.stage].filter(Boolean).join(' · ')
  return (
    <div className="space-y-3">
      {c.description ? <p className="text-sm text-muted-foreground">{c.description}</p> : null}
      <dl className="grid gap-3 sm:grid-cols-2">
        {profile ? (
          <Fact label="Profile">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {profile}
            </span>
          </Fact>
        ) : null}
        {c.locationChain ? (
          <Fact label="Location">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {c.locationChain}
            </span>
          </Fact>
        ) : null}
        <Fact label="Found via">
          {c.sourceTags.length > 0 ? c.sourceTags.map(sourceTagLabel).join(', ') : 'Unknown'}
          {c.listedAt ? (
            <a href={c.listedAt} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs underline underline-offset-4">
              Listing
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </Fact>
        {c.careersUrl || c.enrichStatus === 'pending' || c.careersNote ? (
          <Fact label="Careers">
            {c.careersUrl ? (
              <a href={c.careersUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                {c.boardLabel ? `${c.boardLabel} board` : 'Careers page'}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : c.enrichStatus === 'pending' ? (
              'Careers check queued'
            ) : null}
            {c.careersNote ? <span className="block text-xs text-muted-foreground">{c.careersNote}</span> : null}
          </Fact>
        ) : null}
      </dl>
      {fitParts.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Why this rank (fit {c.fitScore ?? '—'})</p>
          <ul className="flex flex-wrap gap-1" aria-label="Why this rank">
            {fitParts.map((ch) => (
              <li key={`${ch.kind}-${ch.label}`}>
                <Badge variant={chipTone(ch.kind, ch.warn)} className="font-normal">
                  {ch.label}
                  {ch.points > 0 ? <span className="ml-1 tabular-nums">+{ch.points}</span> : null}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {c.hiddenGem && c.radarReasons.length > 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="radar-reasons">
          <span className="font-medium text-foreground">Under the radar:</span> {c.radarReasons.join(' · ')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <ReachOutDialog companyId={c.id} companyName={c.name} tracked={c.tracked} />
        {c.githubLogin ? (
          <a href={`https://github.com/${c.githubLogin}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 text-xs text-muted-foreground underline underline-offset-4">
            <Building2 className="size-3.5" aria-hidden="true" />
            GitHub
          </a>
        ) : null}
      </div>
    </div>
  )
}
