import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROLE_FAMILIES } from '@/lib/discovery/relevance/roles'
import { SENIORITY_LABELS, SENIORITY_LEVELS } from '@/lib/discovery/relevance/seniority'
import { TARGET_REGIONS } from '@/lib/discovery/relevance/places'
import type { SearchPrefsFormValues } from '@/lib/discovery/relevance/view'
import { ChoiceChip, PrefsFieldset } from './choice-chip'

interface SectionProps {
  values: SearchPrefsFormValues
}

/** Target role families, seniority, regions, remote, keywords. */
export function TargetSections({ values }: SectionProps) {
  return (
    <div className="space-y-6">
      <PrefsFieldset legend="Target roles" description="Postings outside these go to “Filtered out”.">
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

      <PrefsFieldset legend="Seniority" description="Titles or “N+ years” above these are filtered, with the reason.">
        {SENIORITY_LEVELS.map((l) => (
          <ChoiceChip
            key={l}
            name="seniority"
            value={l}
            label={SENIORITY_LABELS[l]}
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
      <TextField
        name="otherCountries"
        label="Other countries (ISO-2, comma separated)"
        defaultValue={values.otherCountries}
        placeholder="e.g. SG, DE"
      />

      <PrefsFieldset legend="Remote roles">
        <ChoiceChip type="radio" name="remoteScope" value="worldwide" label="Remote worldwide (open to me)" defaultChecked={values.remoteScope === 'worldwide'} />
        <ChoiceChip type="radio" name="remoteScope" value="regions" label="Remote in my regions only" defaultChecked={values.remoteScope === 'regions'} />
        <ChoiceChip type="radio" name="remoteScope" value="none" label="No remote" defaultChecked={values.remoteScope === 'none'} />
      </PrefsFieldset>
      <p className="-mt-3 text-xs text-muted-foreground">
        “US only”, “EU only” or “must reside in X” is filtered when X is not one of your locations.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            name="acceptRelocation"
            type="checkbox"
            defaultChecked={values.acceptRelocation}
            className="size-4 rounded border-input"
          />
          Open to relocating to other countries
        </label>
        <TextField
          name="willingToRelocateTo"
          label="Relocation countries (ISO-2)"
          defaultValue={values.willingToRelocateTo}
          placeholder="e.g. SG"
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
