'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { rankByTotal, weightedTotal, type CriterionScores } from '@/lib/compare/score'
import { CRITERIA, CRITERION_LABELS, type Criterion } from '@/lib/compare/types'
import { CriteriaChart } from './criteria-chart'

export interface CompareItem {
  key: string
  title: string
  companyName: string | null
  href: string
  verdict: string
  scores: CriterionScores
}

interface CompareTableProps {
  current: CriterionScores | null
  items: readonly CompareItem[]
  initialWeights: Record<Criterion, number>
}

const MAX_WEIGHT = 3

function Score({ v }: { v: number | null }) {
  return v === null ? <span className="text-muted-foreground">?</span> : <span className="tabular-nums">{v}</span>
}

/** Side-by-side table + chart, sorted by the weighted total; weights edit live. */
export function CompareTable({ current, items, initialWeights }: CompareTableProps) {
  const [weights, setWeights] = useState(initialWeights)
  const ranked = useMemo(() => rankByTotal(items, weights), [items, weights])
  const currentTotal = current ? weightedTotal(current, weights) : null

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">Weights</legend>
        <p className="text-xs text-muted-foreground">
          0 ignores a criterion, {MAX_WEIGHT} counts it three times. Starts from “what I want more of”; changes here are not saved.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CRITERIA.map((c) => (
            <label key={c} className="grid gap-1 text-sm">
              <span className="flex items-center justify-between">
                {CRITERION_LABELS[c]} <span className="tabular-nums text-muted-foreground">×{weights[c]}</span>
              </span>
              <input
                type="range"
                min={0}
                max={MAX_WEIGHT}
                step={1}
                value={weights[c]}
                aria-label={`${CRITERION_LABELS[c]} weight`}
                className="accent-primary"
                onChange={(e) => setWeights((w) => ({ ...w, [c]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setWeights(initialWeights)}>
          <RotateCcw className="size-4" />
          Reset weights
        </Button>
      </fieldset>

      <Table aria-label="Jobs compared, best weighted total first">
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead className="text-right">Total</TableHead>
            {CRITERIA.map((c) => (
              <TableHead key={c} className="text-right">
                {CRITERION_LABELS[c]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {current && currentTotal ? (
            <TableRow className="bg-muted/50">
              <TableCell className="font-medium">
                Current job <Badge variant="neutral" className="ml-1 text-[10px]">Baseline</Badge>
              </TableCell>
              <TableCell className="text-right font-semibold">
                <Score v={currentTotal.score} />
              </TableCell>
              {CRITERIA.map((c) => (
                <TableCell key={c} className="text-right">
                  <Score v={current[c]} />
                </TableCell>
              ))}
            </TableRow>
          ) : null}
          {ranked.map((r) => (
            <TableRow key={r.key} data-testid="compare-row">
              <TableCell className="min-w-48">
                <Link href={r.href} className="font-medium underline-offset-2 hover:underline">
                  {r.title}
                </Link>
                {r.companyName ? <div className="text-xs text-muted-foreground">{r.companyName}</div> : null}
                <div className="text-xs text-muted-foreground">{r.verdict}</div>
              </TableCell>
              <TableCell className="text-right font-semibold">
                <Score v={r.total.score} />
                <div className="text-[10px] font-normal text-muted-foreground">{Math.round(r.total.coverage * 100)}% known</div>
              </TableCell>
              {CRITERIA.map((c) => (
                <TableCell key={c} className="text-right">
                  <Score v={r.scores[c]} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <CriteriaChart
        className="h-96 w-full"
        series={[
          ...(current ? [{ key: 'current', label: 'Current job', scores: current }] : []),
          ...ranked.map((r) => ({ key: r.key, label: r.title.length > 28 ? `${r.title.slice(0, 27)}…` : r.title, scores: r.scores })),
        ]}
      />
    </div>
  )
}
