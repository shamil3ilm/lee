'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { savePlacesSettingsAction } from '@/app/(authed)/settings/integrations/reputation-actions'

interface Props {
  enabled: boolean
  cap: number
  hardCap: number
  usedThisMonth: number
  hasKey: boolean
}

/** Optional Google Places rating on company pages: off by default, hard-capped per month. */
export function PlacesSettingsCard({ enabled, cap, hardCap, usedThisMonth, hasKey }: Props) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [limit, setLimit] = useState(String(cap))
  const [pending, start] = useTransition()

  const save = (): void => {
    start(async () => {
      const r = await savePlacesSettingsAction(on, Number(limit))
      if ('error' in r) toast.error(r.error)
      else {
        toast.success('Google Places settings saved.')
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Places (company reputation)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Shows a company&apos;s Google rating and reviews on its Reputation panel, on demand. It uses your own key (
          <Link href="/settings/ai" className="underline">
            Settings › AI
          </Link>
          ){hasKey ? '' : ' — no key saved yet'}. Each check costs up to 2 calls; Google gives 1,000 free calls a
          month for reviews, and calls are hard-capped at {hardCap.toLocaleString('en-US')} a month here. If you use the same key
          elsewhere, also set a quota in Google Cloud Console.
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Enable Google Places lookups
        </label>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="places-cap">Monthly call cap</Label>
            <Input
              id="places-cap"
              type="number"
              min={0}
              max={hardCap}
              step={1}
              className="w-32"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Used this month: {usedThisMonth}</p>
      </CardContent>
    </Card>
  )
}
