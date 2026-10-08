'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { unpublishVariantAction } from '@/app/(authed)/settings/publish/actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { slugify, variantPageUrl } from '@/lib/portfolio/variant-paths'

export interface VariantPortfolioState {
  /** Saved slug ('' = none yet). */
  slug: string
  /** variants/<slug>.json is in the repo (lee wrote it). */
  published: boolean
  /** The master profile's portfolio canonical URL (the page address is built from it). */
  canonical: string
}

interface VariantPortfolioFieldProps {
  variantId: string
  state: VariantPortfolioState
  publish: boolean
  slug: string
  /** Name-derived default shown as the placeholder. */
  name?: string
  onPublish: (on: boolean) => void
  onSlug: (slug: string) => void
}

/**
 * The per-variant "publish to portfolio" toggle (off by default), its page
 * address and public URL. Turning a PUBLISHED variant off deletes its file
 * from the repo, so it asks first and runs Unpublish right away.
 */
export function VariantPortfolioField({ variantId, state, publish, slug, name = '', onPublish, onSlug }: VariantPortfolioFieldProps) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()
  const effective = slug || state.slug || slugify(name)
  const url = variantPageUrl(state.canonical, effective)

  const unpublish = (): void =>
    start(async () => {
      const r = await unpublishVariantAction(variantId)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      if (r.outcome.status !== 'removed') {
        toast.error(r.outcome.error)
        return
      }
      setConfirm(false)
      toast.success('Removed from your portfolio')
      router.refresh()
    })

  return (
    <div className="space-y-2 rounded-md border p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={publish}
          onChange={(e) => (!e.target.checked && state.published ? setConfirm(true) : onPublish(e.target.checked))}
        />
        <span>
          Publish this variant to the portfolio too
          <span className="block text-xs text-muted-foreground">
            Off by default. When on, Publish writes its public fields as variants/{effective}.json and your portfolio shows it as a
            tailored résumé page (not indexed by search engines).{' '}
            <Link href="/settings/publish" className="text-primary hover:underline">
              Publish page
            </Link>
          </span>
        </span>
      </label>
      {publish ? (
        <div className="grid gap-1 pl-6 text-sm">
          <label htmlFor="variant-slug" className="text-xs font-medium">
            Page address
          </label>
          <Input
            id="variant-slug"
            value={slug}
            placeholder={state.slug || slugify(name)}
            disabled={state.published}
            onChange={(e) => onSlug(e.target.value.toLowerCase())}
            aria-describedby="variant-slug-help"
            className="max-w-xs"
          />
          <span id="variant-slug-help" className="text-xs text-muted-foreground">
            {state.published ? 'Unpublish to change the address. ' : 'Lowercase letters, digits and dashes. '}
            {url ? (
              <>
                Public URL:{' '}
                {state.published ? (
                  <a href={url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline" data-testid="variant-public-url">
                    {url}
                  </a>
                ) : (
                  <span className="break-all">{url}</span>
                )}
              </>
            ) : (
              'Set your portfolio’s canonical URL in Résumé › Portfolio to get a public URL.'
            )}
          </span>
          {state.published ? (
            <div>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirm(true)}>
                Unpublish…
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove this variant from your portfolio?"
        description={
          <>
            <p>
              lee deletes variants/{state.slug}.json from your portfolio repository (a commit through the GitHub API). The next portfolio
              build removes the page{url ? ` ${url}` : ''}.
            </p>
            <p>The variant itself stays in lee, and versions that were published are kept.</p>
          </>
        }
        confirmLabel="Unpublish"
        pending={pending}
        onConfirm={unpublish}
      />
    </div>
  )
}
