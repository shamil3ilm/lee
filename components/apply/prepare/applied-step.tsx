'use client'
import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormActions, FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { LocalTime } from '@/components/local-time'
import { markAppliedAction } from '@/app/(authed)/shortlist/actions'
import type { PrepareView } from '@/lib/apply/prepare-view'
import { shortDay } from '@/lib/ui/date'
import { StepShell, toResult, useStepAction, type StepState } from './step-shell'

/**
 * Step 5: the user applied themselves (lee never submits). Records the date,
 * moves the stage to Applied and schedules the follow-up nudge.
 */
export function AppliedStep({ view, state }: { view: PrepareView; state: StepState }) {
  const [pending, run] = useStepAction()
  const [day, setDay] = useState(view.appliedDay ?? view.today)
  const applied = view.progress.applied !== undefined

  const summary = applied ? (
    <span className="flex flex-wrap items-center gap-x-2" data-testid="applied-summary">
      <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
      <span>Applied {view.appliedDay ? shortDay(view.appliedDay) : ''}.</span>
      {view.followupStatus === 'pending' && view.followupDueAt ? (
        <span>
          Follow-up nudge <LocalTime date={view.followupDueAt} format="date" />.
        </span>
      ) : view.followupStatus === 'cancelled' ? (
        <span>They replied, so the follow-up nudge was cancelled.</span>
      ) : null}
    </span>
  ) : (
    'When you have applied on their site, record it here. Nothing is sent from lee.'
  )

  return (
    <StepShell n={5} title="Mark applied" state={applied ? 'done' : state} summary={summary} testId="prepare-step-applied">
      <div className="grid gap-3 sm:grid-cols-[12rem_auto]">
        <FormField htmlFor="applied-day" label="Applied on" help={day ? shortDay(day) : undefined}>
          <Input
            id="applied-day"
            type="date"
            value={day}
            max={view.today}
            onChange={(e) => setDay(e.target.value)}
            disabled={pending}
            aria-describedby="applied-day-help"
          />
        </FormField>
        <FormActions>
          <Button
            size="sm"
            variant={!applied && state === 'current' ? 'default' : 'outline'}
            disabled={pending || !day}
            onClick={() =>
              run(() =>
                markAppliedAction(view.applicationId, day).then((r) => ({ ...toResult(r), ok: 'error' in r ? undefined : 'Marked applied' })),
              )
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {applied ? 'Update date' : 'Mark applied'}
          </Button>
        </FormActions>
      </div>
    </StepShell>
  )
}
