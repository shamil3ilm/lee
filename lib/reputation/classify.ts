import type { NewsCategory } from './types'

/**
 * Deterministic headline categories for news signals. Ordered: the first
 * matching rule wins, most serious first, so "Acme sued over unpaid
 * salaries" is wage theft, not a generic lawsuit.
 */
const RULES: ReadonlyArray<readonly [NewsCategory, RegExp]> = [
  [
    'wage_theft',
    /\b(?:unpaid|withheld|delayed|owed|non-?payment of)\s+(?:salar|wage|pay)|\bwage theft\b|\bsalary delays?\b|\bnot (?:been )?paid\b|\bstopped paying\b/i,
  ],
  [
    'fraud',
    /\bfraud|\bscam\b|\bponzi\b|\bembezzl|money laundering|\bmisappropriat|\bindicted\b|\bcharged with\b|\bsec charges\b/i,
  ],
  [
    'visa_contract',
    /\bvisas?\b|\bwork permits?\b|\blabou?r (?:law|ministry|violations?|dispute)|\bcontract (?:breach|violations?)|\bdeport|\bkafala\b|\bstranded workers\b|\bpassports? (?:confiscat|withheld)/i,
  ],
  [
    'layoffs',
    /\blay ?-?offs?\b|\blays? off\b|\blaid off\b|\bjob cuts?\b|\bcuts? [\d,]+ (?:jobs|roles|staff|employees)|\bredundanc|\bdownsiz|\bworkforce reduction|\bfurlough/i,
  ],
  ['lawsuit', /\blawsuits?\b|\bsued\b|\bsues\b|\bclass action\b|\blitigation\b|\bcourt\b|\bsettlement\b/i],
  [
    'funding',
    /\braises? \$|\braised \$|\bfunding round\b|\bseries [a-f]\b|\bseed round\b|\bvaluation\b|\bipo\b|\bacquires?\b|\bacquired\b/i,
  ],
]

export function classifyHeadline(title: string): NewsCategory {
  for (const [category, re] of RULES) {
    if (re.test(title)) return category
  }
  return 'other'
}

/** Categories that count as red flags in the panel. */
export const ALARMING_NEWS: ReadonlySet<NewsCategory> = new Set([
  'wage_theft',
  'fraud',
  'visa_contract',
  'layoffs',
  'lawsuit',
])
