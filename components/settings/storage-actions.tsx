'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Eraser, Save } from 'lucide-react'
import {
  cleanUpNowAction,
  saveRetentionWindowsAction,
  type StorageActionResult,
} from '@/app/(authed)/settings/storage/actions'
import { RETENTION_WINDOWS, type RetentionPolicy, type RetentionWindowId } from '@/lib/db/retention/windows'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

async function guarded(fn: () => Promise<StorageActionResult>): Promise<void> {
  try {
    const r = await fn()
    if ('error' in r) toast.error(r.error)
    else toast.success(r.message)
  } catch {
    toast.error('Something went wrong. Please try again.')
  }
}

/** Runs the nightly cleanup now (owner only; bounded to ~45 s on the server). */
export function CleanUpNowButton() {
  const [pending, start] = useTransition()
  return (
    <Button size="sm" disabled={pending} onClick={() => start(() => guarded(cleanUpNowAction))}>
      <Eraser className={pending ? 'animate-pulse' : undefined} aria-hidden />
      {pending ? 'Cleaning up…' : 'Clean up now'}
    </Button>
  )
}

type Draft = Record<RetentionWindowId, string>

function toDraft(policy: RetentionPolicy): Draft {
  return Object.fromEntries(RETENTION_WINDOWS.map((w) => [w.id, String(policy[w.id])])) as Draft
}

/** The editable retention windows, saved together. */
export function RetentionWindowsForm({ policy }: { policy: RetentionPolicy }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(policy))
  const [pending, start] = useTransition()
  return (
    <form
      className="space-y-4"
      data-testid="retention-windows"
      onSubmit={(e) => {
        e.preventDefault()
        start(() => guarded(() => saveRetentionWindowsAction(draft)))
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {RETENTION_WINDOWS.map((w) => (
          <div key={w.id} className="space-y-1">
            <Label htmlFor={`retention-${w.id}`} className="text-sm">
              {w.label}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={`retention-${w.id}`}
                name={w.id}
                type="number"
                inputMode="numeric"
                min={w.minDays}
                max={w.maxDays}
                step={1}
                className="w-28"
                value={draft[w.id]}
                onChange={(e) => setDraft((d) => ({ ...d, [w.id]: e.target.value }))}
                disabled={pending}
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {w.description} Default {w.defaultDays}.
            </p>
          </div>
        ))}
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        <Save aria-hidden />
        Save windows
      </Button>
    </form>
  )
}
