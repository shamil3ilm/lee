import { GCC_CODES, regionLabel, type RegionCode } from '@/lib/discovery/relevance/places'
import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import type { SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { scrubPii } from './pii'
import { EXPAT_HINT, joinList, levelPhrase } from './phrases'
import { MAX_PROMPT_LENGTH } from './url'

/**
 * Suggested prompts for Google AI Mode, built from the search preferences
 * ONLY: role families, custom role names, regions, remote scope, visa
 * sponsorship and keywords. Never the profile's name, email, phone,
 * employers or schools; free-text preference fields are scrubbed against
 * those identifiers as well (lib/discovery/ai-mode/pii.ts).
 *
 * lee never sends these to Google: the user opens them in their own
 * browser (aiModeSearchUrl) or copies them.
 */

export { AI_MODE_BASE_URL, AI_MODE_UDM, MAX_PROMPT_LENGTH, aiModeSearchUrl } from './url'
const MAX_ROLES = 3
/** Prompt families: GCC, India, other countries, remote-from-home, relocation. */
const MAX_FAMILIES = 5
const FALLBACK_ROLE = 'software developer'

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

function rolesText(prefs: SearchPrefs, pii: readonly string[]): string {
  const roles = [
    ...prefs.roleFamilies.map((id) => roleFamilyLabel(id)),
    ...prefs.customRoles.map((r) => scrubPii(r, pii)),
  ]
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, MAX_ROLES)
  const named = roles.map((r) => (/(developer|engineer|lead|manager|analyst|architect)\b/i.test(r) ? r : `${r} developer`))
  return joinList(named.length > 0 ? named : [FALLBACK_ROLE])
}

const ASK_FORMAT =
  'List each opening with job title, employer, city, posted date and a direct link to the original posting. Only openings posted in the last 30 days.'

export interface AiModePrompt {
  id: string
  label: string
  prompt: string
}

function cap(prompt: string): string {
  return prompt.replace(/\s{2,}/g, ' ').trim().slice(0, MAX_PROMPT_LENGTH)
}

/**
 * One prompt per family: each target area the preferences name (the GCC,
 * India, other countries), remote roles workable from the user's home
 * country (unless remote is off), and roles anywhere that offer relocation
 * or visa sponsorship. With no saved preferences the areas fall back to
 * lee's target market (the GCC and India). The dialog shows a daily
 * rotation of these plus the employer-watch prompts (./daily.ts).
 */
export function buildAiModePrompts(prefs: SearchPrefs, piiTerms: readonly string[] = []): AiModePrompt[] {
  const roles = rolesText(prefs, piiTerms)
  const level = levelPhrase(prefs, piiTerms)
  const sponsorFor = prefs.extra.sponsorshipFor
  const regions: RegionCode[] = prefs.regions.length > 0 || prefs.otherCountries.length > 0 ? prefs.regions : [...GCC_CODES, 'IN']
  const gcc = regions.filter((r) => GCC_CODES.includes(r))
  const out: AiModePrompt[] = []

  if (gcc.length > 0) {
    const places = gcc.length === GCC_CODES.length ? 'the GCC (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman)' : joinList(gcc.map(regionLabel))
    const visa = gcc.some((c) => sponsorFor.includes(c)) ? ', with visa sponsorship for candidates moving from abroad' : ''
    out.push({
      id: 'gcc',
      label: 'GCC',
      prompt: cap(`Current ${roles} job openings in ${places}: ${level}, ${EXPAT_HINT}${visa}. ${ASK_FORMAT}`),
    })
  }
  if (regions.includes('IN')) {
    out.push({ id: 'india', label: 'India', prompt: cap(`Current ${roles} job openings in India: ${level}. ${ASK_FORMAT}`) })
  }
  const others = prefs.otherCountries.slice(0, 3)
  if (others.length > 0) {
    const visa = others.some((c) => sponsorFor.includes(c)) ? ', with visa sponsorship' : ''
    out.push({
      id: 'other',
      label: joinList(others.map(countryName), 'and'),
      prompt: cap(`Current ${roles} job openings in ${joinList(others.map(countryName))}: ${level}, open to foreign applicants${visa}. ${ASK_FORMAT}`),
    })
  }
  if (prefs.remoteScope !== 'none') {
    const home = countryName(prefs.extra.basedIn ?? 'IN')
    out.push({
      id: 'remote',
      label: `Remote from ${home}`,
      prompt: cap(
        `Remote ${roles} jobs that can be done from ${home}: remote worldwide, APAC, EMEA or ${home}-friendly time zones. ` +
          `${upperFirst(level)}, including stretch senior roles. Leave out US-only and EU-residency-only roles. ${ASK_FORMAT}`,
      ),
    })
  }
  out.push({
    id: 'relocation',
    label: 'Relocation offered',
    prompt: cap(
      `${upperFirst(roles)} jobs in any country that explicitly offer relocation support and/or visa sponsorship for international candidates: ` +
        `${level}. ${ASK_FORMAT}`,
    ),
  })
  return out.slice(0, MAX_FAMILIES)
}
