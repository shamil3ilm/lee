'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { starTopRegionsAction } from '@/app/(authed)/settings/profile/search-actions'
import type { StarCandidate } from '@/lib/coverage/line'

/**
 * First-run "Where first?": tick the regions that matter most (Kuwait, UAE,
 * Kerala, Remote… from the user's own targets) and star them at Top
 * priority. They rank those jobs higher and drive the coverage line.
 */
export function SetupRegionsStep({ candidates }: { candidates: readonly StarCandidate[] }) {
  const router = useRouter()
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
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
      const r = await starTopRegionsAction([...picked])
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(`${r.count} ${r.count === 1 ? 'region' : 'regions'} starred`, {
        description: 'Their jobs rank higher, and Discovery shows how well they are covered.',
      })
      router.refresh()
    })

  if (candidates.length === 0) return null
  return (
    <fieldset className="space-y-2" data-testid="setup-regions-step">
      <legend className="text-xs text-muted-foreground">Where first?</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {candidates.map((c) => (
          <label
            key={c.id}
            className="inline-flex min-h-8 cursor-pointer select-none items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input type="checkbox" className="sr-only" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
            {c.label}
          </label>
        ))}
        <Button size="sm" className="h-8" onClick={save} disabled={pending || picked.size === 0}>
          {pending ? 'Saving…' : 'Star'}
        </Button>
      </div>
    </fieldset>
  )
}
