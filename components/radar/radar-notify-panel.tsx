'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Radar } from 'lucide-react'
import { toast } from 'sonner'
import { setRadarNotifyAction } from '@/app/(authed)/settings/notifications/actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RADAR_NOTIFY_LABELS, RADAR_NOTIFY_MODES, type RadarNotifyMode } from '@/lib/radar/digest'

/** Settings › Notifications › AI Radar: how new watch-term matches reach you. */
export function RadarNotifyPanel({ mode: initial, discoveryEmailOn }: { mode: RadarNotifyMode; discoveryEmailOn: boolean }) {
  const [mode, setMode] = useState<RadarNotifyMode>(initial)
  const [pending, start] = useTransition()

  const choose = (next: RadarNotifyMode): void => {
    const previous = mode
    setMode(next)
    start(async () => {
      const r = await setRadarNotifyAction(next)
      if ('error' in r) {
        setMode(previous)
        toast.error(r.error)
      } else toast.success('Radar updates saved')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="size-4 text-primary" aria-hidden /> AI Radar updates
        </CardTitle>
        <CardDescription>
          “Radar: new on your watch terms”. The nav badge always counts unread matches. Manage terms in{' '}
          <Link href="/radar/watchlist" className="text-primary hover:underline">
            Radar › Watchlist
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <fieldset className="space-y-2" disabled={pending}>
          <legend className="sr-only">Radar updates</legend>
          {RADAR_NOTIFY_MODES.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="radar-notify"
                value={m}
                checked={mode === m}
                onChange={() => choose(m)}
                className="size-4 accent-primary"
              />
              {RADAR_NOTIFY_LABELS[m]}
            </label>
          ))}
        </fieldset>
        {mode === 'daily' && !discoveryEmailOn ? (
          <p className="text-xs text-warning">Daily updates ride on the discovery email — turn it on above.</p>
        ) : null}
        {mode === 'instant' ? (
          <p className="text-xs text-muted-foreground">Needs browser notifications allowed for lee (see below); checked every 5 minutes while lee is open.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
