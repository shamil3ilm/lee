import { findTerms, normalizeForMatch } from './text'

/**
 * Keyword detectors for the per-rule exclusions (hard or soft, the user's
 * choice). Each returns a short human label for the reason chip, or null.
 * Title hits count on their own; description hits need a clear phrase (or
 * two distinct signals) so a passing mention does not trip a rule.
 */

export interface SignalText {
  title: string
  description: string
  employmentType?: string | null
}

function norm(t: SignalText): { title: string; desc: string } {
  return { title: normalizeForMatch(t.title), desc: normalizeForMatch(t.description.slice(0, 8_000)) }
}

const SALES_TITLE = ['sales', 'pre-sales', 'presales', 'business development', 'bdm', 'bde', 'account executive', 'sales engineer']
const SALES_DESC = [
  'quota', 'quotas', 'commission', 'commissions', 'on-target earnings', 'ote', 'pre-sales', 'presales',
  'business development', 'sales targets', 'sales target', 'cold calling', 'cold calls', 'lead generation',
  'revenue targets', 'pipeline generation', 'closing deals',
]

/** "sales-heavy / pre-sales". */
export function detectSales(t: SignalText): string | null {
  const { title, desc } = norm(t)
  const inTitle = findTerms(title, SALES_TITLE)
  if (inTitle.length > 0) return `sales-heavy (${inTitle[0]})`
  const inDesc = findTerms(desc, SALES_DESC)
  return inDesc.length >= 2 ? `sales-heavy (${inDesc.slice(0, 2).join(', ')})` : null
}

const CONTRACT_TITLE = ['contract', 'contractor', 'freelance', 'freelancer', 'temporary', 'temp', 'part-time', 'part time', 'hourly']
const CONTRACT_DESC_RE = [
  /\b\d{1,2}[\s-]*(?:month|months|mo)\s+(?:contract|engagement|assignment)\b/,
  /\b(?:contract|freelance|fixed[\s-]term)\s+(?:role|position|basis|opportunity|engagement|job)\b/,
  /\b(?:per[\s-]hour|hourly rate|\/\s*hr\b|\/\s*hour\b|per hour)/,
  /\bthis is a (?:contract|freelance|temporary)\b/,
  /\b(?:b2b contract|independent contractor|1099|corp[\s-]to[\s-]corp|c2c)\b/,
]
const PERMANENT = /\b(?:contract[\s-]to[\s-]hire|permanent|full[\s-]time employment)\b/

/** "contract / freelance only". Contract-to-hire and permanent roles do not count. */
export function detectContract(t: SignalText): string | null {
  const raw = norm(t)
  // "Smart contract" is a blockchain skill, not an engagement type.
  const title = raw.title.replace(/\bsmart[\s-]contracts?\b/g, ' ')
  const desc = raw.desc.replace(/\bsmart[\s-]contracts?\b/g, ' ')
  if (t.employmentType === 'contract' || t.employmentType === 'parttime') return 'contract / freelance'
  if (PERMANENT.test(title)) return null
  const inTitle = findTerms(title, CONTRACT_TITLE)
  if (inTitle.length > 0) return `contract / freelance (${inTitle[0]})`
  if (PERMANENT.test(desc)) return null
  return CONTRACT_DESC_RE.some((re) => re.test(desc)) ? 'contract / freelance' : null
}

const SHIFT_TERMS = [
  'night shift', 'night shifts', 'rotational shift', 'rotational shifts', 'rotating shift', 'rotating shifts',
  'rotational roster', '24x7', '24/7 support', '24 x 7', 'us shift', 'us shifts', 'uk shift', 'graveyard shift',
  'overnight shift', 'evening shift', 'shift-based', 'shift based', 'weekend shifts', 'on rotation',
]

/** "night / rotational shifts". */
export function detectShifts(t: SignalText): string | null {
  const { title, desc } = norm(t)
  const hits = findTerms(`${title} \n ${desc}`, SHIFT_TERMS)
  return hits.length > 0 ? `${hits[0]}` : null
}

const SUPPORT_TITLE = [
  'l1 support', 'l2 support', 'l1/l2 support', 'level 1 support', 'level 2 support', 'tier 1 support',
  'tier 2 support', 'helpdesk', 'help desk', 'service desk', 'desktop support', 'it support',
  'technical support representative', 'support analyst', 'noc engineer', 'l1 engineer', 'l2 engineer',
]

/** "pure support (L1/L2)": title-based; L3 or engineering-heavy support does not count. */
export function detectPureSupport(t: SignalText): string | null {
  const { title } = norm(t)
  if (/\bl3\b|\blevel 3\b|\btier 3\b/.test(title)) return null
  const hits = findTerms(title, SUPPORT_TITLE)
  return hits.length > 0 ? `pure support (${hits[0]})` : null
}

// ---------------------------------------------------------------------------
// Work authorisation (GCC wording)
// ---------------------------------------------------------------------------

const VISA_OFFERED = [
  /\bvisa (?:will be )?(?:provided|sponsored|sponsorship|offered|included|support)\b/,
  /\b(?:employment|work) visa (?:provided|sponsored|included)\b/,
  /\b(?:we|company will) (?:sponsor|provide) (?:the |your )?(?:work |employment )?visa\b/,
  /\bvisa sponsorship (?:is )?(?:available|provided|offered)\b/,
  /\brelocation (?:package|assistance|support|allowance|provided|bonus)\b/,
  /\bopen to (?:candidates|applicants) (?:from|based in) (?:india|abroad|overseas|outside)\b/,
  /\b(?:international|overseas) (?:candidates|applicants) (?:are )?(?:welcome|considered|encouraged)\b/,
  /\bflights? (?:and|&) visa\b|\bvisa (?:and|&) (?:flights?|accommodation|medical)\b/,
]

/**
 * "Be in the country" wording. Not a mismatch: a candidate can travel on a
 * visit visa for a matching role, so these only produce an info chip.
 */
const PRESENCE_REQUIRED: readonly RegExp[] = [
  /\b(?:must|should) (?:be )?(?:currently )?(?:based|located|residing|living|present|available) in (?:the )?(?:uae|u\.a\.e|dubai|abu dhabi|sharjah|saudi arabia|ksa|riyadh|jeddah|qatar|doha|kuwait|bahrain|oman|muscat|gcc)\b/,
  /\b(?:currently|already) (?:based|residing|living|located) in (?:the )?(?:uae|dubai|ksa|saudi|qatar|kuwait|bahrain|oman)\b/,
  /\bresiden(?:ce|cy) visa\b|\bvalid (?:uae |saudi |qatar |gcc )?visa\b/,
  /\blocal (?:candidates|applicants|hires?|residents)\b|\blocals only\b|\blocally based\b/,
  /\btransferr?able (?:visa|iqama)\b/,
  /\bown (?:visa|sponsorship)\b/,
  /\b(?:visit|tourist) visa\b/,
  /\bimmediate joiners? (?:in|within) (?:the )?(?:uae|ksa|qatar|gcc)\b/,
]

const GCC_NATIONALITY = '(?:uae|emirati|saudi|qatari|kuwaiti|bahraini|omani|gcc)'

/** "UAE nationals preferred", "preference will be given to Saudi nationals": soft, not a skip. */
const NATIONALS_PREFERRED: readonly RegExp[] = [
  new RegExp(`\\b${GCC_NATIONALITY}? ?nationals? (?:are |is |will be )?(?:preferred|(?:given )?(?:preference|priority)|an advantage|a plus|desirable)\\b`),
  new RegExp(`\\b(?:preference|priority) (?:will be |is )?given to ${GCC_NATIONALITY} nationals?\\b`),
  new RegExp(`\\bpreferably (?:a |an )?${GCC_NATIONALITY} nationals?\\b`),
]

/** Nationals-only / nationalisation-quota roles: the one work-authorisation mismatch. */
const NATIONALS_ONLY: readonly RegExp[] = [
  /\b(?:uae|emirati|saudi|qatari|kuwaiti|bahraini|omani|gcc) nationals?(?: only)?\b/,
  /\bnationals only\b|\bfor (?:uae|saudi|qatari|kuwaiti|bahraini|omani) nationals\b/,
  /\b(?:emiratisation|emiratization|saudization|saudisation|nitaqat|qatarization|qatarisation|omanisation|omanization|kuwaitization|bahrainisation|bahrainization)\b/,
]

/** A GCC-style "visa provided / relocation / open to candidates from abroad" phrase. */
export function detectVisaOffered(description: string): string | null {
  const d = normalizeForMatch(description.slice(0, 8_000))
  return VISA_OFFERED.some((re) => re.test(d)) ? 'visa / relocation offered' : null
}

/** "Must be in UAE", "residence visa", "own visa", "local candidates"… (info only). */
export function detectPresenceRequired(description: string): boolean {
  const d = normalizeForMatch(description.slice(0, 8_000))
  return PRESENCE_REQUIRED.some((re) => re.test(d))
}

const EXPLICIT_ONLY = /\bnationals? only\b|\bonly (?:for |open to )?(?:uae|emirati|saudi|qatari|kuwaiti|bahraini|omani|gcc) nationals?\b|\b(?:emiratisation|emiratization|saudization|saudisation|nitaqat|qatarization|qatarisation|omanisation|omanization|kuwaitization|bahrainisation|bahrainization)\b/

/** "UAE nationals preferred"… (a soft penalty). */
export function detectNationalsPreferred(description: string): string | null {
  const d = normalizeForMatch(description.slice(0, 8_000))
  return NATIONALS_PREFERRED.some((re) => re.test(d)) ? 'nationals preferred' : null
}

/** "UAE nationals only", "Saudization role"… A "nationals preferred" phrase alone is not "only". */
export function detectNationalsOnly(description: string): string | null {
  const d = normalizeForMatch(description.slice(0, 8_000))
  if (!NATIONALS_ONLY.some((re) => re.test(d))) return null
  if (detectNationalsPreferred(description) && !EXPLICIT_ONLY.test(d)) return null
  return 'nationals only'
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

export const KNOWN_LANGUAGES = [
  'arabic', 'english', 'hindi', 'urdu', 'malayalam', 'tamil', 'telugu', 'kannada', 'marathi',
  'bengali', 'gujarati', 'punjabi', 'french', 'german', 'spanish', 'portuguese', 'italian',
  'dutch', 'russian', 'turkish', 'persian', 'farsi', 'mandarin', 'chinese', 'japanese', 'korean',
  'tagalog', 'filipino', 'danish', 'swedish', 'norwegian', 'polish',
] as const

export interface LanguageMention {
  language: string
  required: boolean
}

function requiredRe(lang: string): RegExp {
  return new RegExp(
    `\\b(?:fluent|native|fluency in|proficiency in|proficient in|excellent|strong|business[\\s-]level|written and spoken|native[\\s-]level) (?:in )?${lang}\\b` +
      `|\\b${lang} (?:language )?(?:is )?(?:required|mandatory|a must|essential|fluency|speaker required|speakers? only|native|speaking (?:is )?(?:required|mandatory|a must))\\b` +
      `|\\bmust (?:be able to )?(?:speak|read|write)[^.]{0,20}\\b${lang}\\b` +
      `|\\b${lang}[\\s-]speaking (?:candidates|applicants)\\b` +
      `|\\bbilingual[^.]{0,25}\\b${lang}\\b|\\b${lang}[^.]{0,10}\\bbilingual\\b`,
  )
}

function preferredRe(lang: string): RegExp {
  return new RegExp(
    `\\b${lang}[^.]{0,20}\\b(?:preferred|a plus|an advantage|advantageous|nice to have|desirable|bonus|beneficial)\\b` +
      `|\\b(?:knowledge of|basic) ${lang}\\b`,
  )
}

/** Languages a posting names, and whether it requires them. "Arabic is a plus" is not required. */
export function detectLanguages(t: SignalText): LanguageMention[] {
  const text = `${normalizeForMatch(t.title)} \n ${normalizeForMatch(t.description.slice(0, 8_000))}`
  const out: LanguageMention[] = []
  for (const lang of KNOWN_LANGUAGES) {
    if (!new RegExp(`\\b${lang}\\b`).test(text)) continue
    const required = requiredRe(lang).test(text) && !preferredRe(lang).test(text)
    out.push({ language: lang, required })
  }
  return out
}
