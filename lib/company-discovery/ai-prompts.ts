import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { aiModeSearchUrl } from '@/lib/discovery/ai-mode/url'
import { shortName } from '@/lib/regions/tree'
import { expandSelection } from '@/lib/regions/selection'

/**
 * Google AI Mode hand-off prompts for company discovery: "startups in
 * Dubai building payments / fintech / ERP software that are hiring
 * engineers". Built from the search preferences only (places and role
 * families; no name, employer or contact details), opened in the user's own
 * browser. The user pastes the answer into "Add companies from text".
 * Pure, client-safe.
 */

export interface CompanyPrompt {
  id: string
  label: string
  prompt: string
  url: string
}

const DOMAIN_WORDS: Readonly<Record<string, string>> = {
  payments: 'payments',
  einvoicing: 'e-invoicing',
  erp: 'ERP',
  data: 'data',
  data_analyst: 'data',
  analytics_eng: 'data',
  ml: 'AI',
  llm_app: 'AI',
  api_integration: 'API and integration',
}

/** Cities the prompts name, most specific first (starred first). */
const PROMPT_PLACES = ['dubai', 'abu-dhabi', 'kuwait-city', 'riyadh', 'doha', 'manama', 'muscat', 'kochi', 'thiruvananthapuram', 'kozhikode', 'bengaluru']

export function companyPrompts(input: { regionIds: readonly string[]; starred: readonly string[]; families: readonly string[] }, max = 6): CompanyPrompt[] {
  const scope = new Set(expandSelection(input.regionIds.length > 0 ? input.regionIds : ['gcc', 'kerala']))
  const starred = new Set(expandSelection(input.starred))
  const places = PROMPT_PLACES.filter((p) => scope.has(p) || starred.has(p)).sort((a, b) => Number(starred.has(b)) - Number(starred.has(a)))
  const domains = [...new Set(input.families.map((f) => DOMAIN_WORDS[f]).filter((d): d is string => !!d))]
  const what = domains.length > 0 ? `${domains.slice(0, 3).join(', ')} or fintech software` : 'fintech, payments or SaaS software'
  const roles = input.families.length > 0 ? input.families.slice(0, 2).map(roleFamilyLabel).join(' or ') : 'backend or full-stack'
  return places.slice(0, max).map((p) => {
    const where = p === 'kuwait-city' ? 'Kuwait' : shortName(p)
    const prompt = `List startups and tech companies based in ${where} that build ${what} and hire software engineers (${roles}). Include smaller and newer companies that may not post on job portals, and say which hire expatriates. For each, give the company name and its official website.`
    return { id: `company-${p}`, label: `Companies in ${where}`, prompt, url: aiModeSearchUrl(prompt) }
  })
}
