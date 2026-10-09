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
  [
    'closure',
    /\bshuts? down\b|\bshutting down\b|\bceases? operations\b|\bwinds? down\b|\bbankrupt|\binsolven|\bliquidat|\bclos(?:es|ing|ed) (?:its )?(?:doors|operations|business)\b/i,
  ],
  ['lawsuit', /\blawsuits?\b|\bsued\b|\bsues\b|\bclass action\b|\blitigation\b|\bcourt\b|\bsettlement\b/i],
  [
    'funding',
    /\braises? \$|\braised \$|\braises? (?:usd|sar|aed|inr|rs\.?|₹)|\bfunding round\b|\bseries [a-f]\b|\bseed (?:round|funding)\b|\bpre-?seed\b|\bsecures? (?:\$|usd|funding|investment)|\bvaluation\b|\bipo\b/i,
  ],
  ['acquisition', /\bacquires?\b|\bacquired\b|\bacquisition\b|\bmerg(?:es|er) with\b/i],
  [
    'expansion',
    /\bexpands?\b|\bexpansion\b|\bnew (?:office|headquarters|hq|hub|campus|development cent(?:er|re))\b|\bopens? (?:an? )?(?:new )?(?:[a-z-]+ )?(?:office|hub|campus|cent(?:er|re))\b|\benters? (?:the )?(?:saudi|uae|qatar|kuwaiti?|indian|gcc|gulf) market\b|\blaunch(?:es)? in (?:saudi|the uae|uae|qatar|kuwait|india|bahrain|oman)\b|\bhiring spree\b/i,
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
  'closure',
])
