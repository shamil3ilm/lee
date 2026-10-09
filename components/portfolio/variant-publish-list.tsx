'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { publishVariantAction, unpublishVariantAction } from '@/app/(authed)/settings/publish/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { VariantPublishOutcome } from '@/lib/portfolio/variant-publish'

export interface VariantPublishRow {
  id: string
  name: string
  slug: string
  /** Public page URL, or null without a portfolio canonical URL. */
  pageUrl: string | null
  /** "Published Sep 27 (1.0.2)", computed on the server; null = not published. */
  status: string | null
  commitUrl: string | null
  published: boolean
}

type Conflict = Extract<VariantPublishOutcome, { status: 'conflict' }>

const REASONS: Readonly<Record<Conflict['reason'], string>> = {
  edited: 'was edited outside lee since lee last wrote it.',
  deleted: 'was deleted from the repository outside lee.',
  changed_during_publish: 'changed on GitHub while lee was publishing.',
  unreadable: 'in the repository is not valid JSON.',
}

function Row({ row, ready }: { row: VariantPublishRow; ready: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [confirm, setConfirm] = useState(false)
  const file = `variants/${row.slug}.json`

  const handle = (o: VariantPublishOutcome): void => {
    setConflict(null)
    setErrors([])
    if (o.status === 'published') toast.success(`Published ${row.name} (${o.version})`)
    else if (o.status === 'up_to_date') toast.success('Already up to date')
    else if (o.status === 'conflict') setConflict(o)
    else if (o.status === 'invalid') {
      setErrors(o.errors)
      toast.error('The portfolio build would reject this file')
    } else toast.error(o.error)
    router.refresh()
  }

  const publish = (overwrite?: { overwriteSha: string | null }): void =>
    start(async () => {
      const r = await publishVariantAction(row.id, overwrite)
      if ('error' in r) toast.error(r.error)
      else handle(r.outcome)
    })

  const unpublish = (): void =>
    start(async () => {
      const r = await unpublishVariantAction(row.id)
      if ('error' in r) toast.error(r.error)
      else if (r.outcome.status !== 'removed') toast.error(r.outcome.error)
      else {
        setConfirm(false)
        toast.success(`Removed ${file}`)
        router.refresh()
      }
    })

  return (
    <li className="space-y-2 rounded-md border p-3" data-testid={`variant-publish-${row.slug}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/settings/variants/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
        <code className="text-xs text-muted-foreground">{file}</code>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => publish()} disabled={pending || !ready}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />} Publish
          </Button>
          {row.published ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)} disabled={pending || !ready}>
              <Trash2 /> Unpublish
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {row.status ?? 'Not published yet.'}
        {row.commitUrl ? (
          <>
            {' · '}
            <a href={row.commitUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              view commit
            </a>
          </>
        ) : null}
        {row.pageUrl ? (
          <>
            {' · '}
            {row.published ? (
              <a href={row.pageUrl} target="_blank" rel="noreferrer" className="break-all text-primary underline underline-offset-2" data-testid="variant-page-url">
                {row.pageUrl}
              </a>
            ) : (
              <span className="break-all">{row.pageUrl}</span>
            )}
          </>
        ) : null}
      </p>
      {errors.length > 0 ? (
        <ul role="alert" className="list-disc space-y-0.5 pl-5 text-xs text-destructive">
          {errors.map((e) => (
            <li key={e} className="break-words">{e}</li>
          ))}
        </ul>
      ) : null}
      {conflict ? (
        <div className="space-y-2 rounded-md border border-warning/40 p-2 text-sm" aria-label="Changes in the repository">
          <p className="font-medium text-warning">
            {file} {REASONS[conflict.reason]} Nothing was overwritten.
          </p>
          {conflict.diff.length > 0 ? (
            <p className="text-xs text-muted-foreground">Sections that differ: {conflict.diff.map((d) => d.label).join(', ')}.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">A variant holds no facts of its own, so lee can only replace the file with its version.</p>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => publish({ overwriteSha: conflict.repoSha })}>
            Overwrite with lee’s version
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Unpublish ${row.name}?`}
        description={
          <>
            <p>lee deletes {file} from your portfolio repository (a commit through the GitHub API), and the next portfolio build removes its page.</p>
            <p>The variant stays in lee with “Publish to portfolio” turned off.</p>
          </>
        }
        confirmLabel="Unpublish"
        pending={pending}
        onConfirm={unpublish}
      />
    </li>
  )
}

export function VariantPublishList({ rows, ready }: { rows: VariantPublishRow[]; ready: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Variant pages</CardTitle>
        <CardDescription>
          Variants with “Publish this variant to the portfolio” on. Each is written as variants/&lt;address&gt;.json — only public fields, only
          what the variant includes — and the portfolio renders it as a tailored résumé page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No variant is set to publish. Turn it on in a{' '}
            <Link href="/settings/variants" className="text-primary underline underline-offset-2">
              variant
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <Row key={r.id} row={r} ready={ready} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
