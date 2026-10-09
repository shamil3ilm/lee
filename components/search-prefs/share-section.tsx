import { SHARE_FACT_LABELS, SHARE_FACTS } from '@/lib/discovery/relevance/discovery-prefs'
import type { SearchPrefsFormValues } from '@/lib/discovery/relevance/view'
import { ChoiceChip, PrefsFieldset } from './choice-chip'

/**
 * What lee may state in cover letters and outreach (the region block):
 * GCC visa status, notice, relocation and nationality; the time zone for
 * remote roles. Pay (CTC) is opted into on Settings › Current job.
 */
export function ShareSection({ values }: { values: SearchPrefsFormValues }) {
  return (
    <PrefsFieldset
      legend="Share in cover letters and outreach"
      description="Drafts state only what you pick here, from these settings and your profile. Nationality is off until you turn it on; pay (CTC) is set on Current job."
    >
      {SHARE_FACTS.map((f) => (
        <ChoiceChip key={f} name={`share_${f}`} value="on" label={SHARE_FACT_LABELS[f]} defaultChecked={values.share[f]} />
      ))}
    </PrefsFieldset>
  )
}
