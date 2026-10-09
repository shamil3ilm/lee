import { companyKey, LEGAL_SUFFIXES } from '@/lib/integrations/linkedin/company-key'
import { countryOf, isRegionId, withAncestors } from '@/lib/regions/tree'
import { mergeIndustries } from './industry'
import type { CompanyCandidate, CompanyEvidence, CompanyStage, SizeBand } from './types'

/**
 * Normalise and dedupe company candidates across sources. Two candidates
 * are the same company when their website domain matches, or — with no
 * domain on one side — when their names reduce to the same key in the
 * same country. Pure, client-safe.
 */

/** Hosts that are never a company's own site (profiles, link shorteners, stores). */
const NOT_COMPANY_HOSTS = /(^|\.)(linkedin\.com|facebook\.com|twitter\.com|x\.com|instagram\.com|github\.com|github\.io|medium\.com|wikipedia\.org|wikidata\.org|google\.com|apple\.com|play\.google\.com|bit\.ly|linktr\.ee|youtube\.com|t\.me|wa\.me|notion\.site|ycombinator\.com)$/

/** "https://www.Foo.com/en" → "foo.com"; null for non-company or malformed URLs. */
export function domainOf(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim()
  if (!raw) return null
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const host = u.hostname.toLowerCase().replace(/^www\d?\./, '').replace(/\.$/, '')
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null
    if (NOT_COMPANY_HOSTS.test(host)) return null
    return host
  } catch {
    return null
  }
}

/** A clean https homepage URL for a domain, keeping the given URL when it is the domain's own. */
export function websiteOf(url: string | null | undefined): string | null {
  const d = domainOf(url)
  if (!d) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url!.trim()) ? url!.trim() : `https://${url!.trim()}`)
    return `https://${u.hostname.toLowerCase()}`
  } catch {
    return `https://${d}`
  }
}

/** Employees → size band. */
export function sizeBandOf(employees: number | null | undefined): SizeBand | undefined {
  if (employees == null || !Number.isFinite(employees) || employees <= 0) return undefined
  if (employees <= 10) return '1-10'
  if (employees <= 50) return '11-50'
  if (employees <= 200) return '51-200'
  if (employees <= 1000) return '201-1000'
  return '1000+'
}

/**
 * Stage from what is known: size and age. Under 200 people and founded in
 * the last ten years → startup; under 1000 → scale-up; otherwise
 * enterprise. Unknown when neither is known.
 */
export function stageOf(input: { sizeBand?: SizeBand; founded?: number; yc?: boolean }, now: Date = new Date()): CompanyStage | undefined {
  const age = input.founded ? now.getUTCFullYear() - input.founded : null
  const band = input.sizeBand
  if (band === '1000+') return 'enterprise'
  if (band === '201-1000') return age !== null && age > 25 ? 'enterprise' : 'scaleup'
  if (band) return age !== null && age > 20 ? 'scaleup' : 'startup'
  if (input.yc) return 'startup'
  if (age === null) return undefined
  if (age <= 10) return 'startup'
  return age > 30 ? 'enterprise' : undefined
}

/** The key two candidates share when they are the same company. */
export function dedupeKey(c: Pick<CompanyCandidate, 'name' | 'website' | 'regionIds'>): string {
  const d = domainOf(c.website)
  if (d) return `d:${d}`
  return `n:${nameKey(c.name)}:${countryKey(c.regionIds)}`
}

/** The ISO-2 country of the first region id that has one, else "xx". */
export function countryKey(regionIds: readonly string[]): string {
  return regionIds.map((id) => countryOf(id)).find((x): x is string => !!x) ?? 'xx'
}

/** Indian "(P) Ltd" / "Pvt. Ltd." forms the shared company key keeps as a word. */
const INDIAN_PRIVATE = /\(\s*p\s*\)|\bpvt\b\.?|\bprivate\b/gi

/** Kuwaiti "K.S.C. (Closed)" / "K.S.C. (Holding)": the bracketed word is part of the legal form, not the brand. */
/** A Kuwaiti register's "…/With Limited Liability" (the W.L.L. form spelled out). */
const WITH_LIMITED_LIABILITY = /[/,(\s-]*\bwith limited liability\b\)?\s*$/i

const KSC_BRACKET = /\bk\.?\s?s\.?\s?c\.?\s*\(\s*(?:closed|holding|public)\s*\)/gi

/**
 * Legal forms beyond the shared company key's that GCC and Indian
 * registers append to a name: Kuwait S.A.K. / S.A.K.P. / S.A.K.C., Qatar
 * Q.S.C. / W.L.L., Saudi "Est." / "Establishment", the UAE free-zone forms
 * (FZ-LLC, FZE, FZCO, DMCC), Indian "Private Limited", "Co." / "Company".
 * Popped only from the END of a name and never the first word, so
 * "Company Builder Labs" stays whole.
 */
const EXTRA_LEGAL: ReadonlySet<string> = new Set([
  'sak', 'sakp', 'sakc', 'saq', 'saqc', 'wll', 'est', 'establishment', 'co', 'company', 'cos', 'ltd', 'limited', 'llc', 'fz', 'fze',
  'fzco', 'fzc', 'fzllc', 'dmcc', 'spc', 'saog', 'saoc', 'pjsc', 'psc', 'ksc', 'kscc', 'kscp', 'kpsc', 'bsc', 'qsc', 'qpsc', 'jsc',
])

function isLegal(word: string): boolean {
  return LEGAL_SUFFIXES.has(word) || EXTRA_LEGAL.has(word)
}

/** The name's words with every trailing legal form dropped ("Alghanim Industries W.L.L." → alghanim, industries). */
function legalStrippedWords(name: string): string[] {
  const words = companyKey(name.replace(KSC_BRACKET, ' KSC ').replace(WITH_LIMITED_LIABILITY, ' ').replace(INDIAN_PRIVATE, ' ')).split(' ').filter(Boolean)
  while (words.length > 1 && isLegal(words[words.length - 1]!)) words.pop()
  return words
}

/** Name reduced for matching: legal suffixes dropped, spaces removed ("Dinar Pay K.S.C." = "dinarpay", "QBurst Technologies (P) Ltd" = "qbursttechnologies"). */
export function nameKey(name: string): string {
  return legalStrippedWords(name).join('').slice(0, 120)
}

/** Generic trailing words park and chamber lists add to a brand ("Fingent Global Solutions"). */
const GENERIC_TAIL = new Set([
  'technologies', 'technology', 'tech', 'solutions', 'solution', 'systems', 'software', 'services', 'service', 'labs', 'lab',
  'india', 'global', 'consulting', 'consultancy', 'infotech', 'infosystems', 'innovations', 'ventures', 'group', 'holding', 'holdings',
  'engineering', 'international', 'digital', 'it', 'and', 'business', 'enterprises', 'networks', 'industries', 'trading',
  // A country after the brand in a GCC legal name ("Zain Kuwait K.S.C.P.", "National Bank of Kuwait").
  'kuwait', 'qatar', 'bahrain', 'oman', 'ksa', 'uae', 'saudi', 'arabia', 'emirates', 'of',
])

/**
 * The brand a name reduces to once legal forms and generic tail words go
 * ("QBurst Technologies (P) Ltd" = "qburst", "National Bank of Kuwait
 * S.A.K.P." = "National Bank of Kuwait" = "nationalbank", "Zain Kuwait
 * K.S.C.P." = "Zain" = "zain"). Used only to join a name-only listing (a
 * register's legal name) to a company already known by its website, in the
 * same country, or to a seed alias — never to merge two companies that
 * both have a website. Keeps at least one word.
 */
export function brandKey(name: string): string {
  const words = legalStrippedWords(name)
  while (words.length > 1 && (GENERIC_TAIL.has(words[words.length - 1]!) || isLegal(words[words.length - 1]!))) words.pop()
  return words.join('').slice(0, 120)
}

/** Sources whose names are legal names (registers) or map labels, where a brand may be followed by a descriptor. */
export function isLegalNameSource(sourceTags: readonly string[]): boolean {
  return sourceTags.some((t) => t.startsWith('register:') || t.startsWith('map:'))
}

/**
 * A register's legal name that STARTS with a known brand ("Agility Public
 * Warehousing Company K.S.C.P." → the brand "agility"): the one known brand
 * key (5+ characters, a whole-word prefix) that begins the legal name.
 * Null when none, or more than one, fits.
 */
export function brandPrefixOf(legalName: string, knownBrandKeys: Iterable<string>): string | null {
  const words = legalStrippedWords(legalName)
  const prefixes = new Set(words.slice(0, -1).map((_, i) => words.slice(0, i + 1).join('')))
  let hit: string | null = null
  for (const k of knownBrandKeys) {
    if (k.length < 5 || !prefixes.has(k)) continue
    if (hit !== null && hit !== k) return null
    hit = k
  }
  return hit
}

function uniq<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)]
}

function mergeEvidence(a: CompanyEvidence, b: CompanyEvidence): CompanyEvidence {
  const out: CompanyEvidence = { ...b, ...a }
  const langs = uniq([...(a.languages ?? []), ...(b.languages ?? [])])
  if (langs.length > 0) out.languages = langs.slice(0, 6)
  const emails = uniq([...(a.contactEmails ?? []), ...(b.contactEmails ?? [])])
  if (emails.length > 0) out.contactEmails = emails.slice(0, 3)
  return out
}

/** Most specific region ids only (a place drops its ancestors when a child is known). */
export function deepestRegions(ids: readonly string[]): string[] {
  const known = uniq(ids.filter(isRegionId))
  const withAnc = new Set(known.flatMap((id) => withAncestors([id]).filter((a) => a !== id)))
  return known.filter((id) => !withAnc.has(id))
}

/** Merge two candidates for the same company: first wins on scalars, lists are unioned. */
export function mergeCandidate(a: CompanyCandidate, b: CompanyCandidate): CompanyCandidate {
  return {
    name: a.name.length >= 2 ? a.name : b.name,
    website: a.website ?? b.website,
    regionIds: deepestRegions([...a.regionIds, ...b.regionIds]),
    industries: mergeIndustries(a.industries, b.industries),
    sizeBand: a.sizeBand ?? b.sizeBand,
    stage: a.stage ?? b.stage,
    sourceTags: uniq([...a.sourceTags, ...b.sourceTags]),
    evidence: mergeEvidence(a.evidence, b.evidence),
    ...(a.board ?? b.board ? { board: a.board ?? b.board } : {}),
  }
}

/**
 * A register's legal name → the one known company (by website, same
 * country) whose brand begins it: "Agility Public Warehousing Company
 * K.S.C.P." joins agility.com's "Agility". `byBrand` maps
 * "brand:country" to keys; only unique brands count.
 */
export function legalPrefixTarget(c: Pick<CompanyCandidate, 'name' | 'regionIds' | 'sourceTags'>, byBrand: ReadonlyMap<string, readonly string[]>): string | undefined {
  if (!isLegalNameSource(c.sourceTags)) return undefined
  const country = countryKey(c.regionIds)
  const suffix = `:${country}`
  const brands = [...byBrand.entries()].filter(([k, v]) => k.endsWith(suffix) && v.length === 1).map(([k]) => k.slice(0, -suffix.length))
  const hit = brandPrefixOf(c.name, brands)
  return hit ? byBrand.get(`${hit}${suffix}`)?.[0] : undefined
}

/** Trim names, drop empties, attach clean websites, and dedupe by `dedupeKey`. */
export function normalizeCandidates(list: readonly CompanyCandidate[]): Map<string, CompanyCandidate> {
  const out = new Map<string, CompanyCandidate>()
  for (const raw of list) {
    const name = raw.name.replace(/\s+/g, ' ').trim().slice(0, 200)
    if (name.length < 2 || !companyKey(name)) continue
    const c: CompanyCandidate = {
      ...raw,
      name,
      website: websiteOf(raw.website) ?? undefined,
      regionIds: deepestRegions(raw.regionIds),
    }
    const key = dedupeKey(c)
    const prev = out.get(key)
    out.set(key, prev ? mergeCandidate(prev, c) : c)
  }
  // A name-only candidate joins the domain candidate with the same name in the
  // same country — or, when it has no place at all (a LinkedIn company), the
  // only domain candidate with that name.
  const byName = new Map<string, string>()
  const byBrand = new Map<string, string[]>()
  const byBareName = new Map<string, string[]>()
  for (const [key, c] of out) {
    if (!key.startsWith('d:')) continue
    byName.set(dedupeKey({ ...c, website: undefined }), key)
    const brand = `${brandKey(c.name)}:${countryKey(c.regionIds)}`
    byBrand.set(brand, [...(byBrand.get(brand) ?? []), key])
    const bare = nameKey(c.name)
    byBareName.set(bare, [...(byBareName.get(bare) ?? []), key])
  }
  for (const [key, c] of [...out]) {
    if (!key.startsWith('n:')) continue
    const placeless = key.endsWith(':xx')
    const bare = byBareName.get(nameKey(c.name)) ?? []
    const brand = byBrand.get(`${brandKey(c.name)}:${countryKey(c.regionIds)}`) ?? []
    const target =
      byName.get(key) ??
      (brand.length === 1 ? brand[0] : undefined) ??
      (placeless && bare.length === 1 ? bare[0] : undefined) ??
      legalPrefixTarget(c, byBrand)
    if (target) {
      out.set(target, mergeCandidate(out.get(target)!, c))
      out.delete(key)
    }
  }
  return out
}
