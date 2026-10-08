'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setRadarSourceAction } from '@/app/(authed)/radar/actions'

/** On/off switch for one radar source (Radar › Sources). */
export function SourceToggle({ source, label, on }: { source: string; label: string; on: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <label className="inline-flex shrink-0 items-center gap-2 text-sm">
      <input
        type="checkbox"
        role="switch"
        className="size-4 accent-primary"
        checked={on}
        disabled={pending}
        aria-label={`Fetch ${label}`}
        onChange={(e) => {
          const next = e.currentTarget.checked
          start(async () => {
            const r = await setRadarSourceAction(source, next)
            if ('error' in r) toast.error(r.error)
            else router.refresh()
          })
        }}
      />
      {on ? 'On' : 'Off'}
    </label>
  )
}
