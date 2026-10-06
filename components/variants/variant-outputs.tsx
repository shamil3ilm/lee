'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ClipboardCopy, Cloud, FileText, Gauge, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { scoreVariantAction, variantDocumentAction, variantDriveAction } from '@/app/(authed)/settings/profile/variants/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

interface VariantOutputsProps {
  variantId: string
  plainText: string
  /** Outputs use the SAVED version; unsaved edits must be saved first. */
  dirty: boolean
}

type Busy = 'pdf' | 'drive' | 'score' | null

export function VariantOutputs({ variantId, plainText, dirty }: VariantOutputsProps) {
  const [busy, setBusy] = useState<Busy>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={dirty || busy !== null}
            onClick={() =>
              run('pdf', async () => {
                const r = await variantDocumentAction(variantId)
                if ('error' in r) toast.error(r.error)
                else setDocumentId(r.documentId)
              })
            }
          >
            {busy === 'pdf' ? <Loader2 className="animate-spin" /> : <FileText />} Make PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={dirty || busy !== null}
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
            disabled={dirty || busy !== null}
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
        {documentId ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a className="text-primary hover:underline" href={`/api/documents/${documentId}/pdf`} target="_blank" rel="noreferrer">
              Download PDF
            </a>
            <Link className="text-primary hover:underline" href={`/documents/${documentId}/edit`}>
              Open in the LaTeX editor
            </Link>
          </p>
        ) : null}
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
