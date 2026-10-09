import { isTestLoginEnabled } from '@/lib/auth/test-login-guard'
import { domainGuesses, splitQuery, type ResolveOption } from './search'

/**
 * Local E2E only (E2E_LOOKUP_FIXTURES=1 with the test sign-in enabled;
 * never on Vercel or in production): the company search answers offline
 * with a synthetic Wikidata-style option and one guess, so the journey never
 * contacts Wikidata or a company site.
 */
export function lookupFixturesEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return isTestLoginEnabled(env) && env.E2E_LOOKUP_FIXTURES === '1'
}

export function fixtureOptions(raw: string): ResolveOption[] {
  const { name, regionIds } = splitQuery(raw)
  if (name.length < 2) return []
  const base = domainGuesses(name)[0]?.replace(/\.com$/, '') ?? 'company'
  return [
    { id: 'wd:Q999001', name, website: `https://${base}.example`, description: 'software company (fixture)', regionIds: regionIds.length > 0 ? regionIds : ['kochi'], industries: ['software'], source: 'wikidata', wikidataId: 'Q999001', founded: 2021, employees: 40 },
    { id: 'guess:0', name, website: `https://www.${base}.example`, description: null, regionIds, industries: [], source: 'guess', reachable: null },
  ]
}
