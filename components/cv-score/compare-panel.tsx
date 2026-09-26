'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, GitCompare, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { compare, scoreTone, type CompareResult } from './client'
import { ApplicationSelect, DocumentSelect, type AppOption, type CvDocOption } from './source-picker'

interface ComparePanelProps {
  documents: CvDocOption[]
  applications: AppOption[]
}

/** Side-by-side headline deltas — the "tailoring delta" (master → tailored). */
export function ComparePanel({ documents, applications }: ComparePanelProps) {
  const master = documents.find((d) => d.kind === 'master_cv')
  const [a, setA] = useState(master?.id ?? '')
  const [b, setB] = useState('')
  const [applicationId, setApplicationId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)

  function pickB(id: string): void {
    setB(id)
    // Tailored CVs belong to an application — default the target job to it.
    const doc = documents.find((d) => d.id === id)
    if (doc?.applicationId && !applicationId) setApplicationId(doc.applicationId)
  }

  async function run(): Promise<void> {
    setBusy(true)
    const res = await compare(a, b, applicationId || null)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setResult(res.data)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <DocumentSelect id="cmp-a" label="CV A (e.g. master)" documents={documents} value={a} onChange={setA} />
            <DocumentSelect id="cmp-b" label="CV B (e.g. tailored)" documents={documents} value={b} onChange={pickB} />
            <ApplicationSelect id="cmp-app" applications={applications} value={applicationId} onChange={setApplicationId} />
          </div>
          <Button onClick={() => void run()} disabled={!a || !b || a === b || busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="animate-spin" /> : <GitCompare />}
            Compare
          </Button>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{result.summary}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Score</th>
                    <th className="py-2 pr-3 text-right font-medium">A</th>
                    <th className="py-2 pr-3 text-right font-medium">B</th>
                    <th className="py-2 text-right font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.deltas.map((d) => (
                    <tr key={d.key} className={cn('border-b last:border-0', d.key === 'total' && 'font-semibold')}>
                      <td className="py-2 pr-3">{d.label}</td>
                      <td className={cn('py-2 pr-3 text-right tabular-nums', scoreTone(d.a).text)}>{d.a ?? '—'}</td>
                      <td className={cn('py-2 pr-3 text-right tabular-nums', scoreTone(d.b).text)}>{d.b ?? '—'}</td>
                      <td
                        className={cn(
                          'py-2 text-right tabular-nums',
                          d.delta === null ? 'text-muted-foreground' : d.delta > 0 ? 'text-success' : d.delta < 0 ? 'text-danger' : '',
                        )}
                      >
                        {d.delta === null ? '—' : d.delta > 0 ? `+${d.delta}` : d.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {result.a.source.label} <ArrowRight className="size-3" /> {result.b.source.label}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
