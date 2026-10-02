import { Fragment } from 'react'
import Link from 'next/link'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'
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
      {/* Equal cells in a grid (2 up on phones, 4 up from sm): the old
          wrapping flex row left "Offers" alone on a second line. */}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((stage) => (
          <Fragment key={stage.key}>
            <li className="min-w-0">
              <Link
                href={stage.href}
                className={cn(
                  'flex h-full flex-col rounded-lg border bg-card px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-accent',
                  focusRing,
                )}
              >
                <span className="text-2xl font-semibold tabular-nums">{counts[stage.key]}</span>
                <span className="truncate text-xs text-muted-foreground">{stage.label}</span>
              </Link>
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
