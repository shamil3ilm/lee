'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Lock, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { clearCurrentJobAction, saveCurrentJobAction } from '@/app/(authed)/settings/current-job/actions'
import { fromForm, toForm, type CurrentJobForm as FormState } from '@/lib/compare/form'
import { COMPARE_CURRENCIES, PLACE_LABELS, PLACES, WORK_MODES, type CurrentJob, type Place } from '@/lib/compare/types'
import { workModeLabel } from '@/lib/ui/labels'
import { BenefitsSection, RatingsSection, WantMoreSection } from './current-job-sections'

interface CurrentJobFormProps {
  initial: CurrentJob | null
  /** Employer and title from the master profile's current work item. */
  prefill: { employer: string; title: string } | null
}

/** Settings › Current job. Private: never published, never logged. */
export function CurrentJobForm({ initial, prefill }: CurrentJobFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => toForm(initial, prefill))
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const set = (patch: Partial<FormState>): void => setForm((f) => ({ ...f, ...patch }))

  const save = (): void =>
    start(async () => {
      const r = await saveCurrentJobAction(fromForm(form))
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.message ?? 'Saved')
        router.refresh()
      }
    })

  const clear = (): void =>
    start(async () => {
      const r = await clearCurrentJobAction()
      setConfirming(false)
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.message ?? 'Removed')
        setForm(toForm(null, prefill))
        router.refresh()
      }
    })

  const canPrefill = prefill && (form.employer !== prefill.employer || form.title !== prefill.title)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="size-4" aria-hidden="true" />
            My current job
          </CardTitle>
          <CardDescription className="flex items-start gap-1.5">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Private. Never published to your portfolio and never written to logs.
          </CardDescription>
        </div>
        {canPrefill ? (
          <Button type="button" size="sm" variant="outline" onClick={() => set({ employer: prefill.employer, title: prefill.title })}>
            <UserRound className="size-4" />
            Use résumé
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <section aria-labelledby="cj-role" className="space-y-3">
            <h3 id="cj-role" className="text-sm font-semibold">
              Role
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField htmlFor="cj-employer" label="Employer">
                <Input id="cj-employer" value={form.employer} maxLength={200} onChange={(e) => set({ employer: e.target.value })} />
              </FormField>
              <FormField htmlFor="cj-title" label="Title">
                <Input id="cj-title" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
              </FormField>
              <FormField htmlFor="cj-location" label="City" hint="(optional)">
                <Input id="cj-location" value={form.location} maxLength={200} onChange={(e) => set({ location: e.target.value })} />
              </FormField>
              <FormField htmlFor="cj-place" label="Country" help="Sets the tax and living-cost assumptions used.">
                <NativeSelect id="cj-place" aria-describedby="cj-place-help" value={form.place} onChange={(e) => set({ place: e.target.value as Place | '' })}>
                  <option value="">Not set</option>
                  {PLACES.map((p) => (
                    <option key={p} value={p}>
                      {PLACE_LABELS[p]}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField htmlFor="cj-mode" label="Work mode">
                <NativeSelect id="cj-mode" value={form.workMode} onChange={(e) => set({ workMode: e.target.value as FormState['workMode'] })}>
                  <option value="">Not set</option>
                  {WORK_MODES.map((m) => (
                    <option key={m} value={m}>
                      {workModeLabel(m)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField htmlFor="cj-start" label="Started" hint="(month)">
                <Input id="cj-start" type="month" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
              </FormField>
            </div>
          </section>

          <section aria-labelledby="cj-pay" className="space-y-3">
            <h3 id="cj-pay" className="text-sm font-semibold">
              Pay
            </h3>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <FormField htmlFor="cj-gross" label="Monthly gross pay" help="Before tax, per month. Leave empty if you'd rather not say.">
                <Input
                  id="cj-gross"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-describedby="cj-gross-help"
                  value={form.monthlyGross}
                  onChange={(e) => set({ monthlyGross: e.target.value })}
                />
              </FormField>
              <FormField htmlFor="cj-currency" label="Currency">
                <NativeSelect id="cj-currency" value={form.currency} onChange={(e) => set({ currency: e.target.value as FormState['currency'] })}>
                  {COMPARE_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            </div>
          </section>

          <BenefitsSection form={form} set={set} />

          <FormField htmlFor="cj-commute" label="Commute or relocation notes" hint="(optional)">
            <Textarea id="cj-commute" rows={2} maxLength={500} value={form.commuteNotes} onChange={(e) => set({ commuteNotes: e.target.value })} />
          </FormField>

          <RatingsSection form={form} set={set} />
          <WantMoreSection form={form} set={set} />

          <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-card px-6 py-3">
            <Button type="submit" disabled={pending}>
              Save current job
            </Button>
            {initial ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" />
                Remove
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Remove your current job?"
        description="Comparisons stop until you add it again. Your FX and cost-of-living assumptions are kept."
        confirmLabel="Remove"
        pending={pending}
        onConfirm={clear}
      />
    </Card>
  )
}
