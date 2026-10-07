'use client'
import { Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startPrepareForApplicationAction } from '@/app/(authed)/shortlist/actions'
import type { PrepareView } from '@/lib/apply/prepare-view'
import { currentStep, type PrepStep } from '@/lib/apply/progress'
import { AppliedStep } from './applied-step'
import { CoverStep, TailorStep } from './ai-steps'
import { ChecklistStep } from './checklist-step'
import { toResult, useStepAction, type StepState } from './step-shell'
import { VariantStep } from './variant-step'

function stateOf(view: PrepareView, step: Exclude<PrepStep, 'applied'>, current: PrepStep): StepState {
  const s = view.progress[step]?.status
  if (s === 'done') return 'done'
  if (s === 'skipped') return 'skipped'
  return step === current ? 'current' : 'upcoming'
}

/**
 * The Prepare-application step panel: every step can be skipped, progress
 * is stored as each one finishes (so the user can leave and resume), and
 * nothing is ever sent.
 */
export function PreparePanel({ view }: { view: PrepareView }) {
  const [pending, run] = useStepAction()
  if (!view.started) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">
          Five short steps: pick a résumé, tailor it, draft a cover letter, check what to send, then record that you applied.
        </p>
        <Button disabled={pending} onClick={() => run(() => startPrepareForApplicationAction(view.applicationId).then(toResult))}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          Start preparing
        </Button>
      </div>
    )
  }
  const current = currentStep(view.progress)
  return (
    <ol className="space-y-3" aria-label="Prepare application steps">
      <VariantStep view={view} state={stateOf(view, 'variant', current)} />
      <TailorStep view={view} state={stateOf(view, 'tailor', current)} />
      <CoverStep view={view} state={stateOf(view, 'cover', current)} />
      <ChecklistStep view={view} state={stateOf(view, 'checklist', current)} />
      <AppliedStep view={view} state={current === 'applied' ? 'current' : 'upcoming'} />
    </ol>
  )
}
