'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { confirmDefaultPrefsAction } from '@/app/(authed)/settings/profile/search-actions'
import type { BannerFamily } from '@/components/discovery/defaults-banner'

/**
 * First-run step 1, inline on Home: tick the kinds of role lee inferred
 * from the profile and save them as the search preferences, without
 * leaving Home. Everything else is one link away.
 */
export function SetupSearchStep({ families }: { families: readonly BannerFamily[] }) {
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

  const save = (): void =>
    start(async () => {
      const r = await confirmDefaultPrefsAction([...picked])
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success('Search preferences saved', {
        description: `${r.filtered} of ${r.evaluated} postings filtered out. Fine-tune them any time in Settings › Search.`,
      })
      router.refresh()
    })

  if (families.length === 0) return null
  return (
    <fieldset className="space-y-2" data-testid="setup-search-step">
      <legend className="text-xs text-muted-foreground">Kinds of role</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {families.map((f) => (
          <label
            key={f.id}
            className="inline-flex cursor-pointer select-none items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input type="checkbox" className="sr-only" checked={picked.has(f.id)} onChange={() => toggle(f.id)} />
            {f.label}
          </label>
        ))}
        <Button size="sm" className="h-8" onClick={save} disabled={pending || picked.size === 0}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </fieldset>
  )
}
