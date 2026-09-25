import { Fragment } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { JourneyCounts } from '@/lib/journey/service'

interface Stage {
  key: keyof JourneyCounts
  label: string
  href: string
}

const STAGES: Stage[] = [
  { key: 'found', label: 'Found', href: '/discoveries' },
  { key: 'applied', label: 'Applied', href: '/applications?status=applied' },
  { key: 'interviewing', label: 'Interviewing', href: '/applications?status=interview' },
  { key: 'offers', label: 'Offers', href: '/applications?status=offer' },
]

interface JourneyStripProps {
  counts: JourneyCounts
}

export function JourneyStrip({ counts }: JourneyStripProps) {
  return (
    <nav aria-label="Journey stages">
      <ol className="flex flex-wrap items-stretch gap-2">
        {STAGES.map((stage, i) => (
          <Fragment key={stage.key}>
            {i > 0 ? (
              <li aria-hidden className="hidden items-center text-muted-foreground sm:flex">
                <ChevronRight className="size-4" />
              </li>
            ) : null}
            <li className="min-w-[8rem] flex-1">
              <Link
                href={stage.href}
                className="flex h-full flex-col rounded-lg border bg-card px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-2xl font-semibold tabular-nums">{counts[stage.key]}</span>
                <span className="text-xs text-muted-foreground">{stage.label}</span>
              </Link>
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
