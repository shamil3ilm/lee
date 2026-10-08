import Link from 'next/link'
import { Columns3, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import type { Comparison } from '@/lib/compare/compare'
import type { SavedNarrative } from '@/lib/compare/narrative'
import { CriteriaChart } from './criteria-chart'
import { BenefitsTable, CriteriaBreakdown, PayDetails } from './comparison-details'
import { GainsLosses, RedFlagsList, ReviewsSection } from './comparison-lists'
import { NarrativePanel } from './narrative-panel'
import { QuestionsList } from './questions-list'
import { PasteJdForm } from './paste-jd-form'

interface ComparisonCardProps {
  comparison: Comparison | null
  hasCurrent: boolean
  saved: SavedNarrative | null
  citations: Record<string, string>
}

/** "Compare with current job" on the discovery and application detail pages. */
export function ComparisonCard({ comparison: c, hasCurrent, saved, citations }: ComparisonCardProps) {
  return (
    <Card data-testid="comparison-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4" aria-hidden="true" />
          Compare with current job
        </CardTitle>
        {c && hasCurrent ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/compare?ids=${encodeURIComponent(c.key)}`}>
              <Columns3 className="size-4" />
              Side by side
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasCurrent || !c ? (
          <EmptyState
            size="sm"
            icon={Scale}
            title="Add your current job to compare"
            description="Pay, benefits and how your job feels now, kept private. Then every posting shows what you would gain, lose and still need to ask."
            action={
              <Button asChild size="sm">
                <Link href="/settings/current-job">Add current job</Link>
              </Button>
            }
          />
        ) : (
          <>
            <p className="text-base font-medium" data-testid="compare-verdict">
              {c.verdict}
            </p>
            {c.jd.status === 'thin' ? (
              c.jd.canPaste ? (
                <PasteJdForm discoveryId={c.key.slice(2)} />
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  This job has little or no description, so benefits, growth and work-life are unknown. Add the full description with
                  “Edit” at the top of the page.
                </p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                Read from the full job description{c.jd.pasted ? ' you pasted' : ''}; each signal quotes the line it came from.
              </p>
            )}
            <CriteriaChart
              series={[
                { key: 'current', label: 'Current job', scores: c.current?.scores ?? c.job.scores },
                { key: c.key, label: 'This job', scores: c.job.scores },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Scores are 0–100. Pay, benefits and location use your current job as the 50 baseline; growth, environment, stability and
              work-life use your own ratings for it. Unknown criteria draw no bar and are left out of totals.
            </p>
            <GainsLosses c={c} />
            <PayDetails c={c} />
            <BenefitsTable rows={c.checklist} id={c.key} />
            <RedFlagsList c={c} />
            <ReviewsSection c={c} />
            <QuestionsList questions={c.questions} id={c.key} />
            <CriteriaBreakdown c={c} />
            <NarrativePanel opportunityKey={c.key} saved={saved} citations={citations} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
