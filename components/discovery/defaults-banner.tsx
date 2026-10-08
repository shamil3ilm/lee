'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmDefaultPrefsAction } from '@/app/(authed)/settings/profile/search-actions'

export interface BannerFamily {
  id: string
  label: string
}

/**
 * Shown on Discovery and the Shortlist while search preferences are unsaved:
 * the domain filter is running on defaults from the profile. One click on
 * the suggested role families confirms them as the search preferences.
 */
export function DefaultsBanner({ families }: { families: readonly BannerFamily[] }) {
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

  return (
    <section
      aria-label="Filtering defaults"
      data-testid="defaults-banner"
      className="space-y-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-sm"
    >
      <p className="flex flex-wrap items-center gap-1.5 text-warning">
        <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
        <span>Filtering is using defaults from your profile.</span>
        <Link href="/settings/profile#search-preferences" className="font-medium underline underline-offset-2">
          Review your search preferences.
        </Link>
      </p>
      {families.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Looking for:</span>
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
    </section>
  )
}
