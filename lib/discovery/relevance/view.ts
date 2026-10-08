import type { UserProfile } from '@/lib/db/queries/profile'
import { EXCLUSION_RULES, noticeLabel, RULE_LABELS, ruleMode } from './discovery-prefs'
import { regionLabel, REGION_CODES } from './places'
import { searchPrefsFromProfile, type RemoteScope } from './prefs'
import { resolveRoleFamily, roleFamilyLabel } from './roles'
import { SENIORITY_LABELS, type SeniorityLevel } from './seniority'

/** Plain, serialisable view of the search preferences for cards and forms. */
export interface LookingForView {
  active: boolean
  roles: string[]
  seniority: string[]
  regions: string[]
  remote: string
  notice: string | null
  hardRules: string[]
  softRules: string[]
}

const REMOTE_LABEL: Readonly<Record<RemoteScope, string>> = {
  worldwide: 'Remote worldwide (workable from home)',
  regions: 'Remote in my regions only',
  none: 'No remote',
}

export function lookingForView(profile: UserProfile | null): LookingForView {
  const p = searchPrefsFromProfile(profile)
  const allGcc = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'].every((c) => p.regions.includes(c as never))
  const regions = allGcc
    ? ['GCC', ...(p.regions.includes('IN') ? ['India'] : [])]
    : p.regions.map(regionLabel)
  return {
    active: p.active,
    roles: [...p.roleFamilies.map(roleFamilyLabel), ...p.customRoles],
    seniority: p.seniority.map((l) => SENIORITY_LABELS[l]),
    regions: [...regions, ...p.otherCountries],
    remote: REMOTE_LABEL[p.remoteScope],
    notice: noticeLabel(p.extra.noticePeriods),
    hardRules: EXCLUSION_RULES.filter((r) => ruleMode(p.extra, r) === 'hard').map((r) => RULE_LABELS[r]),
    softRules: EXCLUSION_RULES.filter((r) => ruleMode(p.extra, r) === 'soft').map((r) => RULE_LABELS[r]),
  }
}

/** Form defaults derived from the profile (checkbox states, text fields). */
export interface SearchPrefsFormValues {
  roleFamilies: string[]
  customRoles: string
  seniority: SeniorityLevel[]
  regions: string[]
  otherCountries: string
  remoteScope: RemoteScope
  acceptRelocation: boolean
  willingToRelocateTo: string
  relocationIfSponsored: boolean
  relocationCountries: string
  keywords: string
  dealbreakers: string
  rules: Record<string, string>
  basedIn: string
  sponsorshipFor: string[]
  payGccMonthlyAed: string
  payIndiaLpa: string
  languages: Array<{ name: string; level: string }>
  notice: string[]
  saved: boolean
}

export function searchPrefsFormValues(profile: UserProfile | null): SearchPrefsFormValues {
  const p = searchPrefsFromProfile(profile)
  const custom = (profile?.roleTypes ?? []).filter((r) => resolveRoleFamily(r) === null)
  const gcc = p.extra.payFloors.find((f) => f.scope === 'GCC' && f.currency === 'AED' && f.period === 'month')
  const india = p.extra.payFloors.find((f) => f.scope === 'IN')
  return {
    roleFamilies: p.roleFamilies,
    customRoles: custom.join(', '),
    seniority: p.seniority,
    // Before the first save, pre-tick the seeded location prefs.
    regions: !p.active && p.regions.length === 0 ? [...REGION_CODES] : p.regions,
    otherCountries: p.otherCountries.filter((c) => !(profile?.willingToRelocateTo ?? []).includes(c)).join(', '),
    remoteScope: p.remoteScope,
    acceptRelocation: profile?.acceptRelocation ?? false,
    willingToRelocateTo: (profile?.willingToRelocateTo ?? []).join(', '),
    relocationIfSponsored: p.extra.relocationIfSponsored,
    relocationCountries: p.extra.relocationCountries.join(', '),
    keywords: p.include.join(', '),
    dealbreakers: p.exclude.join(', '),
    rules: Object.fromEntries(EXCLUSION_RULES.map((r) => [r, ruleMode(p.extra, r)])),
    basedIn: p.extra.basedIn ?? '',
    sponsorshipFor: p.extra.sponsorshipFor,
    payGccMonthlyAed: gcc ? String(gcc.amount) : '',
    payIndiaLpa: india ? String(india.amount / 100_000) : '',
    languages: p.extra.languages.map((l) => ({ name: l.name, level: l.level })),
    notice: p.extra.noticePeriods,
    saved: p.active,
  }
}
