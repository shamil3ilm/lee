'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { savePlaygroundPrefsAction } from '@/app/(authed)/playground/actions'
import { Button } from '@/components/ui/button'
import { FormActions, FormField } from '@/components/ui/form-field'
import { NativeSelect } from '@/components/ui/native-select'
import { PLAN_MODE_LABELS, PLAN_MODES, type PlanMode } from '@/lib/academy/selector/types'

const BUDGETS = [10, 15, 20, 30, 45, 60, 90] as const

/** Playground settings: daily time budget and session mode. */
export function PrefsForm({ timeBudgetMin, mode }: { timeBudgetMin: number; mode: PlanMode }) {
  const [budget, setBudget] = useState(String(timeBudgetMin))
  const [m, setM] = useState<PlanMode>(mode)
  const [pending, start] = useTransition()
  const budgets = BUDGETS.includes(timeBudgetMin as (typeof BUDGETS)[number]) ? BUDGETS : [...BUDGETS, timeBudgetMin].sort((a, b) => a - b)

  const save = (): void => {
    start(async () => {
      const r = await savePlaygroundPrefsAction({ timeBudgetMin: Number(budget), mode: m })
      if ('error' in r) toast.error(r.error)
      else toast.success('Playground settings saved')
    })
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]"
      aria-label="Playground settings"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <FormField htmlFor="pg-budget" label="Daily time">
        <NativeSelect id="pg-budget" value={budget} onChange={(e) => setBudget(e.target.value)}>
          {budgets.map((b) => (
            <option key={b} value={b}>
              {b} minutes
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField htmlFor="pg-mode" label="Mode">
        <NativeSelect id="pg-mode" value={m} onChange={(e) => setM(e.target.value as PlanMode)}>
          {PLAN_MODES.map((x) => (
            <option key={x} value={x}>
              {PLAN_MODE_LABELS[x]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormActions>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </FormActions>
    </form>
  )
}
