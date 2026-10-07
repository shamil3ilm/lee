'use client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { NativeSelect } from '@/components/ui/native-select'
import { confirmVariantAction, skipStepAction } from '@/app/(authed)/shortlist/actions'
import type { PrepareView } from '@/lib/apply/prepare-view'
import { StepShell, toResult, useStepAction, type StepState } from './step-shell'

const MASTER = 'master'

export function VariantStep({ view, state }: { view: PrepareView; state: StepState }) {
  const [pending, run] = useStepAction()
  const initial = view.progress.variant?.variantId ?? view.currentVariantId ?? view.suggestedVariantId ?? MASTER
  const [choice, setChoice] = useState<string>(initial)
  const chosen = view.variants.find((v) => v.id === view.progress.variant?.variantId)
  const summary =
    state === 'done'
      ? chosen
        ? `${chosen.name} (v${view.progress.variant?.version ?? chosen.currentVersion})`
        : 'Master profile'
      : state === 'skipped'
        ? 'Skipped: tailoring starts from the master profile.'
        : view.suggestionReason

  return (
    <StepShell n={1} title="Résumé variant" state={state} summary={summary} testId="prepare-step-variant">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <FormField htmlFor="prepare-variant" label="Start from">
            <NativeSelect id="prepare-variant" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={pending}>
              {view.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.id === view.suggestedVariantId ? ' (suggested)' : ''}
                </option>
              ))}
              <option value={MASTER}>Master profile</option>
            </NativeSelect>
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => confirmVariantAction(view.applicationId, choice === MASTER ? null : choice).then(toResult))}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {state === 'done' ? 'Change' : 'Use this résumé'}
            </Button>
            {state === 'current' ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => skipStepAction(view.applicationId, 'variant').then(toResult))}>
                Skip
              </Button>
            ) : null}
          </div>
        </div>
    </StepShell>
  )
}
