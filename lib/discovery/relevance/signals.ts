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
  /\b(?:employment|work|residence|residency) visa (?:will be |is )?(?:provided|sponsored|included|offered)\b/,
  /\b(?:we|company will) (?:sponsor|provide) (?:the |your )?(?:work |employment )?visa\b/,
  /\b(?:visa )?sponsorship (?:is )?(?:available|provided|offered)\b/,
  /\brelocation (?:package|assistance|support|allowance|provided|bonus)\b/,
  /\bopen to (?:candidates|applicants) (?:from|based in) (?:india|abroad|overseas|outside)\b/,
  /\b(?:international|overseas) (?:candidates|applicants) (?:are )?(?:welcome|considered|encouraged)\b/,
  /\bflights? (?:and|&) visa\b/,
  // Benefit lists: "visa + medical", "visa & air ticket", "visa, accommodation and transport".
  /\bvisa ?(?:\+|&|and|,) ?(?:annual )?(?:accommodation|air ?tickets?|tickets?|flights?|medical|insurance|transport(?:ation)?|housing)\b/,
  /\bcompany (?:provided |sponsored )?visa\b|\bcompany provides? (?:a |the |your )?(?:work |employment )?visa\b/,
  // "Benefits: employment visa, medical insurance and annual air ticket provided."
  /\b(?:employment |work |residence )?visa\b[^.;]{0,80}\b(?:provided|included|offered|covered|sponsored)\b/,
  /\biqama (?:will be |is )?(?:provided|sponsored|included|offered|issued)\b|\bcompany iqama\b/,
  /\btransferr?able (?:iqama|visa) (?:is )?not (?:required|needed|necessary)\b/,
]

/** "Visa is not provided", "no visa sponsorship", "does not sponsor": never an offer. */
const VISA_DENIED = /\b(?:no|not|never|without|unable to|cannot|can't|won't|don't|do not|does not|doesn't|will not)\b(?: \w+){0,3} (?:visa|sponsor(?:ship|s)?)\b|\bvisa (?:is |will )?not (?:be )?(?:provided|sponsored|offered|included|available)\b/

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
/** Demonyms only (not "UAE" / "GCC", which also name a place). */
const GCC_DEMONYM = '(?:emirati|saudi|qatari|kuwaiti|bahraini|omani)'
/** Plural demonyms used for people ("for Kuwaitis"). */
const GCC_PEOPLE = '(?:emiratis|saudis|qataris|kuwaitis|bahrainis|omanis)'
/** Words that make a nationality about people, not an employer ("Saudi National Bank"). */
const WHO = '(?:candidates?|applicants?|citizens?|jobseekers?|job seekers?|graduates?|talent|hires?)'

/** "UAE nationals preferred", "preference will be given to Saudi nationals": soft, not a skip. */
const NATIONALS_PREFERRED: readonly RegExp[] = [
  new RegExp(`\\b${GCC_NATIONALITY}? ?nationals? (?:are |is |will be )?(?:preferred|(?:given )?(?:preference|priority)|an advantage|a plus|desirable)\\b`),
  new RegExp(`\\b(?:preference|priority) (?:will be |is )?given to ${GCC_NATIONALITY} nationals?\\b`),
  new RegExp(`\\bpreferably (?:a |an )?${GCC_NATIONALITY} nationals?\\b`),
]

/**
 * Nationals-only / nationalisation-quota roles: the one work-authorisation
 * mismatch. The phrase must be about candidates: plural "nationals" ("Saudi
 * nationals only", "for Kuwaiti nationals"), or a nationality followed by
 * "only" or a people word ("Emirati candidates only"). A singular "national"
 * before anything else is a proper name: "Saudi National Bank", "UAE
 * national carriers".
 */
const NATIONALISATION =
  '(?:emiratisation|emiratization|saudization|saudisation|saudi[sz]ation|nitaqat|qatarization|qatarisation|omanisation|omanization|kuwaitization|kuwaitisation|bahrainisation|bahrainization)'

/** Unambiguous requirements: they count wherever they appear. */
const NATIONALS_ONLY_STRONG: readonly RegExp[] = [
  new RegExp(`\\b${GCC_NATIONALITY} (?:national|${WHO}) only\\b`),
  new RegExp(`\\bonly (?:for |open to )?${GCC_NATIONALITY} (?:nationals?|${WHO})\\b`),
  /\bnationals only\b/,
  new RegExp(`\\b(?:reserved for|restricted to|limited to|exclusively for|open only to) ${GCC_NATIONALITY} (?:nationals?|${WHO})\\b`),
  new RegExp(`\\b(?:reserved for|restricted to|limited to|exclusively for|open only to) ${GCC_PEOPLE}\\b|\\b${GCC_PEOPLE} only\\b`),
  new RegExp(`\\b(?:must|should|need to|needs to|required to) (?:be|hold) (?:an? )?${GCC_NATIONALITY} (?:nationals?|citizens?|citizenship|passport)\\b`),
  new RegExp(`\\b${GCC_NATIONALITY} (?:nationality|citizenship) (?:is )?(?:required|mandatory|a must)\\b`),
  new RegExp(`\\b(?:this|the) (?:role|position|job|vacancy|opening|opportunity) is (?:only )?(?:open |available )?(?:to|for) ${GCC_NATIONALITY} (?:nationals?|${WHO})\\b`),
]

/**
 * Phrases that name nationals but can also be company boilerplate ("70% of
 * our workforce are Kuwaiti nationals", "we support Emiratisation"): they
 * count only in a sentence that is not about the company and does not
 * welcome other nationalities.
 */
const NATIONALS_ONLY_WEAK: readonly RegExp[] = [
  new RegExp(`\\b${GCC_NATIONALITY} nationals\\b`),
  new RegExp(`\\b${GCC_NATIONALITY} national ${WHO}\\b`),
  // "for Kuwaiti candidates" (demonyms only: "for UAE candidates" usually means candidates IN the UAE).
  new RegExp(`\\bfor ${GCC_DEMONYM} ${WHO}\\b`),
  new RegExp(`\\bfor ${GCC_PEOPLE}\\b`),
  // Kuwait's national-labour programme for the private sector.
  /\b(?:mgrp|manpower and government restructuring program(?:me)?)\b/,
  new RegExp(`\\b${NATIONALISATION}\\b`),
]

/** A sentence about the employer, not this opening. */
const BOILERPLATE = new RegExp(
  [
    '\\bwe (?:employ|have|are|were|support|invest|believe|nurture|develop|empower|take pride|proudly|remain|continue)\\b',
    '\\bour (?:workforce|employees|people|team members|staff|mission|vision|commitment|values|culture|history|graduate)\\b',
    '\\b(?:committed to|commitment to|proud(?:ly)?|founded|established in|headquartered|employs|employer of choice|largest|leading)\\b',
    '\\b\\d{1,3} ?(?:%|percent) of\\b',
    '\\b(?:in line with|in support of|supports?|supporting|contribut\\w+ to|aligned with|as part of)\\b',
    `\\b(?:develop|developing|empower|empowering|nurture|nurturing|train|training|upskill\\w*|attract\\w*|retain\\w*|invest\\w* in) (?:young |local |national |the next generation of )?${GCC_NATIONALITY}\\b`,
    '\\b(?:vision 20\\d\\d|national (?:vision|agenda|strategy))\\b',
    `\\b${GCC_NATIONALITY} (?:company|firm|bank|group|conglomerate|shareholding|owned|economy|market|private sector|business)\\b`,
  ].join('|'),
)

/** "Open to all nationalities", "Kuwaiti nationals and expatriates": not exclusive. */
const INCLUSIVE =
  /\b(?:all nationalities|any nationality|other nationalities|regardless of nationality|non[\s-]?(?:kuwaitis?|emiratis?|saudis?|qataris?|bahrainis?|omanis?|nationals?|gcc)|expat(?:riate)?s?|international candidates)\b/

/** "Data Analyst - UAE National", "Developer (Saudi Nationals Only)": a title segment naming nationals. */
const TITLE_NATIONALS = new RegExp(`(?:^|[-–|(,/:])\\s*${GCC_NATIONALITY} nationals?(?: only)?\\s*(?:$|[)\\]|,/-])`)

/** Sentences (split before normalising, since normalising folds newlines). */
function sentences(text: string): string[] {
  return text
    .slice(0, 8_000)
    .split(/(?<=[.;!?])\s+|\n+|\s[•·]\s|^\s*[-*]\s/m)
    .map((s) => normalizeForMatch(s))
    .filter(Boolean)
}

function weakCounts(sentence: string): boolean {
  return NATIONALS_ONLY_WEAK.some((re) => re.test(sentence)) && !BOILERPLATE.test(sentence) && !INCLUSIVE.test(sentence)
}

/** A GCC-style "visa provided / relocation / open to candidates from abroad" phrase. */
export function detectVisaOffered(description: string): string | null {
  const d = normalizeForMatch(description.slice(0, 8_000))
  // Read sentence by sentence so "no visa sponsorship" in one does not hide an offer in another.
  const offered = d.split(/(?<=[.;!?])\s+/).some((s) => !VISA_DENIED.test(s) && VISA_OFFERED.some((re) => re.test(s)))
  return offered ? 'visa / relocation offered' : null
}

/** "Must be in UAE", "residence visa", "own visa", "local candidates"… (info only). */
export function detectPresenceRequired(description: string): boolean {
  const d = normalizeForMatch(description.slice(0, 8_000))
  return PRESENCE_REQUIRED.some((re) => re.test(d))
}

const EXPLICIT_ONLY = new RegExp(
  `\\bnationals? only\\b|\\b(?:candidates?|applicants?) only\\b|\\bonly (?:for |open to )?${GCC_NATIONALITY} (?:nationals?|candidates?|applicants?)\\b|\\b${NATIONALISATION}\\b`,
)

/** "UAE nationals preferred"… (a soft penalty). */
export function detectNationalsPreferred(description: string): string | null {
  const d = normalizeForMatch(description.slice(0, 8_000))
  return NATIONALS_PREFERRED.some((re) => re.test(d)) ? 'nationals preferred' : null
}

/**
 * "UAE nationals only", "Saudization role"… A "nationals preferred" phrase
 * alone is not "only", and a mention of nationals in company boilerplate
 * ("a Kuwaiti company", "we support Emiratisation") is not a requirement.
 * The title counts when a segment of it names nationals ("BI Developer -
 * UAE National").
 */
export function detectNationalsOnly(description: string, title?: string | null): string | null {
  if (title && TITLE_NATIONALS.test(normalizeForMatch(title))) return 'nationals only'
  const parts = sentences(description)
  const strong = parts.some((s) => NATIONALS_ONLY_STRONG.some((re) => re.test(s)))
  if (!strong && !parts.some(weakCounts)) return null
  const d = normalizeForMatch(description.slice(0, 8_000))
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

function mandatoryRe(lang: string): RegExp {
  const must = '(?:required|mandatory|a must|essential|compulsory)'
  return new RegExp(
    `\\b${lang} (?:language )?(?:fluency |proficiency |speaking |skills? )?(?:is |are )?${must}\\b` +
      `|\\b(?:fluent|native|fluency in)[^.]{0,15}\\b${lang}\\b[^.]{0,30}\\b${must}\\b` +
      `|\\bmust (?:be )?(?:fluent|able to (?:speak|read|write)|speak|read|write)[^.]{0,20}\\b${lang}\\b` +
      `|\\bnative ${lang} speaker\\b|\\b${lang} native speaker\\b|\\b${lang} speakers? only\\b`,
  )
}

/**
 * Languages a posting makes MANDATORY ("Arabic fluency required", "must be
 * fluent in Arabic", "native Arabic speaker"), sentence by sentence; a
 * sentence that also says "preferred / a plus" does not count.
 */
export function detectMandatoryLanguages(t: SignalText): string[] {
  const text = `${normalizeForMatch(t.title)}. ${normalizeForMatch(t.description.slice(0, 8_000))}`
  const sentences = text.split(/(?<=[.;!?])\s+/)
  return KNOWN_LANGUAGES.filter((lang) =>
    sentences.some((s) => new RegExp(`\\b${lang}\\b`).test(s) && mandatoryRe(lang).test(s) && !preferredRe(lang).test(s)),
  )
}
