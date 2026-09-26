'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pause, Play, RefreshCw, Save } from 'lucide-react'
import {
  refreshUsageAction,
  saveNeonProjectAction,
  setThrottlesResumedAction,
  type UsageActionResult,
} from '@/app/(authed)/settings/usage/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function report(r: UsageActionResult): void {
  if ('error' in r) toast.error(r.error)
  else toast.success(r.message)
}

async function guarded(fn: () => Promise<UsageActionResult>): Promise<void> {
  try {
    report(await fn())
  } catch {
    toast.error('Something went wrong. Please try again.')
  }
}

/** Takes a fresh snapshot (vendor calls happen on the server, throttled). */
export function RefreshUsageButton() {
  const [pending, start] = useTransition()
  return (
    <Button size="sm" disabled={pending} onClick={() => start(() => guarded(refreshUsageAction))}>
      <RefreshCw className={pending ? 'animate-spin' : undefined} aria-hidden />
      {pending ? 'Refreshing…' : 'Refresh now'}
    </Button>
  )
}

/** Resume paused jobs for this month, or hand control back to the throttle. */
export function ResumeThrottleButton({ resumed }: { resumed: boolean }) {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(() => guarded(() => setThrottlesResumedAction(!resumed)))}
    >
      {resumed ? <Pause aria-hidden /> : <Play aria-hidden />}
      {resumed ? 'Pause again automatically' : 'Resume paused jobs this month'}
    </Button>
  )
}

/** Optional Neon project id (discovered from the key when it sees one project). */
export function NeonProjectForm({ projectId }: { projectId: string | null }) {
  const [value, setValue] = useState(projectId ?? '')
  const [pending, start] = useTransition()
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(() => guarded(() => saveNeonProjectAction(value)))
      }}
    >
      <Label htmlFor="neon-project-id" className="text-xs">
        Neon project id (optional)
      </Label>
      <div className="flex gap-2">
        <Input
          id="neon-project-id"
          autoComplete="off"
          spellCheck={false}
          placeholder="Found automatically when the key sees one project"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
        <Button type="submit" size="sm" className="h-9" disabled={pending}>
          <Save aria-hidden />
          Save
        </Button>
      </div>
    </form>
  )
}
