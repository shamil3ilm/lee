'use client'
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowDownUp, Loader2, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ComponentHeadlineKey } from '@/lib/cv-score/types'
import { batch, HEADLINE_ORDER, HEADLINE_SHORT, scoreTone, type BatchResult } from './client'

type SortKey = 'total' | ComponentHeadlineKey

/** Master CV vs every active application — heatmap sorted by Total Match. */
export function BatchPanel() {
  const [includeAi, setIncludeAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BatchResult | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'desc' | 'asc' }>({ key: 'total', dir: 'desc' })

  async function run(): Promise<void> {
    setBusy(true)
    const res = await batch(includeAi)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setResult(res.data)
  }

  function toggleSort(key: SortKey): void {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  }

  const rows = result
    ? [...result.rows].sort((x, y) => {
        const vx = (sort.key === 'total' ? x.total : x.scores[sort.key]) ?? -1
        const vy = (sort.key === 'total' ? y.total : y.scores[sort.key]) ?? -1
        return sort.dir === 'desc' ? vy - vx : vx - vy
      })
    : []

  const header = (key: SortKey, label: string) => (
    <th className="px-1 py-2 text-center font-medium">
      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-0.5 hover:text-foreground">
        {label}
        {sort.key === key ? <ArrowDownUp className="size-3" /> : null}
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Scores your latest master CV against every saved / applied / screening / interviewing application — see where to tailor first.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={includeAi} onChange={(e) => setIncludeAi(e.target.checked)} />
              Include AI requirement check (slower)
            </label>
            <Button onClick={() => void run()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Table2 />}
              Run batch
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {result.masterLabel} vs {result.rows.length} active application{result.rows.length === 1 ? '' : 's'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active applications to score against.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 pr-2 text-left font-medium">Job</th>
                      {header('total', 'Total')}
                      {HEADLINE_ORDER.map((k) => header(k, HEADLINE_SHORT[k]))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.applicationId} className="border-b last:border-0">
                        <td className="max-w-[200px] py-1.5 pr-2">
                          <Link href={`/applications/${r.applicationId}`} className="block truncate font-medium hover:underline">
                            {r.jobTitle}
                          </Link>
                          <span className="block truncate text-muted-foreground">
                            {r.companyName ?? '—'} · {r.status}
                          </span>
                          {r.missingSkills.length ? (
                            <span className="block truncate text-rose-600" title={r.missingSkills.join(', ')}>
                              missing: {r.missingSkills.slice(0, 3).join(', ')}
                            </span>
                          ) : null}
                        </td>
                        {(['total', ...HEADLINE_ORDER] as SortKey[]).map((k) => {
                          const v = k === 'total' ? r.total : r.scores[k]
                          const tone = scoreTone(v)
                          return (
                            <td key={k} className="px-0.5 py-1">
                              <div className={cn('rounded px-1 py-1.5 text-center tabular-nums', tone.bg, tone.text, k === 'total' && 'font-semibold')}>
                                {v ?? '—'}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.truncated ? <p className="mt-2 text-xs text-muted-foreground">Showing the first 50 applications.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
