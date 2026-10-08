import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROLE_FAMILIES } from '@/lib/discovery/relevance/roles'
import { SENIORITY_LABELS, SENIORITY_LEVELS } from '@/lib/discovery/relevance/seniority'
import { REGION_CODES, TARGET_REGIONS } from '@/lib/discovery/relevance/places'
import { WORK_MODE_LABELS, WORK_MODES } from '@/lib/discovery/relevance/work-mode'
import { NativeSelect } from '@/components/ui/native-select'
import { CountryPicker } from './country-picker'
import type { SearchPrefsFormValues } from '@/lib/discovery/relevance/view'
import { ChoiceChip, PrefsFieldset } from './choice-chip'
import { Checkbox } from '@/components/ui/checkbox'

interface SectionProps {
  values: SearchPrefsFormValues
}

/** Target role families, seniority, regions, remote, keywords. */
export function TargetSections({ values }: SectionProps) {
  return (
    <div className="space-y-6">
      <PrefsFieldset
        legend="Target roles"
        description="lee ranks these highest. Jobs in clearly unrelated fields (judged from the job description, not just the title) go to Filtered out with the reason; unfamiliar titles that fit stay, marked Uncertain fit."
      >
        {ROLE_FAMILIES.map((f) => (
          <ChoiceChip
            key={f.id}
            name="roleFamily"
            value={f.id}
            label={f.label}
            defaultChecked={values.roleFamilies.includes(f.id)}
          />
        ))}
      </PrefsFieldset>
      <TextField
        name="customRoles"
        label="Other role titles (comma separated)"
        defaultValue={values.customRoles}
        placeholder="e.g. Odoo Consultant"
      />

      <PrefsFieldset
        legend="Seniority"
        description="Titles or “N+ years” above these rank lower (a strong ready match halves that); Principal, Director, Head of and VP roles are filtered. Change it under Exclusion rules."
      >
        {SENIORITY_LEVELS.map((l) => (
          <ChoiceChip
            key={l}
            name="seniority"
            value={l}
            label={l === 'senior' ? 'Senior (stretch)' : SENIORITY_LABELS[l]}
            defaultChecked={values.seniority.includes(l)}
          />
        ))}
      </PrefsFieldset>

      <PrefsFieldset
        legend="Locations"
        description="Cities, emirates and spellings are matched for you (Dubai, Riyadh/KSA, Bengaluru/Bangalore, Kochi/Cochin…)."
      >
        {TARGET_REGIONS.map((r) => (
          <ChoiceChip
            key={r.code}
            name="region"
            value={r.code}
            label={r.label}
            defaultChecked={values.regions.includes(r.code)}
          />
        ))}
      </PrefsFieldset>
      <CountryPicker
        name="otherCountries"
        label="Other countries"
        defaultValue={values.otherCountries}
        exclude={REGION_CODES}
      />

      <div className="space-y-1.5">
        <Label htmlFor="sp-remotePref">Preferred work mode</Label>
        <NativeSelect id="sp-remotePref" name="remotePref" defaultValue={values.remotePref} className="w-full sm:w-64">
          {WORK_MODES.map((m) => (
            <option key={m} value={m}>
              {WORK_MODE_LABELS[m]}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">Ranks postings in your preferred mode a little higher; never filters.</p>
      </div>

      <PrefsFieldset legend="Remote roles">
        <ChoiceChip type="radio" name="remoteScope" value="worldwide" label="Remote worldwide, workable from where I live" defaultChecked={values.remoteScope === 'worldwide'} />
        <ChoiceChip type="radio" name="remoteScope" value="regions" label="Remote in my regions only" defaultChecked={values.remoteScope === 'regions'} />
        <ChoiceChip type="radio" name="remoteScope" value="none" label="No remote" defaultChecked={values.remoteScope === 'none'} />
      </PrefsFieldset>
      <p className="-mt-3 text-xs text-muted-foreground">
        “US only”, “EU only”, “must reside in X” or “US time zones only” is filtered when it can’t be done from where you live; working hours within ±4 h of yours pass; a bare “Remote” gets an “unclear eligibility” chip.
      </p>

      <div className="space-y-2 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            name="relocationIfSponsored"
            defaultChecked={values.relocationIfSponsored}
          />
          Open to relocation if the employer sponsors it
        </label>
        <p className="text-xs text-muted-foreground">
          A posting outside your regions passes when it offers relocation or visa sponsorship, with a “Relocation offered” chip.
        </p>
        <CountryPicker
          name="relocationCountries"
          label="Only these countries"
          help="Leave empty for any country."
          defaultValue={values.relocationCountries}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            name="acceptRelocation"
            defaultChecked={values.acceptRelocation}
          />
          Open to relocating to other countries
        </label>
        <CountryPicker
          name="willingToRelocateTo"
          label="Relocation countries"
          defaultValue={values.willingToRelocateTo}
        />
        <TextField
          name="keywords"
          label="Must mention one of (include keywords)"
          defaultValue={values.keywords}
          placeholder="e.g. Laravel, PHP"
        />
        <TextField
          name="dealbreakers"
          label="Exclude keywords (dealbreakers)"
          defaultValue={values.dealbreakers}
          placeholder="e.g. gambling"
          className="sm:col-span-2"
        />
      </div>
    </div>
  )
}

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string
  label: string
}

export function TextField({ name, label, className, ...rest }: TextFieldProps) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : 'space-y-1.5'}>
      <Label htmlFor={`sp-${name}`}>{label}</Label>
      <Input id={`sp-${name}`} name={name} {...rest} />
    </div>
  )
}
