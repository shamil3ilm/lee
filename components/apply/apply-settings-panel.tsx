'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ListChecks, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormActions, FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { saveApplySettingsAction } from '@/app/(authed)/shortlist/actions'
import { FOLLOWUP_DAYS, FOLLOWUP_SECOND_DAYS, SHORTLIST_SIZE, type ApplySettings } from '@/lib/apply/settings'
import { Checkbox } from '@/components/ui/checkbox'

const SIZES = Array.from({ length: SHORTLIST_SIZE.max - SHORTLIST_SIZE.min + 1 }, (_, i) => SHORTLIST_SIZE.min + i)

/** Settings › Notifications › Shortlist & follow-ups. */
export function ApplySettingsPanel({ initial }: { initial: ApplySettings }) {
  const [size, setSize] = useState(String(initial.shortlistSize))
  const [days, setDays] = useState(String(initial.followupDays))
  const [secondDays, setSecondDays] = useState(String(initial.followupSecondDays))
  const [inEmails, setInEmails] = useState(initial.shortlistInEmails)
  const [saving, startSave] = useTransition()

  const save = (): void =>
    startSave(async () => {
      const r = await saveApplySettingsAction({
        shortlistSize: Number(size),
        followupDays: Number(days),
        followupSecondDays: Number(secondDays),
        shortlistInEmails: inEmails,
      })
      if ('error' in r) toast.error(r.error)
      else toast.success('Shortlist settings saved')
    })

  return (
    <Card id="shortlist-settings">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
          Shortlist & follow-ups
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          The daily shortlist is built after the morning discovery run. When you mark an application applied, lee
          nudges you twice: a short check-in, then a final note, in business days (a GCC posting through an agency
          gets the check-in after 3). lee drafts the email, you send it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <FormField htmlFor="shortlist-size" label="Postings per day">
            <NativeSelect id="shortlist-size" value={size} onChange={(e) => setSize(e.target.value)} disabled={saving}>
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            htmlFor="followup-days"
            label="Check-in after"
            help={`Business days, ${FOLLOWUP_DAYS.min} to ${FOLLOWUP_DAYS.max}.`}
          >
            <Input
              id="followup-days"
              type="number"
              inputMode="numeric"
              min={FOLLOWUP_DAYS.min}
              max={FOLLOWUP_DAYS.max}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={saving}
              aria-describedby="followup-days-help"
            />
          </FormField>
          <FormField
            htmlFor="followup-second-days"
            label="Final note after"
            help={`Business days, ${FOLLOWUP_SECOND_DAYS.min} to ${FOLLOWUP_SECOND_DAYS.max}; then lee stops.`}
          >
            <Input
              id="followup-second-days"
              type="number"
              inputMode="numeric"
              min={FOLLOWUP_SECOND_DAYS.min}
              max={FOLLOWUP_SECOND_DAYS.max}
              value={secondDays}
              onChange={(e) => setSecondDays(e.target.value)}
              disabled={saving}
              aria-describedby="followup-second-days-help"
            />
          </FormField>
          <FormActions>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </FormActions>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={inEmails}
            onChange={(e) => setInEmails(e.target.checked)}
            disabled={saving}
          />
          <span>
            Include the shortlist in the weekly digest and the discovery email
            <span className="block text-xs text-muted-foreground">Only when those emails are on.</span>
          </span>
        </label>
      </CardContent>
    </Card>
  )
}
