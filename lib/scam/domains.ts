import { domainToUnicode } from 'node:url'

/**
 * v17 §1 — domain helpers for the sender/domain signals: host extraction,
 * registrable domain (eTLD+1, small built-in suffix list), free-mail and
 * job-platform lists, a small map of well-known employers, and lookalike
 * detection (homoglyphs + edit distance + brand-in-label + TLD swap).
 */

const MULTI_PART_SUFFIXES = new Set([
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in', 'ac.in', 'edu.in', 'gov.in',
  'co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'co.nz', 'co.za',
  'co.ae', 'net.ae', 'org.ae', 'gov.ae', 'ac.ae', 'com.sa', 'net.sa', 'org.sa',
  'com.qa', 'com.kw', 'com.bh', 'com.om', 'co.om', 'com.sg', 'com.my', 'com.pk',
  'com.ng', 'com.eg', 'com.br', 'co.jp', 'com.cn',
])

export const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com',
  'rocketmail.com', 'outlook.com', 'outlook.in', 'hotmail.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mail.com', 'gmx.com', 'gmx.net', 'proton.me',
  'protonmail.com', 'yandex.com', 'yandex.ru', 'rediffmail.com', 'zohomail.in',
  'tutanota.com', 'inbox.com',
])

/** ATS and job boards: an apply link here says nothing about the employer. */
const JOB_PLATFORM_DOMAINS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'myworkdayjobs.com',
  'workday.com', 'smartrecruiters.com', 'icims.com', 'taleo.net', 'successfactors.com',
  'successfactors.eu', 'jobvite.com', 'bamboohr.com', 'breezy.hr', 'recruitee.com',
  'teamtailor.com', 'personio.de', 'personio.com', 'jazzhr.com', 'applytojob.com',
  'freshteam.com', 'zohorecruit.com', 'zohorecruit.in', 'keka.com', 'darwinbox.in',
  'oraclecloud.com', 'dover.com', 'rippling.com', 'pinpointhq.com', 'comeet.com',
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'naukri.com', 'foundit.in',
  'monsterindia.com', 'shine.com', 'timesjobs.com', 'instahyre.com', 'cutshort.io',
  'hirist.tech', 'iimjobs.com', 'wellfound.com', 'angel.co', 'ycombinator.com',
  'workatastartup.com', 'remoteok.com', 'weworkremotely.com', 'bayt.com',
  'naukrigulf.com', 'gulftalent.com', 'dubizzle.com', 'otta.com', 'welcometothejungle.com',
  'builtin.com', 'dice.com', 'ziprecruiter.com', 'simplyhired.com', 'hackernews.com',
  'news.ycombinator.com', 'github.com', 'google.com',
]

export const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 'cutt.ly', 'rb.gy', 't.ly', 'shorturl.at', 'is.gd', 'ow.ly',
  'rebrand.ly', 'tiny.cc', 'shorte.st', 'goo.gl',
])

export const MESSAGING_HOSTS = new Set([
  't.me', 'telegram.me', 'telegram.dog', 'wa.me', 'chat.whatsapp.com', 'api.whatsapp.com',
])

export interface KnownCompany {
  /** Lower-case name variants, matched as whole leading words. */
  names: string[]
  domains: string[]
}

export const KNOWN_COMPANIES: readonly KnownCompany[] = [
  { names: ['amazon', 'amazon web services', 'aws'], domains: ['amazon.com', 'amazon.jobs', 'amazon.in', 'amazon.ae', 'amazon.sa', 'aws.amazon.com'] },
  { names: ['google', 'alphabet'], domains: ['google.com', 'careers.google.com', 'google.co.in', 'alphabet.com'] },
  { names: ['microsoft'], domains: ['microsoft.com', 'careers.microsoft.com'] },
  { names: ['meta', 'facebook'], domains: ['meta.com', 'metacareers.com', 'facebook.com', 'fb.com'] },
  { names: ['apple'], domains: ['apple.com'] },
  { names: ['netflix'], domains: ['netflix.com', 'netflix.net'] },
  { names: ['ibm'], domains: ['ibm.com'] },
  { names: ['oracle'], domains: ['oracle.com'] },
  { names: ['tata consultancy services', 'tcs'], domains: ['tcs.com'] },
  { names: ['infosys'], domains: ['infosys.com'] },
  { names: ['wipro'], domains: ['wipro.com'] },
  { names: ['hcl', 'hcltech', 'hcl technologies'], domains: ['hcltech.com', 'hcl.com'] },
  { names: ['tech mahindra'], domains: ['techmahindra.com'] },
  { names: ['cognizant'], domains: ['cognizant.com'] },
  { names: ['accenture'], domains: ['accenture.com'] },
  { names: ['capgemini'], domains: ['capgemini.com'] },
  { names: ['deloitte'], domains: ['deloitte.com'] },
  { names: ['flipkart'], domains: ['flipkart.com', 'flipkartcareers.com'] },
  { names: ['reliance', 'reliance industries', 'jio', 'reliance jio'], domains: ['ril.com', 'jio.com', 'relianceretail.com'] },
  { names: ['paytm'], domains: ['paytm.com'] },
  { names: ['swiggy'], domains: ['swiggy.com', 'swiggy.in'] },
  { names: ['zomato'], domains: ['zomato.com'] },
  { names: ['airtel', 'bharti airtel'], domains: ['airtel.com', 'airtel.in'] },
  { names: ['hdfc bank', 'hdfc'], domains: ['hdfcbank.com', 'hdfc.com'] },
  { names: ['icici bank', 'icici'], domains: ['icicibank.com', 'icici.com'] },
  { names: ['hsbc'], domains: ['hsbc.com', 'hsbc.co.in', 'hsbc.ae'] },
  { names: ['emirates', 'emirates group', 'emirates airline'], domains: ['emirates.com', 'emiratesgroupcareers.com'] },
  { names: ['etihad', 'etihad airways'], domains: ['etihad.com'] },
  { names: ['qatar airways'], domains: ['qatarairways.com'] },
  { names: ['adnoc'], domains: ['adnoc.ae'] },
  { names: ['saudi aramco', 'aramco'], domains: ['aramco.com'] },
  { names: ['emaar', 'emaar properties'], domains: ['emaar.com'] },
  { names: ['noon'], domains: ['noon.com'] },
  { names: ['careem'], domains: ['careem.com'] },
  { names: ['dhl'], domains: ['dhl.com'] },
  { names: ['fedex'], domains: ['fedex.com'] },
  { names: ['walmart'], domains: ['walmart.com', 'walmartcareers.com'] },
  { names: ['coca-cola', 'coca cola'], domains: ['coca-cola.com', 'coca-colacompany.com'] },
  { names: ['nestle', 'nestlé'], domains: ['nestle.com', 'nestle.in'] },
  { names: ['unilever', 'hindustan unilever'], domains: ['unilever.com', 'hul.co.in'] },
  { names: ['marriott'], domains: ['marriott.com'] },
  { names: ['hilton'], domains: ['hilton.com', 'jobs.hilton.com'] },
]

const COMPANY_SUFFIX =
  /\b(pvt\.?|private|ltd\.?|limited|inc\.?|llc|l\.l\.c\.?|plc|corp\.?|corporation|co\.?|fze|fzco|fz-llc|gmbh)\b/g

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKC')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/[^\p{L}\p{N}& -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The well-known employer a company name claims to be, if any. */
export function findKnownCompany(companyName: string): KnownCompany | null {
  const n = normalizeCompanyName(companyName)
  if (!n) return null
  for (const c of KNOWN_COMPANIES) {
    for (const name of c.names) {
      if (n === name || n.startsWith(`${name} `)) return c
    }
  }
  return null
}

/**
 * Host from a URL, bare host, or email. Keeps Unicode (so homoglyphs stay
 * visible), lower-cases, strips `www.`. Returns null for junk.
 */
export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null
  let v = value.trim()
  if (!v) return null
  const at = v.lastIndexOf('@')
  if (at >= 0 && !v.includes('://')) v = v.slice(at + 1)
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(v)
  let host = m ? m[1]! : v.split(/[/?#]/)[0]!
  host = host.replace(/^[^@]*@/, '').replace(/:\d+$/, '').replace(/\.$/, '').toLowerCase()
  if (host.includes('xn--')) host = domainToUnicode(host) || host
  if (host.startsWith('www.')) host = host.slice(4)
  if (!/^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u.test(host)) return null
  return host
}

export function registrableDomain(host: string): string {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const lastTwo = parts.slice(-2).join('.')
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join('.')
  return lastTwo
}

/** The registrable domain minus its public suffix: "amazon" for amazon.co.in. */
export function brandLabel(host: string): string {
  const reg = registrableDomain(host)
  const parts = reg.split('.')
  const lastTwo = parts.slice(-2).join('.')
  const suffixParts = MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3 ? 2 : 1
  return parts.slice(0, parts.length - suffixParts).join('.')
}

function matchesSuffix(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

export function isFreemail(host: string): boolean {
  return FREEMAIL_DOMAINS.has(host)
}

export function isJobPlatform(host: string): boolean {
  return JOB_PLATFORM_DOMAINS.some((d) => matchesSuffix(host, d))
}

export function isSameSite(host: string, domain: string): boolean {
  return registrableDomain(host) === registrableDomain(domain)
}

// ---------------------------------------------------------------------------
// Lookalike detection
// ---------------------------------------------------------------------------

const HOMOGLYPHS: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ԁ: 'd',
  ɡ: 'g', ո: 'n', ѕ: 's', ԛ: 'q', ԝ: 'w', ν: 'v', ο: 'o', α: 'a', ι: 'i', κ: 'k',
  τ: 't', ρ: 'p', μ: 'u', ı: 'i', ł: 'l', ß: 'ss', 0: 'o', 1: 'l', 3: 'e', 5: 's',
  $: 's', '@': 'a',
}

/** Visual skeleton used to compare labels: "аmаzоn" and "arnazon" → "amazon". */
export function skeleton(label: string): string {
  const mapped = [...label.normalize('NFKC').toLowerCase()]
    .map((c) => HOMOGLYPHS[c] ?? c)
    .join('')
  return mapped
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/cl/g, 'd')
    .replace(/i/g, 'l')
    .replace(/[-_.]/g, '')
}

/**
 * Edit distance with adjacent transpositions counted as one edit (optimal
 * string alignment), so "stirpe" is one edit from "stripe".
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1)
      }
      d[i]![j] = v
    }
  }
  return d[a.length]![b.length]!
}

export type LookalikeKind = 'homoglyph' | 'edit_distance' | 'brand_in_label' | 'tld_swap'

export interface LookalikeHit {
  kind: LookalikeKind
  legit: string
}

const FILLER_TOKENS = new Set([
  'careers', 'career', 'jobs', 'job', 'hr', 'recruit', 'recruitment', 'recruiting',
  'hiring', 'hire', 'india', 'global', 'official', 'work', 'apply', 'team', 'talent',
  'group', 'intl', 'online', 'portal', 'in', 'uae', 'gulf', 'me', 'services',
])

/**
 * Is `host` a lookalike of any of `legitDomains`? Same-site hosts (incl.
 * subdomains) never are. TLD-only swaps are reported as `tld_swap` so the
 * caller can decide how much that matters.
 */
export function detectLookalike(host: string, legitDomains: readonly string[]): LookalikeHit | null {
  for (const legit of legitDomains) {
    if (isSameSite(host, legit) || matchesSuffix(host, legit)) return null
  }
  const obsLabel = brandLabel(host)
  for (const legit of legitDomains) {
    const legitLabel = brandLabel(legit)
    if (!legitLabel || !obsLabel) continue
    if (obsLabel === legitLabel) return { kind: 'tld_swap', legit }
    const so = skeleton(obsLabel)
    const sl = skeleton(legitLabel)
    if (so === sl) return { kind: 'homoglyph', legit }
    const maxEdits = sl.length >= 9 ? 2 : 1
    if (sl.length >= 5 && editDistance(so, sl) <= maxEdits) return { kind: 'edit_distance', legit }
    const tokens = obsLabel.split(/[-_.\d]+/).filter(Boolean)
    if (tokens.length > 1 && tokens.includes(legitLabel)) {
      const rest = tokens.filter((t) => t !== legitLabel)
      if (rest.every((t) => FILLER_TOKENS.has(t))) return { kind: 'brand_in_label', legit }
    }
    if (legitLabel.length >= 5 && obsLabel !== legitLabel && so.startsWith(sl)) {
      const tail = obsLabel.slice(legitLabel.length).replace(/^[-_]/, '')
      if (FILLER_TOKENS.has(tail)) return { kind: 'brand_in_label', legit }
    }
  }
  return null
}
