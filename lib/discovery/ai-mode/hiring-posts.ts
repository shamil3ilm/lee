import { GCC_CODES, regionLabel } from '@/lib/discovery/relevance/places'
import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import type { SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { domainsText, EXPAT_HINT, joinList } from './phrases'
import { scrubPii } from './pii'
import type { AiModePrompt } from './prompts'
import { MAX_PROMPT_LENGTH } from './url'

/**
 * AI Mode prompts that look for LinkedIn HIRING POSTS ("We're hiring a
 * Laravel developer in Dubai, DM me"), a major GCC channel. Like every AI
 * Mode prompt: built from the search preferences only (scrubbed against the
 * profile's identifiers), opened by the user in their own browser. lee never
 * searches or opens LinkedIn itself; the answer comes back through "Add from
 * text or link".
 */

const FALLBACK_ROLES = 'Laravel / PHP developers or payments engineers'
const ASK =
  'For each post give the poster’s name and company, the role, the city, how to apply (email address, DM or link) and the direct link to the post (linkedin.com/posts/… or linkedin.com/feed/update/…). ' +
  'Only posts announcing an opening, from the last 14 days; leave out job seekers’ “open to work” posts.'

function cap(prompt: string): string {
  return prompt.replace(/\s{2,}/g, ' ').trim().slice(0, MAX_PROMPT_LENGTH)
}

function rolesText(prefs: SearchPrefs, pii: readonly string[]): string {
  const roles = [...prefs.roleFamilies.map((id) => roleFamilyLabel(id)), ...prefs.customRoles.map((r) => scrubPii(r, pii))]
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 3)
  return roles.length > 0 ? joinList(roles) : FALLBACK_ROLES
}

export function buildHiringPostPrompts(prefs: SearchPrefs, pii: readonly string[] = []): AiModePrompt[] {
  const roles = rolesText(prefs, pii)
  const gcc = prefs.regions.filter((r) => GCC_CODES.includes(r))
  const places = gcc.length > 0 ? joinList(gcc.map(regionLabel)) : 'Dubai, Abu Dhabi, Riyadh, Doha or Kuwait'
  const out: AiModePrompt[] = [
    {
      id: 'posts-gcc',
      label: 'LinkedIn hiring posts · GCC',
      prompt: cap(`Recent LinkedIn posts by recruiters, hiring managers or founders saying they are hiring ${roles} in ${places}, ${EXPAT_HINT}. ${ASK}`),
    },
  ]
  const domains = domainsText(prefs, pii)
  if (domains) {
    out.push({
      id: 'posts-domain',
      label: `LinkedIn hiring posts · ${domains}`,
      prompt: cap(`Recent LinkedIn posts from companies in the GCC hiring engineers for ${domains} work (for example "we're hiring", "send your CV", "DM me"). ${ASK}`),
    })
  }
  if (prefs.regions.includes('IN')) {
    out.push({
      id: 'posts-india',
      label: 'LinkedIn hiring posts · India',
      prompt: cap(`Recent LinkedIn posts by recruiters or founders in India saying they are hiring ${roles} (Bengaluru, Kochi, Hyderabad or remote). ${ASK}`),
    })
  }
  return out
}
