'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ClipboardCopy, Cloud, FileText, Gauge, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { scoreVariantAction, variantDriveAction } from '@/app/(authed)/settings/variants/actions'
import { variantPdfUrl } from '@/lib/variants/pdf-client'
import { useVariantPdf, type VariantPdf } from './use-variant-pdf'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

interface VariantOutputsProps {
  variantId: string
  plainText: string
  /** Outputs use the SAVED version; unsaved edits must be saved first. */
  dirty: boolean
}

type Busy = 'drive' | 'score' | null

export function VariantOutputs({ variantId, plainText, dirty }: VariantOutputsProps) {
  const [busy, setBusy] = useState<Busy>(null)
  const pdf = useVariantPdf(variantId)
  const [score, setScore] = useState<string | null>(null)
  const [, start] = useTransition()

  const run = (kind: Exclude<Busy, null>, fn: () => Promise<void>): void => {
    setBusy(kind)
    start(async () => {
      try {
        await fn()
      } catch {
        toast.error('Something went wrong. Please try again.')
      } finally {
        setBusy(null)
      }
    })
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(plainText)
      toast.success('Plain text copied')
    } catch {
      toast.error('Copy failed — select the text and copy it.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outputs</CardTitle>
        <CardDescription>{dirty ? 'Save first: PDF, Drive and score use the saved version.' : 'From the saved version.'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={dirty || busy !== null || pdf.busy} onClick={() => void pdf.make()}>
            {pdf.busy ? <Loader2 className="animate-spin" /> : <FileText />} Make PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={dirty || busy !== null || pdf.busy}
            onClick={() =>
              run('drive', async () => {
                const r = await variantDriveAction(variantId)
                if ('error' in r) toast.error(r.error)
                else toast.success('PDF saved to Drive (lee/CVs)')
              })
            }
          >
            {busy === 'drive' ? <Loader2 className="animate-spin" /> : <Cloud />} Save PDF to Drive
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={dirty || busy !== null || pdf.busy}
            onClick={() =>
              run('score', async () => {
                const r = await scoreVariantAction(variantId)
                if ('error' in r) toast.error(r.error)
                else setScore(r.score === null ? 'Not enough to score yet' : `${r.score}/100 (${r.grade ?? '—'})`)
              })
            }
          >
            {busy === 'score' ? <Loader2 className="animate-spin" /> : <Gauge />} Score this variant
          </Button>
        </div>
        <PdfStatus pdf={pdf} />
        {score ? <p className="text-sm" data-testid="variant-score">CV Score: {score}</p> : null}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Plain text for portal forms</h3>
            <Button type="button" size="sm" variant="ghost" onClick={() => void copy()}>
              <ClipboardCopy /> Copy
            </Button>
          </div>
          <Textarea aria-label="Plain-text résumé" readOnly rows={8} value={plainText} className="font-mono text-xs" />
        </div>
      </CardContent>
    </Card>
  )
}

function EditorLink({ documentId }: { documentId: string }) {
  return (
    <Link className="text-primary hover:underline" href={`/documents/${documentId}/edit`}>
      Open in the LaTeX editor
    </Link>
  )
}

/** Progress, result and failure of "Make PDF" (announced to screen readers). */
function PdfStatus({ pdf }: { pdf: VariantPdf }) {
  const { state } = pdf
  if (state.phase === 'idle') return null
  return (
    <div role="status" aria-live="polite" data-testid="variant-pdf-status" data-phase={state.phase} className="space-y-1 text-sm">
      {state.phase === 'preparing' ? <p className="text-muted-foreground">Preparing the LaTeX document…</p> : null}
      {state.phase === 'compiling' ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span>Compiling the PDF… {pdf.elapsed > 0 ? `${pdf.elapsed} s` : ''}</span>
          <Button type="button" size="sm" variant="ghost" onClick={pdf.cancel}>
            Cancel
          </Button>
        </p>
      ) : null}
      {state.phase === 'ready' ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-muted-foreground">PDF ready ({Math.max(1, Math.round(state.bytes / 1024))} KB).</span>
          <a className="text-primary hover:underline" href={variantPdfUrl(state.documentId)} target="_blank" rel="noreferrer">
            Download PDF
          </a>
          <EditorLink documentId={state.documentId} />
        </p>
      ) : null}
      {state.phase === 'failed' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-destructive">{state.message}</p>
          {state.canRetry ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void pdf.make()}>
              Try again
            </Button>
          ) : null}
          {state.documentId ? <EditorLink documentId={state.documentId} /> : null}
        </div>
      ) : null}
    </div>
  )
}
