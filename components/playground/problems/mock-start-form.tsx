'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Timer } from 'lucide-react'
import { finishMockAction, startMockAction } from '@/app/(authed)/playground/problems/actions'
import { Button } from '@/components/ui/button'
import { FormActions, FormField } from '@/components/ui/form-field'
import { NativeSelect } from '@/components/ui/native-select'

/** Start a timed mock: 2–3 adaptive problems in 60–90 minutes. */
export function MockStartForm() {
  const router = useRouter()
  const [count, setCount] = useState('3')
  const [duration, setDuration] = useState('90')
  const [pending, start] = useTransition()
  const submit = () =>
    start(async () => {
      const r = await startMockAction({ count, durationMin: duration })
      if ('error' in r) toast.error(r.error)
      else router.push(r.href)
    })
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
      <FormField htmlFor="mock-count" label="Problems">
        <NativeSelect id="mock-count" value={count} onChange={(e) => setCount(e.target.value)}>
          <option value="2">2 problems</option>
          <option value="3">3 problems</option>
        </NativeSelect>
      </FormField>
      <FormField htmlFor="mock-duration" label="Time">
        <NativeSelect id="mock-duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
          <option value="60">60 minutes</option>
          <option value="75">75 minutes</option>
          <option value="90">90 minutes</option>
        </NativeSelect>
      </FormField>
      <FormActions>
        <Button type="button" onClick={submit} disabled={pending}>
          <Timer aria-hidden />
          {pending ? 'Starting…' : 'Start mock'}
        </Button>
      </FormActions>
    </div>
  )
}

export function FinishMockButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await finishMockAction(id)
          if ('error' in r) toast.error(r.error)
          else router.refresh()
        })
      }
    >
      {pending ? 'Scoring…' : 'Finish and score'}
    </Button>
  )
}
