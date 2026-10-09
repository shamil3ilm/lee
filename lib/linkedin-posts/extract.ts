import { FREEMAIL_DOMAINS } from '@/lib/scam/domains'
import { resolveLocation } from '@/lib/regions/normalize'
import { placeName } from '@/lib/regions/display'
import { isLinkedInUrl, unwrapLinkedInRedirect } from './urls'

/**
 * What a hiring post says, read deterministically from its text (and the
 * poster's headline when the email shows it): the role, the place (through
 * the one region normaliser), the employer when one is named, and how to
 * respond (an email address visible in the post, "DM me", an apply link).
 * Pure: links are only read, never requested.
 */

export interface PostContact {
  /** Addresses written in the post itself (never looked up or guessed). */
  emails: string[]
  /** The post asks for a direct message. */
  dm: boolean
  /** Non-LinkedIn links in the post (careers pages, forms), canonical as written. */
  applyLinks: string[]
  /** The post points to WhatsApp / Telegram (shown; Scam Shield weighs it). */
  chat: boolean
}

export interface PostFacts {
  role: string | null
  location: string | null
  /** Region node ids (deepest places + ancestors). */
  regionIds: string[]
  remote: 'remote' | 'hybrid' | 'onsite' | 'unknown'
  company: string | null
  /** A company domain from a non-freemail contact address. */
  companyDomain: string | null
  contact: PostContact
}

const ROLE_NOUNS =
  'developers?|engineers?|programmers?|architects?|devops|sre|qa|testers?|designers?|analysts?|consultants?|scientists?|administrators?|specialists?|team leads?|tech leads?|leads?|interns?|managers?'
const ROLE_RE = new RegExp(
  String.raw`(?:(?:senior|junior|mid[- ]?level|lead|principal|staff|sr\.?|jr\.?)\s+)?(?:[A-Za-z][\w.+#/-]*\s+){0,4}?(?:${ROLE_NOUNS})(?:\s+(?:${ROLE_NOUNS}))?\b(?:\s*\([^)\n]{1,30}\))?`,
  'i',
)
const ROLE_CUE_RE =
  /(?:hiring|looking for|looking to hire|seeking|need|needs|requirement(?: for)?|opening for|vacancy(?: for)?|position|open role|role|job title|designation)\s*[:\-–|]?\s*(?:an?\s+|two\s+|\d+\s+)?/gi
const FILLER_RE = /^(?:an?|the|our|talented|experienced|skilled|passionate|motivated|strong|great|brilliant|exceptional|dynamic|full[- ]time|part[- ]time|remote|urgent(?:ly)?)\s+/i
const NOT_A_ROLE = /^(?:hiring )?managers?$|^leads?$|^interns?$/i
const ARABIC_ROLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/مهندس برمجيات/, 'Software Engineer'],
  [/مطور ويب/, 'Web Developer'],
  [/مطور|مبرمج/, 'Developer'],
  [/مهندس/, 'Engineer'],
  [/محلل بيانات/, 'Data Analyst'],
]

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g
const URL_RE = /\bhttps?:\/\/[^\s<>"'`{}|\\^[\]]+/gi
const DM_RE = /\b(?:dm|inbox|message|ping) (?:me|us)\b|\bvia dms?\b|\bdms? (?:are )?open\b|\bdm (?:for|to)\b|\bin (?:the )?dms?\b|الرسائل الخاصة|راسلني|تواصل معي/i
const CHAT_RE = /\bwhats\s?app\b|\bwa\.me\/|\btelegram\b|\bt\.me\//i
const MAX_LIST = 3

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[\s,.;:–-]+$/, '').trim()
}

function capitalise(s: string): string {
  return s
    .split(' ')
    .map((w) => (/^[a-z]/.test(w) && !/^(?:of|and|for|in|to|with)$/.test(w) ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function cleanRole(raw: string): string | null {
  let role = tidy(raw)
  while (FILLER_RE.test(role)) role = role.replace(FILLER_RE, '')
  if (!role || NOT_A_ROLE.test(role) || role.length > 80) return null
  return capitalise(role)
}

function arabicRole(text: string): string | null {
  const m = /(?:مطلوب|نبحث عن|توظيف\s*:?)\s*([^\n.،,]{2,60})/.exec(text)
  if (!m) return null
  const segment = m[1]!.split(/\s(?:لل|في|ب|من|مع)\S*/)[0] ?? m[1]!
  const mapped = ARABIC_ROLES.find(([re]) => re.test(segment))?.[1]
  if (!mapped) return null
  const latin = (segment.match(/[A-Za-z][\w.+#-]*/g) ?? []).slice(0, 3)
  return capitalise([...latin, mapped].join(' '))
}

/** The role the post hires for: after a hiring cue first, else the first role phrase, else Arabic. */
export function guessRole(text: string): string | null {
  for (const cue of text.matchAll(ROLE_CUE_RE)) {
    const after = text.slice((cue.index ?? 0) + cue[0].length, (cue.index ?? 0) + cue[0].length + 90)
    const m = ROLE_RE.exec(after)
    if (m && m.index <= 2) {
      const role = cleanRole(m[0])
      if (role) return role
    }
  }
  const any = ROLE_RE.exec(text)
  const role = any ? cleanRole(any[0]) : null
  return role ?? arabicRole(text)
}

function remoteOf(text: string): PostFacts['remote'] {
  if (/\bremote\b|work from home|عن بعد/i.test(text)) return 'remote'
  if (/\bhybrid\b/i.test(text)) return 'hybrid'
  if (/\bon-?site\b|\bin[- ]office\b/i.test(text)) return 'onsite'
  return 'unknown'
}

export function guessLocation(text: string): { location: string | null; regionIds: string[] } {
  const r = resolveLocation(text)
  const places = r.places.filter((p) => p.id !== 'remote').slice(0, 2)
  if (places.length === 0) return { location: null, regionIds: [...r.ids] }
  return { location: places.map((p) => placeName(p.id)).join(' / '), regionIds: [...r.ids] }
}

export function contactOf(text: string): PostContact {
  const emails = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase().replace(/\.+$/, '')))]
    .filter((e) => !e.endsWith('@linkedin.com'))
    .slice(0, MAX_LIST)
  const applyLinks = [
    ...new Set(
      (text.match(URL_RE) ?? [])
        .map((u) => unwrapLinkedInRedirect(u.replace(/[.,;:!?)'"]+$/, '')))
        .filter((u) => !isLinkedInUrl(u)),
    ),
  ].slice(0, MAX_LIST)
  return { emails, dm: DM_RE.test(text), applyLinks, chat: CHAT_RE.test(text) }
}

const COMPANY_WORD = String.raw`[A-Z][\w&'-]*`
const IS_HIRING_RE = new RegExp(String.raw`(${COMPANY_WORD}(?: ${COMPANY_WORD}){0,3})(?: \([^)]{1,30}\))? is (?:now |actively |urgently )?hiring`)
const AT_RE = new RegExp(String.raw`(?:\bat|@)\s+(${COMPANY_WORD}(?: ${COMPANY_WORD}){0,3})`)
const NOT_COMPANY = /^(?:we|who|everyone|linkedin|my|our|this|it|she|he|they|the team|hr)$/i

function companyFromPhrase(phrase: string | undefined): string | null {
  if (!phrase) return null
  const name = tidy(phrase)
  if (!name || NOT_COMPANY.test(name) || name.length > 60) return null
  // "at Dubai Internet City" is a place, not an employer.
  const loc = resolveLocation(name)
  if (loc.places.length > 0 && name.split(' ').length <= 3) return null
  return name
}

function domainOf(email: string): string | null {
  const d = email.split('@')[1]?.toLowerCase() ?? ''
  return d && !FREEMAIL_DOMAINS.has(d) ? d : null
}

function nameFromDomain(domain: string): string {
  const label = domain.split('.').slice(-2, -1)[0] ?? domain
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function guessCompany(text: string, headline: string | null, emails: readonly string[]): { company: string | null; companyDomain: string | null } {
  const companyDomain = emails.map(domainOf).find((d): d is string => d !== null) ?? null
  const company =
    companyFromPhrase(IS_HIRING_RE.exec(text)?.[1]) ??
    companyFromPhrase(headline ? AT_RE.exec(headline)?.[1] : undefined) ??
    companyFromPhrase(AT_RE.exec(text)?.[1]) ??
    (companyDomain ? nameFromDomain(companyDomain) : null)
  return { company, companyDomain }
}

export function extractPostFacts(text: string, opts: { headline?: string | null } = {}): PostFacts {
  const body = text.slice(0, 5_000)
  const contact = contactOf(body)
  const { location, regionIds } = guessLocation(body)
  return {
    role: guessRole(body),
    location,
    regionIds,
    remote: remoteOf(body),
    ...guessCompany(body, opts.headline ?? null, contact.emails),
    contact,
  }
}
