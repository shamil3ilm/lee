'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface ImportResponse {
  inserted?: number
  errors?: Array<{ line: number; message: string }>
  error?: string
}

const SAMPLE_CSV = `date,amount,currency,category,subcategory,vendor,description
2026-09-15,649,INR,subscription,streaming,Netflix,
2026-09-16,250,INR,transport,,Uber,Ride home
`

/**
 * CSV import UI — paste a CSV or upload a file. On success reports the
 * insert count + any per-line errors so the user can fix and re-submit.
 */
export function ExpenseImportForm() {
  const router = useRouter()
  const [csv, setCsv] = useState('')
  const [pending, startTransition] = useTransition()
  const [lastErrors, setLastErrors] = useState<
    Array<{ line: number; message: string }> | null
  >(null)

  async function readFile(file: File): Promise<void> {
    const text = await file.text()
    setCsv(text)
  }

  function submit(): void {
    if (!csv.trim()) {
      toast.error('Paste or upload a CSV first.')
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/expenses/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv }),
        })
        const json = (await res.json()) as ImportResponse
        if (!res.ok) {
          toast.error(json.error ?? 'Import failed.')
          return
        }
        const errors = json.errors ?? []
        setLastErrors(errors.length > 0 ? errors : null)
        toast.success(
          `Imported ${json.inserted ?? 0} expenses${errors.length > 0 ? ` (${errors.length} skipped)` : ''}`,
        )
        if ((json.inserted ?? 0) > 0) {
          router.push('/expenses')
          router.refresh()
        }
      } catch {
        toast.error('Network error — import aborted.')
      }
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5">
          <Label htmlFor="csv-file">Upload CSV</Label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void readFile(f)
            }}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="csv-body">Or paste CSV</Label>
          <Textarea
            id="csv-body"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={SAMPLE_CSV}
            rows={12}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Header row required: date, amount, currency, category, subcategory,
            vendor, description
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCsv(SAMPLE_CSV)}
          >
            Load sample
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Import CSV
          </Button>
        </div>
        {lastErrors && lastErrors.length > 0 ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <div className="text-xs font-semibold text-destructive">
              {lastErrors.length} row{lastErrors.length === 1 ? '' : 's'} skipped
            </div>
            <ul className="mt-2 space-y-1 text-xs text-destructive">
              {lastErrors.slice(0, 10).map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  Line {e.line}: {e.message}
                </li>
              ))}
              {lastErrors.length > 10 ? (
                <li className="text-muted-foreground">
                  … and {lastErrors.length - 10} more.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
