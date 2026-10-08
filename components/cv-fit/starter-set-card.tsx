'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Layers, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { createStarterSetAction } from '@/app/(authed)/cv-fit-actions'
import type { Region } from '@/lib/variants/types'

export interface StarterGroup {
  role: { id: string; label: string; domain: boolean }
  options: Array<{ roleId: string; region: Region; name: string; exists: boolean }>
}

const REGION_SHORT: Readonly<Record<Region, string>> = { gcc: 'GCC', india: 'India', remote: 'Remote' }

/**
 * One-click starter set: a sensible variant per accepted role × region.
 * Nothing is ticked by default; only what the user picks is created, and
 * each recipe picks only ready items and approved wordings.
 */
export function StarterSetCard({ groups }: { groups: readonly StarterGroup[] }) {
  const router = useRouter()
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [pending, start] = useTransition()
  const key = (o: { roleId: string; region: Region }): string => `${o.roleId}:${o.region}`
  const toggle = (k: string, on: boolean): void =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(k)
      else next.delete(k)
      return next
    })
  const create = (): void =>
    start(async () => {
      const picks = groups.flatMap((g) => g.options.filter((o) => picked.has(key(o))).map((o) => ({ roleId: o.roleId, region: o.region })))
      const r = await createStarterSetAction(picks)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(`Created ${r.created} variant${r.created === 1 ? '' : 's'}`)
      setPicked(new Set())
      router.refresh()
    })
  return (
    <Card data-testid="starter-set">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4" aria-hidden="true" />
          Starter CV set
        </CardTitle>
        <CardDescription>
          From the roles you accepted in Search preferences. Tick the ones you want; each picks only your ready items and approved wordings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.role.id} className="space-y-1.5">
              <p className="text-sm font-medium">
                {g.role.label}
                {g.role.domain ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">design and domain wording for design-only items</span> : null}
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {g.options.map((o) => (
                  <Checkbox
                    key={key(o)}
                    checked={o.exists || picked.has(key(o))}
                    disabled={o.exists || pending}
                    onChange={(e) => toggle(key(o), e.currentTarget.checked)}
                    label={REGION_SHORT[o.region]}
                    description={o.exists ? 'Already created' : undefined}
                    aria-label={o.name}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <Button size="sm" disabled={pending || picked.size === 0} onClick={create}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Create selected ({picked.size})
        </Button>
      </CardContent>
    </Card>
  )
}
