'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { KeywordDetails } from '@/lib/cv-score/dimensions/keywords'
import type { RequirementFitDetails } from '@/lib/cv-score/requirement-fit'
import { isSkipped, type ComponentHeadlineKey, type Severity } from '@/lib/cv-score/types'
import { HEADLINE_ORDER, type CvScoreRecord, type HistoryPoint } from './client'
import { FindingsList } from './findings-list'
import { HeadlineCard } from './headline-card'
import { KeywordPanel } from './keyword-panel'
import { RequirementFitTable } from './requirement-fit-table'
import { ScoreRing } from './score-ring'

// recharts is ~117 KB gz: load the history chart only when its tab opens.
// The skeleton matches the chart's fixed h-48 so the tab does not jump.
function HistoryChartSkeleton() {
  return <div className="h-48 w-full animate-pulse rounded-md bg-muted/40" aria-hidden />
}

const HistoryChart = dynamic(
  () => import('./history-chart').then((m) => m.HistoryChart),
  { ssr: false, loading: HistoryChartSkeleton },
)

const JD_ONLY: ComponentHeadlineKey[] = ['roleMatch', 'skillsMatch', 'experienceMatch']

interface ScoreResultsProps {
  result: CvScoreRecord
  history: HistoryPoint[]
  onPreviewFix?: (ids: string[]) => void
}

export function ScoreResults({ result, history, onPreviewFix }: ScoreResultsProps) {
  const [severity, setSeverity] = useState<Severity | 'all'>('all')
  const [headline, setHeadline] = useState<ComponentHeadlineKey | 'all'>('all')
  const [tab, setTab] = useState('findings')

  const kw = result.dimensions.keywords && !isSkipped(result.dimensions.keywords)
    ? (result.dimensions.keywords.details as KeywordDetails)
    : null
  const fit = result.dimensions.requirementFit && !isSkipped(result.dimensions.requirementFit)
    ? (result.dimensions.requirementFit.details as RequirementFitDetails)
    : null
  const skippedNotes = result.skipped.filter((s) => s.code !== 'no_jd')

  function focusHeadline(k: ComponentHeadlineKey): void {
    setHeadline(k)
    setSeverity('all')
    setTab('findings')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
          <ScoreRing score={result.total.score} grade={result.total.grade} label={result.total.label} />
          <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{result.total.label}</p>
            <p className="text-lg font-semibold">{result.total.verdict}</p>
            <p className="text-sm text-muted-foreground">
              {result.source.label}
              {result.target ? ` → ${result.target.title}${result.target.companyName ? ` at ${result.target.companyName}` : ''}` : ''}
            </p>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">How is {result.total.label} computed?</summary>
              <ul className="mt-1.5 space-y-0.5">
                {result.weights.map((w) => (
                  <li key={w.key}>
                    {w.label}: {w.base}%
                    {Math.round(w.effective * 100) !== w.base ? ` → ${Math.round(w.effective * 1000) / 10}% after renormalising` : ''}
                    {w.effective === 0 ? ' (skipped)' : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Scorer v{result.scorerVersion}. Grades: A ≥ 85, B ≥ 75, C ≥ 65, D ≥ 50, F below.</p>
            </details>
            {skippedNotes.length ? (
              <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 p-2 text-left text-xs text-amber-700 dark:text-amber-300">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <ul className="space-y-0.5">
                  {skippedNotes.map((s) => (
                    <li key={`${s.key}-${s.code}`}>
                      <span className="font-medium">{s.key}</span> skipped — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {HEADLINE_ORDER.map((k) => (
          <HeadlineCard
            key={k}
            score={result.scores[k]}
            jdOnly={JD_ONLY.includes(k)}
            findings={result.findings.filter((f) => f.headlines.includes(k))}
            onFilter={() => focusHeadline(k)}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="findings">Findings ({result.findings.length})</TabsTrigger>
              {kw ? <TabsTrigger value="keywords">Keywords</TabsTrigger> : null}
              {fit ? <TabsTrigger value="fit">Requirement fit</TabsTrigger> : null}
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="findings" className="pt-2">
              <FindingsList
                findings={result.findings}
                severity={severity}
                headline={headline}
                onSeverity={setSeverity}
                onHeadline={setHeadline}
                onPreviewFix={onPreviewFix}
              />
            </TabsContent>
            {kw ? (
              <TabsContent value="keywords" className="pt-2">
                <KeywordPanel details={kw} />
              </TabsContent>
            ) : null}
            {fit ? (
              <TabsContent value="fit" className="pt-2">
                <RequirementFitTable details={fit} aiCallId={result.aiCallId} />
              </TabsContent>
            ) : null}
            <TabsContent value="history" className="pt-2">
              <HistoryChart points={history} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
