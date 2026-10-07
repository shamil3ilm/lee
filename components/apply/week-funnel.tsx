import Link from 'next/link'
import { ArrowRight, ChevronRight, Filter } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FUNNEL_LABELS, FUNNEL_STEPS, type WeekFunnel as WeekFunnelData } from '@/lib/apply/funnel'

/** "This week": shortlisted → prepared → applied → replied → interview, linked to Analytics. */
export function WeekFunnel({ funnel }: { funnel: WeekFunnelData }) {
  return (
    <Card data-testid="week-funnel">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" aria-hidden="true" />
          This week
        </CardTitle>
        <Link
          href="/analytics"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Analytics
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        <ol className="grid grid-cols-5 items-start gap-1 text-center" aria-label="This week’s funnel">
          {FUNNEL_STEPS.map((step, i) => (
            <li key={step} className="relative min-w-0">
              <div className="text-xl font-semibold tabular-nums">{funnel[step]}</div>
              <div className="truncate text-[11px] text-muted-foreground">{FUNNEL_LABELS[step]}</div>
              {i < FUNNEL_STEPS.length - 1 ? (
                <ChevronRight
                  className="absolute -right-2 top-1.5 size-4 text-muted-foreground/60 max-sm:hidden"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
