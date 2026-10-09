'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ImportReviewPanel } from '@/components/import/import-review-panel'
import { applyUrlImportAction, previewUrlImportAction } from '@/app/(authed)/settings/profile/import-actions'
import type { ImportItem } from '@/lib/import/types'
import type { UrlProposal } from '@/lib/profile/url-import-review'

interface Preview {
  proposal: UrlProposal
  items: ImportItem[]
  aiUsed: boolean
  editable: boolean
}

/**
 * Import from a public résumé or portfolio page: fetched server-side, shown
 * item by item (skills as chips, the rest as rows with new / already in lee
 * / update), saved only for the items the user ticks.
 */
export function UrlImportCard() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [pending, start] = useTransition()

  const read = (): void =>
    start(async () => {
      const r = await previewUrlImportAction(url)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setPreview({ proposal: r.proposal, items: r.items, aiUsed: r.aiUsed, editable: r.editable })
    })

  return (
    <Card id="url-import" className="scroll-mt-28">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
          Import from a public page
        </CardTitle>
        <CardDescription>
          Your résumé page or portfolio. We read its text (no scripts), list what we found item by item and save only what you confirm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="url" aria-label="Page URL" placeholder="https://your-site.example/resume" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="button" onClick={read} disabled={pending || !url.trim()}>
            {pending ? 'Reading…' : 'Preview import'}
          </Button>
        </div>
        {preview ? (
          <div data-testid="url-import-diff">
            <ImportReviewPanel
              key={preview.proposal.url + preview.items.length}
              items={preview.items}
              suggestOnly={!preview.editable}
              intro={
                <p className="text-xs text-muted-foreground">
                  {preview.items.length === 0 ? 'Nothing new on that page.' : 'New items are ticked; items already in lee are not. Untick anything that is not yours.'}
                  {preview.aiUsed ? '' : ' (AI parsing unavailable: skills come from known terms only.)'}
                </p>
              }
              onApply={(selection) => applyUrlImportAction(preview.proposal, selection)}
              onCancel={() => setPreview(null)}
              onApplied={() => router.refresh()}
              onDone={() => setPreview(null)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
