import { saveProfileAction } from '@/app/(authed)/settings/profile/actions'
import type { UserProfile } from '@/lib/db/queries/profile'

interface ProfileFormProps {
  profile: UserProfile | null
}

const REMOTE_OPTIONS = ['any', 'remote', 'hybrid', 'onsite'] as const

function arr(v: string[] | null | undefined): string {
  return (v ?? []).join(', ')
}

function json(v: unknown): string {
  return JSON.stringify(v ?? null, null, 2)
}

export function ProfileForm({ profile }: ProfileFormProps) {
  return (
    <form action={saveProfileAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block">Headline</span>
          <input
            name="headline"
            defaultValue={profile?.headline ?? ''}
            className="w-full rounded border px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Seniority</span>
          <input
            name="seniority"
            defaultValue={profile?.seniority ?? ''}
            className="w-full rounded border px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Years experience</span>
          <input
            name="yearsExperience"
            type="number"
            min="0"
            defaultValue={profile?.yearsExperience ?? ''}
            className="w-full rounded border px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Remote preference</span>
          <select
            name="remotePref"
            defaultValue={profile?.remotePref ?? 'any'}
            className="w-full rounded border px-2 py-1"
          >
            {REMOTE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Comp floor (annual)</span>
          <input
            name="compFloorAnnual"
            type="number"
            min="0"
            defaultValue={profile?.compFloorAnnual ?? ''}
            className="w-full rounded border px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Comp currency (ISO-3)</span>
          <input
            name="compCurrency"
            defaultValue={profile?.compCurrency ?? ''}
            className="w-full rounded border px-2 py-1"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          name="acceptRelocation"
          type="checkbox"
          defaultChecked={profile?.acceptRelocation ?? false}
        />
        Accept relocation
      </label>

      <label className="block text-sm">
        <span className="mb-1 block">Summary (markdown)</span>
        <textarea
          name="summaryMd"
          rows={4}
          defaultValue={profile?.summaryMd ?? ''}
          className="w-full rounded border px-2 py-1 font-mono text-xs"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block">Career narrative (markdown)</span>
        <textarea
          name="careerNarrativeMd"
          rows={4}
          defaultValue={profile?.careerNarrativeMd ?? ''}
          className="w-full rounded border px-2 py-1 font-mono text-xs"
        />
      </label>

      {(
        [
          ['skills', 'Skills (comma separated)'],
          ['industries', 'Industries (comma separated)'],
          ['roleTypes', 'Role types (comma separated)'],
          ['employmentTypes', 'Employment types (comma separated)'],
          ['willingToRelocateTo', 'Willing to relocate to (comma separated ISO-2)'],
          ['mustHaves', 'Must-haves (comma separated)'],
          ['dealbreakers', 'Dealbreakers (comma separated)'],
          ['keywords', 'Keywords (comma separated)'],
        ] as const
      ).map(([field, label]) => (
        <label key={field} className="block text-sm">
          <span className="mb-1 block">{label}</span>
          <input
            name={field}
            defaultValue={arr(profile ? (profile[field] as string[] | null) : null)}
            className="w-full rounded border px-2 py-1"
          />
        </label>
      ))}

      {(
        [
          ['stackWeights', 'Stack weights (JSON)', profile?.stackWeights],
          ['companySizeWeights', 'Company size weights (JSON)', profile?.companySizeWeights],
          ['benefitPrefs', 'Benefit prefs (JSON)', profile?.benefitPrefs],
          ['locationPrefs', 'Location prefs (JSON)', profile?.locationPrefs],
        ] as const
      ).map(([field, label, value]) => (
        <label key={field} className="block text-sm">
          <span className="mb-1 block">{label}</span>
          <textarea
            name={field}
            rows={4}
            defaultValue={json(value)}
            className="w-full rounded border px-2 py-1 font-mono text-xs"
          />
        </label>
      ))}

      <button className="rounded bg-black px-4 py-2 text-white" type="submit">
        Save profile
      </button>
    </form>
  )
}
