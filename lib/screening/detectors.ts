import { normalizeForMatch } from '@/lib/discovery/relevance/text'

/**
 * New knockout detectors for the eligibility stage (deterministic, English
 * plus common GCC wording). Read sentence by sentence on normalised text so
 * a phrase in one sentence never borrows a cue from another. The existing
 * detectors (nationals, visa offered, presence, languages) stay in
 * lib/discovery/relevance/signals.ts and are reused, not copied.
 */

const WINDOW = 8_000

function sentencesOf(text: string | null | undefined): string[] {
  return (text ?? '')
    .slice(0, WINDOW)
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((s) => normalizeForMatch(s))
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Presence: "must already hold a visa" (hard) vs "in-country preferred" (soft)
// ---------------------------------------------------------------------------

const GCC_PLACE =
  '(?:the )?(?:uae|u\\.a\\.e|dubai|abu dhabi|sharjah|saudi arabia|saudi|ksa|riyadh|jeddah|dammam|qatar|doha|kuwait|bahrain|manama|oman|muscat|gcc)'

/** The candidate must ALREADY hold a work/residence permit: a knockout for someone who needs sponsorship. */
const MUST_HOLD_VISA: readonly RegExp[] = [
  /\btransferr?able (?:visa|iqama|residen(?:ce|cy))\b(?![^.]{0,30}\bnot (?:required|needed|necessary)\b)/,
  /\b(?:own|valid) (?:uae |saudi |qatari? |kuwaiti? |gcc )?(?:work |employment |residence |residency )?(?:visa|iqama|sponsorship)\b(?! (?:will be |is )?(?:provided|offered|sponsored))/,
  /\b(?:must|should|need to|required to) (?:already )?(?:hold|have|possess) (?:an? |a valid |valid )?(?:uae |saudi |gcc )?(?:work |employment |residence |residency )?(?:visa|iqama|work permit|residence permit)\b/,
  /\bresiden(?:ce|cy) visa (?:holders?|is (?:required|mandatory|a must))\b/,
  /(?<!\bno )\bnoc (?:is )?(?:required|mandatory)\b|\bwith (?:a )?(?:transferr?able |valid )?noc\b/,
]

/** Employers prefer someone already there (cost and speed, not legality): at risk, not fail. */
const IN_COUNTRY_PREFERRED: readonly RegExp[] = [
  new RegExp(`\\b(?:must|should) (?:be )?(?:currently )?(?:based|located|residing|living|present|available) in ${GCC_PLACE}\\b`),
  new RegExp(`\\b(?:currently|already) (?:based|residing|living|located) in ${GCC_PLACE}\\b`),
  new RegExp(`\\b(?:candidates|applicants) (?:currently )?(?:based |residing |located )?(?:in|within) ${GCC_PLACE}\\b`),
  new RegExp(`\\bin[\\s-]country (?:candidates|applicants|hires?|only)\\b`),
  /\blocal (?:candidates|applicants|hires?|residents)\b|\blocals only\b|\blocally based\b/,
  /\b(?:visit|tourist) visa\b/,
  new RegExp(`\\bimmediate joiners? (?:in|within|from) ${GCC_PLACE}\\b`),
]

/** The employer will not sponsor: a knockout wherever it appears. */
const SPONSORSHIP_DENIED =
  /\b(?:no|not) (?:visa )?sponsorship\b|\bwe (?:do not|don't|cannot|can't|will not) sponsor\b|\bvisa (?:is |will )?not (?:be )?(?:provided|sponsored|offered)\b/

const PREFERENCE = /\b(?:preferred|preferably|a plus|an advantage|advantageous|desirable|ideally)\b/

export type PresenceAsk ={ kind: 'must_hold_visa' | 'in_country'; phrase: string }

/** The strongest presence ask in the JD: a hard "already hold a visa", else an in-country preference, else null. */
export function detectPresenceAsk(description: string | null | undefined): PresenceAsk | null {
  const sentences = sentencesOf(description)
  for (const s of sentences) {
    const denied = SPONSORSHIP_DENIED.exec(s)
    if (denied) return { kind: 'must_hold_visa', phrase: denied[0] }
  }
  for (const s of sentences) {
    // "Own visa preferred" is a preference, not a knockout: it reads as in-country preferred below.
    if (PREFERENCE.test(s)) continue
    for (const re of MUST_HOLD_VISA) {
      const m = re.exec(s)
      if (m) return { kind: 'must_hold_visa', phrase: m[0] }
    }
  }
  for (const s of sentences) {
    if (!PREFERENCE.test(s)) continue
    const m = MUST_HOLD_VISA.map((re) => re.exec(s)).find(Boolean)
    if (m) return { kind: 'in_country', phrase: m[0] }
  }
  for (const s of sentences) {
    for (const re of IN_COUNTRY_PREFERRED) {
      const m = re.exec(s)
      if (m) return { kind: 'in_country', phrase: m[0] }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Notice period / immediate joiner
// ---------------------------------------------------------------------------

export interface NoticeAsk {
  /** Most days of notice the posting accepts (0 = immediate). */
  days: number
  phrase: string
}

const UNIT_DAYS: Readonly<Record<string, number>> = { day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30 }

const NOTICE_PATTERNS: ReadonlyArray<{ re: RegExp; days: (m: RegExpExecArray) => number }> = [
  { re: /\bimmediate (?:joiners?|joining|joinee|start(?:ers?)?|availability)\b|\bjoin(?:ing)? immediately\b|\bavailable to (?:join|start) immediately\b/, days: () => 0 },
  {
    re: /\b(?:join|joining|start|available to join|able to join|can join)\s+(?:with)?in\s+(\d{1,2})\s+(days?|weeks?|months?)\b/,
    days: (m) => Number(m[1]) * (UNIT_DAYS[m[2]!] ?? 1),
  },
  {
    re: /\bnotice(?: period)?(?: of)? (?:less than|under|below|max(?:imum)?(?: of)?|up to|upto|not more than|within|<=?)\s*(\d{1,2})\s+(days?|weeks?|months?)\b/,
    days: (m) => Number(m[1]) * (UNIT_DAYS[m[2]!] ?? 1),
  },
  { re: /\b(\d{1,2})\s+(days?|weeks?)\s+notice\b/, days: (m) => Number(m[1]) * (UNIT_DAYS[m[2]!] ?? 1) },
  { re: /\bshort notice(?: period)?\b|\bserving notice\b/, days: () => 30 },
]

/** "Immediate joiners only", "join within 15 days", "notice period up to 30 days" → the most notice accepted. */
export function detectNoticeAsk(description: string | null | undefined): NoticeAsk | null {
  let best: NoticeAsk | null = null
  for (const s of sentencesOf(description)) {
    for (const p of NOTICE_PATTERNS) {
      const m = p.re.exec(s)
      if (!m) continue
      const days = p.days(m)
      if (!Number.isFinite(days) || days > 120) continue
      if (!best || days < best.days) best = { days, phrase: m[0] }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Degree mandatory / attestation
// ---------------------------------------------------------------------------

export type DegreeLevel = 'diploma' | 'bachelor' | 'master' | 'phd'
export const DEGREE_RANK: Readonly<Record<DegreeLevel, number>> = { diploma: 0, bachelor: 1, master: 2, phd: 3 }

// "BE" / "ME" are only read dotted ("B.E.") or paired ("BE/BTech"): bare "be" and "me" are words.
const DEGREE_WORDS: ReadonlyArray<readonly [DegreeLevel, RegExp]> = [
  ['phd', /\bph\.? ?d\b|\bdoctorate\b/],
  ['master', /\bmaster'?s?\b|\bm\.? ?sc\b|\bm\.? ?tech\b|\bm\.e\b|\bme ?\/ ?m\.? ?tech\b|\bmca\b|\bmba\b|\bpost ?graduate\b/],
  ['bachelor', /\bbachelor'?s?\b|\bb\.? ?sc\b|\bb\.? ?tech\b|\bb\.e\b|\bbe ?\/ ?b\.? ?tech\b|\bbca\b|\bb\.? ?com\b|\bgraduate degree\b|\bundergraduate\b|\b(?:university |college )?degree\b|\bgraduat(?:e|ion) in\b/],
  ['diploma', /\bdiploma\b/],
]

/** A résumé education line's level: "BE Computer Science", "B.Tech", "Master of Science". */
const CREDENTIAL_WORDS: ReadonlyArray<readonly [DegreeLevel, RegExp]> = [
  ['phd', /\bph\.? ?d\b|\bdoctor(?:ate)? of\b/],
  ['master', /\bmaster\b|\bm\.? ?sc\b|\bm\.? ?tech\b|^m\.? ?e\b|\bmca\b|\bmba\b|\bm\.? ?s\b/],
  ['bachelor', /\bbachelor\b|\bb\.? ?sc\b|\bb\.? ?tech\b|^b\.? ?e\b|\bbca\b|\bb\.? ?com\b|\bb\.? ?s\b|\bb\.? ?a\b|\bundergraduate\b/],
  ['diploma', /\bdiploma\b/],
]

/** The highest degree level among résumé credentials, or null when none reads as a degree. */
export function highestCredential(credentials: readonly string[]): DegreeLevel | null {
  let best: DegreeLevel | null = null
  for (const c of credentials) {
    const t = normalizeForMatch(c)
    const hit = CREDENTIAL_WORDS.find(([, re]) => re.test(t))?.[0]
    if (hit && (best === null || DEGREE_RANK[hit] > DEGREE_RANK[best])) best = hit
  }
  return best
}

const MUST = /\b(?:mandatory|required|is a must|must (?:have|hold|possess|be)|essential|compulsory|minimum)\b/
const SOFT = /\b(?:or equivalent|equivalent experience|preferred|preferably|a plus|an advantage|desirable|or related experience)\b/

export interface DegreeAsk {
  level: DegreeLevel
  phrase: string
}

/** A degree the JD makes mandatory ("BE/BTech in CS mandatory"); "or equivalent" and "preferred" asks are not knockouts. */
export function detectDegreeMandatory(description: string | null | undefined): DegreeAsk | null {
  for (const s of sentencesOf(description)) {
    if (!MUST.test(s) || SOFT.test(s)) continue
    for (const [level, re] of DEGREE_WORDS) {
      const m = re.exec(s)
      if (m) return { level, phrase: s.length > 90 ? `${s.slice(0, 89)}…` : s }
    }
  }
  return null
}

/** "Attested degree certificates required", "attestation of documents". */
export function detectAttestation(description: string | null | undefined): string | null {
  for (const s of sentencesOf(description)) {
    const m = /\battest(?:ed|ation)\b[^.]{0,40}|\b(?:degree|educational|academic|certificates?)\b[^.]{0,30}\battest(?:ed|ation)\b/.exec(s)
    if (m) return m[0].trim()
  }
  return null
}

// ---------------------------------------------------------------------------
// Permit-title rules: Kuwait (KSE) and Saudi (SCE) "Engineer" titles
// ---------------------------------------------------------------------------

/** "Software Engineer", "Backend Engineer": an engineer title (not "Engineering Manager"). */
export function isEngineerTitle(title: string): boolean {
  return /\bengineer\b/.test(normalizeForMatch(title))
}
