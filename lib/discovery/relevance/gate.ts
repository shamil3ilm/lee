import { ruleMode } from './discovery-prefs'
import { locationOutcome } from './location-rule'
import { emptyScan, GCC_CODES, mergeScans, scanPlaces, type PlaceScan } from './places'
import { targetFamilies, type SearchPrefs } from './prefs'
import { postingRegionIds } from './region-ids'
import { isWithin } from '@/lib/regions/tree'

/** Anywhere in a title, only GCC and Indian places count ("Laravel Developer Dubai"). */
const TARGET_ROOTS = ['gcc', 'in']
import { domainOutcome, type DomainOutcome } from './domain-rule'
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
 * (a named foreign place, a recognised other family, an unrelated field in
 * the JD). Missing or unrecognised information always passes; the domain
 * rule runs even before search preferences are saved.
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
  /** Region-taxonomy ids (deepest places + ancestors + remote scopes) for the hierarchical Region filter. */
  regionIds: string[]
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
  /** Family the JD reads as (domain rule), for learning on "Show anyway". */
  inferredFamily: string | null
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

export { acceptance, acceptedFor, firstForeign } from './location-rule'

/**
 * A recognised tech family outside the targets ("role: Frontend"). Never on
 * an unknown title or a non-tech posting (the domain rule judges those), and
 * never when the JD reads as a target family (the domain rule's
 * "new title" / "learned" label).
 */
function roleReason(
  prefs: SearchPrefs,
  title: string,
  families: string[],
  engineering: boolean,
  generic: boolean,
  domain: DomainOutcome,
): string | null {
  const targets = prefs.roleFamilies
  if (targets.length === 0 && prefs.customRoles.length === 0) return null
  const normTitle = normalizeForMatch(title)
  if (prefs.customRoles.some((r) => findTerms(normTitle, [r]).length > 0)) return null
  if (families.some((f) => targets.includes(f))) return null
  if (domain.family && targets.includes(domain.family) && domain.info) return null
  // A generic software title with no stack evidence gets the benefit of the
  // doubt when the user targets core development roles.
  const core = ['backend', 'fullstack', 'frontend']
  if (generic && families.length === 0 && targets.some((t) => core.includes(t))) return null
  if (!engineering || families.length === 0) return null
  return `role: ${roleFamilyLabel(families[0]!)}`
}

/**
 * Places a posting is located in: its location field, plus the title.
 * Anywhere in the title, only target regions count ("Laravel Developer
 * Dubai"); foreign and broad places only in the title's place segments,
 * so "Global Payments Engineer" is not read as "worldwide".
 */
export function postingPlaces(job: Pick<GateInput, 'title' | 'location'>): PlaceScan {
  const inTitle = scanPlaces(job.title)
  const targetNodes = [...inTitle.nodes].filter((id) => TARGET_ROOTS.some((root) => isWithin(id, root)))
  const titleTargets: PlaceScan = { ...emptyScan(), regions: inTitle.regions, nodes: new Set(targetNodes) }
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
  const regionIds = postingRegionIds({
    placeText: `${job.location ?? ''}\n${titlePlaceText(job.title)}`,
    description: job.descriptionMd,
    located,
    restricted,
    remote,
  })
  const domain = domainOutcome({
    title: job.title,
    description: job.descriptionMd,
    techStack: job.techStack,
    engineering: role.engineering,
    titleFamilies: classifyRole({ title: job.title }).families,
    mode: ruleMode(prefs.extra, 'domain'),
    targets: targetFamilies(prefs),
    readySkills: prefs.readySkills,
    learned: prefs.learnedTitles,
  })
  const base = {
    regions,
    regionIds,
    seniority,
    yearsRequired,
    families: role.families,
    engineering: role.engineering,
    remote,
    inferredFamily: domain.family,
  }
  const domainInfos = domain.info ? [domain.info] : []
  if (!prefs.active) {
    // Unsaved preferences: only the domain rule, on provisional targets.
    const penalties = domain.penalty ? [domain.penalty] : []
    return {
      pass: domain.hard === null,
      reasons: domain.hard ? [domain.hard] : [],
      penalties,
      boosts: [],
      infos: domainInfos,
      rankAdjust: rankAdjust({ penalties, boosts: [] }),
      ...base,
    }
  }

  const reasons: string[] = []
  if (domain.hard) reasons.push(domain.hard)
  const description = (job.descriptionMd ?? '').slice(0, DESCRIPTION_WINDOW)
  const haystack = normalizeForMatch([job.title, (job.techStack ?? []).join(' '), description].join(' \n '))
  const excluded = findTerms(haystack, prefs.exclude)
  if (excluded.length > 0) reasons.push(`excluded: ${excluded.slice(0, 2).join(', ')}`)
  const roleWhy = roleReason(prefs, job.title, role.families, role.engineering, role.generic, domain)
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
  const domainPenalty = domain.penalty ? [domain.penalty] : []
  const penalties = [...domainPenalty, ...(senior.penalty ? [senior.penalty.label] : []), ...(loc.penalty ? [loc.penalty] : []), ...soft.penalties]
  const boosts = [...(loc.boost ? [loc.boost] : []), ...soft.boosts]
  // Seniority carries its own weight (light / strong / offset); every other
  // chip counts through rankAdjust's per-chip points.
  const adjust =
    rankAdjust({ penalties: [...domainPenalty, ...(loc.penalty ? [loc.penalty] : []), ...soft.penalties], boosts }) +
    (senior.penalty?.points ?? 0)
  return {
    pass: reasons.length === 0,
    reasons,
    penalties,
    boosts,
    infos: [...domainInfos, ...soft.infos],
    rankAdjust: Math.max(-60, Math.min(20, adjust)),
    ...base,
  }
}

/** Stored reason text: up to three reasons joined with " · ". */
export function formatReasons(reasons: readonly string[]): string | null {
  return reasons.length > 0 ? reasons.slice(0, 3).join(' · ') : null
}
