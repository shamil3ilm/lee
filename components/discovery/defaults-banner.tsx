'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmDefaultPrefsAction } from '@/app/(authed)/settings/profile/search-actions'
import { searchPrefsHref, settingsHref } from '@/lib/ui/settings-links'

export interface BannerFamily {
  id: string
  label: string
}

interface DefaultsBannerProps {
  families: readonly BannerFamily[]
  /** Profile and master CV too thin for good suggestions: offer the CV import too. */
  sparse?: boolean
  /** The page to come back to from Settings (e.g. "/discoveries"). */
  from?: string
}

/**
 * One compact notice on Discovery and the Shortlist while search
 * preferences are unsaved: the domain filter is running on defaults from
 * the profile. One click on the suggested role families confirms them; the
 * full preferences are one link away (and come back here).
 */
export function DefaultsBanner({ families, sparse = false, from }: DefaultsBannerProps) {
  const router = useRouter()
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(families.map((f) => f.id)))
  const [pending, start] = useTransition()

  const toggle = (id: string): void =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const confirm = (): void =>
    start(async () => {
      const r = await confirmDefaultPrefsAction([...picked])
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success('Search preferences saved', {
        description: r.pending
          ? `Re-checking ${r.total} jobs… ${r.filtered} filtered out so far.`
          : `${r.filtered} of ${r.evaluated} postings filtered out.`,
      })
      router.refresh()
    })

  const linkCls = 'font-medium text-warning underline underline-offset-2'
  return (
    <section
      aria-label="Filtering defaults"
      data-testid="defaults-banner"
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm"
    >
      <p className="flex items-center gap-1.5 text-warning">
        <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">Filtering is using defaults from your profile.</span>
      </p>
      {families.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Looking for">
          {families.map((f) => (
            <label
              key={f.id}
              className="inline-flex cursor-pointer select-none items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
            >
              <input type="checkbox" className="sr-only" checked={picked.has(f.id)} onChange={() => toggle(f.id)} />
              {f.label}
            </label>
          ))}
          <Button size="sm" className="h-7" onClick={confirm} disabled={pending || picked.size === 0}>
            Confirm
          </Button>
        </div>
      ) : null}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Link href={searchPrefsHref(from)} className={linkCls}>
          Set preferences
        </Link>
        {sparse ? (
          <Link href={settingsHref('/settings/profile', from, 'cv-import')} className={linkCls}>
            Import CV
          </Link>
        ) : null}
      </span>
    </section>
  )
}
