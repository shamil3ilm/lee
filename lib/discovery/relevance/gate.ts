import { ruleMode } from './discovery-prefs'
import { locationOutcome } from './location-rule'
import { emptyScan, GCC_CODES, mergeScans, scanPlaces, type PlaceScan } from './places'
import type { SearchPrefs } from './prefs'
import { classifyRole, roleFamilyLabel } from './roles'
import { detectSeniority, detectYearsRequired, type SeniorityLevel } from './seniority'
import { isArchitectTitle, seniorityOutcome } from './seniority-rule'
import { applySoftRules, rankAdjust } from './soft-rules'
import { findTerms, normalizeForMatch } from './text'
import { strengthIn } from '../match/strengths'

/**
 * The deterministic relevance gate. Runs before AI scoring on every
 * ingested posting (and again when preferences change): a posting that
 * fails gets status 'filtered' with human-readable reasons, e.g.
 * "seniority: Director", "location: US-only", "role: not engineering".
 *
 * Asymmetric by design: the gate drops a posting only on positive evidence
 * (a senior title, a named foreign place, a non-engineering title). Missing
 * or unrecognised information always passes.
 */

export interface GateInput {
  title: string
  location?: string | null
  remoteType?: string | null
  descriptionMd?: string | null
  techStack?: readonly string[] | null
  employmentType?: string | null
  salary?: { min?: number; max?: number; currency?: string } | null
}

export type RegionTag = 'ae' | 'gcc' | 'in' | 'remote'
export const REGION_TAGS: readonly RegionTag[] = ['ae', 'gcc', 'in', 'remote']

export interface GateResult {
  pass: boolean
  reasons: string[]
  /** Region tags for the Discovery "Region" filter (computed even when inactive). */
  regions: RegionTag[]
  seniority: SeniorityLevel | null
  /** Smallest years-of-experience requirement in the description, if any. */
  yearsRequired: number | null
  families: string[]
  engineering: boolean
  remote: boolean
  /** Soft-rule outcomes: shown as chips, never hidden. */
  penalties: string[]
  boosts: string[]
  /** Neutral facts (stated pay, "needs presence in UAE"). */
  infos: string[]
  /** Ranking nudge from penalties and boosts. */
  rankAdjust: number
}

/** Description window scanned for remote-eligibility phrases and keywords. */
const DESCRIPTION_WINDOW = 8_000

const REMOTE_WORDS =
  /\b(?:remote|remotely|remoto|remota|remote-first|fully distributed|distributed team|work from home|wfh|telecommute|t[eé]l[eé]travail|home[\s-]?based|anywhere)\b/

/**
 * Phrases that restrict WHERE a remote hire may live. The captured place
 * text is scanned with the place lists, so "must be based in India" helps
 * and "must reside in the US" restricts.
 */
const RESTRICTION_PATTERNS: readonly RegExp[] = [
  /\bmust (?:be )?(?:located|based|residing|living|reside|live|resident)\s+(?:in|within)\s+(?:the\s+)?([^.;:\n]{2,60})/g,
  /\b(?:only|exclusively)\s+(?:open|available|hiring)\s+(?:to\s+)?(?:candidates|applicants|people|residents)?\s*(?:who are\s+)?(?:based|located|residing|living)?\s*(?:in|within|from)\s+(?:the\s+)?([^.;:\n]{2,60})/g,
  /\b(?:authori[sz]ed|eligible|legally able|permitted)\s+to\s+work\s+in\s+(?:the\s+)?([^.;:\n]{2,40})/g,
  /\bremote\s*(?:\(|-|,|:)?\s*(?:with)?in\s+(?:the\s+)?([^.;:\n]{2,40})/g,
  /\b(?:residents|citizens)\s+of\s+(?:the\s+)?([^.;:\n]{2,40})\s+only\b/g,
  /\b(us|u\.s\.|usa|uk|eu|canada|latam|north america|europe|india|uae|gcc)[\s-]+(?:only|based only)\b/g,
  /\b(us|u\.s\.|american|uk|canadian|eu) (?:citizens?|citizenship|residents?|persons?) (?:only|required)\b/g,
  /\b(?:security clearance|clearance required)\b()/g,
  /\bright to work in\s+(?:the\s+)?([^.;:\n]{2,40})/g,
  /\b(uk|us|eu|canadian|australian) (?:right to work|work authori[sz]ation|work permit) (?:is )?(?:required|only|needed)\b/g,
]

/** Places named by remote-eligibility phrases in the description. */
export function scanRestrictions(description: string | null | undefined): PlaceScan {
  const text = normalizeForMatch((description ?? '').slice(0, DESCRIPTION_WINDOW))
  let scan = emptyScan()
  for (const re of RESTRICTION_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const captured = m[1] ?? ''
      if (captured === '' && /clearance/.test(m[0])) {
        scan.foreign.add('US')
        continue
      }
      scan = mergeScans(scan, scanPlaces(expandCodes(captured)))
    }
  }
  return scan
}

/** Lower-case codes in a captured phrase → names the place lists know. */
function expandCodes(phrase: string): string {
  return phrase
    .replace(/\bu\.s\.a?\.?|\bus\b|\bamerican\b/g, 'usa')
    .replace(/\buk\b/g, 'united kingdom')
    .replace(/\beu\b/g, 'europe')
    .replace(/\bcanadian\b/g, 'canada')
    .replace(/\baustralian\b/g, 'australia')
    .replace(/\buae\b/g, 'united arab emirates')
}

/** Title segments that usually hold a place: "(Remote, US)", "- Dubai", "| Pune". */
function titlePlaceText(title: string): string {
  const parts = title.split(/\s[-–|@]\s|[()[\]]|,/).slice(1)
  return parts.join(' , ')
}

export function isRemotePosting(job: GateInput): boolean {
  if (job.remoteType === 'remote') return true
  const text = normalizeForMatch(`${job.location ?? ''} ${job.title}`)
  return REMOTE_WORDS.test(text)
}

function regionTags(places: PlaceScan, remote: boolean): RegionTag[] {
  const tags: RegionTag[] = []
  if (places.regions.has('AE')) tags.push('ae')
  if (GCC_CODES.some((c) => places.regions.has(c))) tags.push('gcc')
  if (places.regions.has('IN')) tags.push('in')
  if (remote) tags.push('remote')
  return tags
}

export { acceptedCodes, firstForeign, hitsAccepted } from './location-rule'

function roleReason(prefs: SearchPrefs, title: string, families: string[], engineering: boolean, generic: boolean): string | null {
  const targets = prefs.roleFamilies
  if (targets.length === 0 && prefs.customRoles.length === 0) return null
  const normTitle = normalizeForMatch(title)
  if (prefs.customRoles.some((r) => findTerms(normTitle, [r]).length > 0)) return null
  if (families.some((f) => targets.includes(f))) return null
  // A generic software title with no stack evidence gets the benefit of the
  // doubt when the user targets core development roles.
  const core = ['backend', 'fullstack', 'frontend']
  if (generic && families.length === 0 && targets.some((t) => core.includes(t))) return null
  if (!engineering) return 'role: not engineering'
  if (families.length === 0) return 'role: not a target role'
  return `role: ${roleFamilyLabel(families[0]!)}`
}

/**
 * Places a posting is located in: its location field, plus the title.
 * Anywhere in the title, only target regions count ("Laravel Developer
 * Dubai"); foreign and broad places only in the title's place segments,
 * so "Global Payments Engineer" is not read as "worldwide".
 */
export function postingPlaces(job: Pick<GateInput, 'title' | 'location'>): PlaceScan {
  const titleTargets: PlaceScan = { ...emptyScan(), regions: scanPlaces(job.title).regions }
  return mergeScans(
    scanPlaces(job.location, { trustCodes: true }),
    mergeScans(titleTargets, scanPlaces(titlePlaceText(job.title), { trustCodes: true })),
  )
}

export function evaluateRelevance(job: GateInput, prefs: SearchPrefs): GateResult {
  const remote = isRemotePosting(job)
  const located = postingPlaces(job)
  const restricted = remote ? scanRestrictions(job.descriptionMd) : emptyScan()
  const role = classifyRole({ title: job.title, description: job.descriptionMd, techStack: job.techStack })
  const seniority = detectSeniority(job.title)
  const yearsRequired = detectYearsRequired(job.descriptionMd)
  const regions = regionTags(mergeScans(located, restricted), remote)
  const base = { regions, seniority, yearsRequired, families: role.families, engineering: role.engineering, remote }
  if (!prefs.active) return { pass: true, reasons: [], penalties: [], boosts: [], infos: [], rankAdjust: 0, ...base }

  const reasons: string[] = []
  const description = (job.descriptionMd ?? '').slice(0, DESCRIPTION_WINDOW)
  const haystack = normalizeForMatch([job.title, (job.techStack ?? []).join(' '), description].join(' \n '))
  const excluded = findTerms(haystack, prefs.exclude)
  if (excluded.length > 0) reasons.push(`excluded: ${excluded.slice(0, 2).join(', ')}`)
  const roleWhy = roleReason(prefs, job.title, role.families, role.engineering, role.generic)
  if (roleWhy) reasons.push(roleWhy)
  const senior = seniorityOutcome({
    mode: ruleMode(prefs.extra, 'seniority'),
    selected: prefs.seniority,
    title: seniority,
    years: yearsRequired,
    architect: isArchitectTitle(normalizeForMatch(job.title)),
    strength: strengthIn(`${job.title}\n${(job.techStack ?? []).join(' ')}\n${description}`, prefs.strengths),
  })
  if (senior.hard) reasons.push(senior.hard)
  const loc = locationOutcome(prefs, {
    located,
    restricted,
    remote,
    text: `${job.location ?? ''}\n${description}`,
    description: job.descriptionMd,
  })
  if (loc.reason) reasons.push(loc.reason)
  if (prefs.include.length > 0 && findTerms(haystack, prefs.include).length === 0) {
    reasons.push(`keywords: none of ${prefs.include.slice(0, 3).join(', ')}`)
  }
  const soft = applySoftRules(
    {
      title: job.title,
      description: job.descriptionMd ?? '',
      employmentType: job.employmentType,
      salary: job.salary,
      regions: located.regions,
      remote,
      families: role.families,
    },
    prefs,
  )
  reasons.push(...soft.hard)
  const penalties = [...(senior.penalty ? [senior.penalty.label] : []), ...(loc.penalty ? [loc.penalty] : []), ...soft.penalties]
  const boosts = [...(loc.boost ? [loc.boost] : []), ...soft.boosts]
  // Seniority carries its own weight (light / strong / offset); every other
  // chip counts through rankAdjust's per-chip points.
  const adjust = rankAdjust({ penalties: [...(loc.penalty ? [loc.penalty] : []), ...soft.penalties], boosts }) + (senior.penalty?.points ?? 0)
  return {
    pass: reasons.length === 0,
    reasons,
    penalties,
    boosts,
    infos: soft.infos,
    rankAdjust: Math.max(-60, Math.min(20, adjust)),
    ...base,
  }
}

/** Stored reason text: up to three reasons joined with " · ". */
export function formatReasons(reasons: readonly string[]): string | null {
  return reasons.length > 0 ? reasons.slice(0, 3).join(' · ') : null
}
