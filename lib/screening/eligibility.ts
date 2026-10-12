import { isRemotePosting, postingPlaces } from '@/lib/discovery/relevance/gate'
import { GCC_CODES, regionLabel, type RegionCode } from '@/lib/discovery/relevance/places'
import { detectNationalsOnly, detectNationalsPreferred, detectVisaOffered } from '@/lib/discovery/relevance/signals'
import { NOTICE_LABELS, type NoticePeriod } from '@/lib/discovery/relevance/discovery-prefs'
import { regionFit } from '@/lib/discovery/match/region'
import { languageComponent } from '@/lib/discovery/match/signals'
import { normalizeForMatch } from '@/lib/discovery/relevance/text'
import {
  DEGREE_RANK,
  detectAttestation,
  detectDegreeMandatory,
  detectNoticeAsk,
  detectPresenceAsk,
  highestCredential,
  isEngineerTitle,
} from './detectors'
import { professionBan } from './profession-bans'
import type { ScreenContext } from './input'
import { STATUS_SCORE, stageStatus } from './stage'
import type { StageCheck, StageResult } from './types'

/**
 * Stage (a): the knockout questions an ATS asks before a human reads
 * anything. Each check is pass / unknown / at risk / fail; only checks the
 * posting gives a reason for are listed (an ad that says nothing about
 * notice has no notice check). Existing detectors are reused as they are:
 * the location rule (Match region component), nationals-only/preferred,
 * visa offered and languages.
 */

const NOTICE_DAYS: Readonly<Record<NoticePeriod, number>> = {
  immediate: 0,
  '2_weeks': 14,
  '1_month': 30,
  '2_months': 60,
  '3_months': 90,
}

const NATIONALITY: Readonly<Partial<Record<RegionCode, RegExp>>> = {
  AE: /\b(?:uae|emirati|united arab emirates)\b/,
  SA: /\bsaudi\b/,
  QA: /\bqatar(?:i)?\b/,
  KW: /\bkuwait(?:i)?\b/,
  BH: /\bbahrain(?:i)?\b/,
  OM: /\boman(?:i)?\b/,
}

/** True when the résumé says the user is a national of `code` (unknown nationality → false). */
function isNational(ctx: ScreenContext, code: RegionCode): boolean {
  const n = normalizeForMatch(ctx.resume?.basics.nationality ?? '')
  const re = NATIONALITY[code]
  return Boolean(n && re?.test(n))
}

/** The Match Score's eligibility ceiling reason ("Not eligible: …"), stored or recomputed (same text). */
export function ineligibleReason(ctx: Pick<ScreenContext, 'job' | 'profile' | 'detail'>): string | null {
  const stored = ctx.detail?.ceiling?.reason
  if (stored?.startsWith(INELIGIBLE_PREFIX)) return stored
  const why = regionFit(ctx.job, ctx.profile).ineligible
  return why ? `${INELIGIBLE_PREFIX}${why}` : null
}

const INELIGIBLE_PREFIX = 'Not eligible: '

function locationCheck(ctx: ScreenContext): StageCheck {
  const ineligible = ineligibleReason(ctx)
  if (ineligible) return { key: 'location', status: 'fail', reason: ineligible, short: 'not eligible' }
  const c = regionFit(ctx.job, ctx.profile).component
  const label = c.label.replace(/^Region: /, '')
  // Outside your regions but not a knockout (a preference, not an eligibility rule).
  if (c.points === 0) return { key: 'location', status: 'at_risk', reason: c.label, short: 'outside your regions' }
  if (/eligibility unclear/.test(c.label)) {
    return { key: 'location', status: 'at_risk', reason: 'Remote, but who may apply is unclear', short: 'remote eligibility', action: { kind: 'ask', label: 'Ask which countries the remote role can hire from' } }
  }
  if (/location not stated/.test(c.label)) {
    return { key: 'location', status: 'unknown', reason: 'Location not stated', short: 'location', action: { kind: 'ask', label: 'Ask where the role is based' } }
  }
  return { key: 'location', status: 'pass', reason: label }
}

/** GCC countries of an on-site posting where the user needs an employer visa. */
function sponsorshipNeeds(ctx: ScreenContext): RegionCode[] {
  if (isRemotePosting(ctx.job)) return []
  const { sponsorshipFor, basedIn } = ctx.profile.extra
  return [...postingPlaces(ctx.job).regions].filter((r) => GCC_CODES.includes(r) && sponsorshipFor.includes(r) && r !== basedIn)
}

/** Nationals-only applies to anyone who is not a national of the posting's GCC country (sponsored or not). */
function nationalsCheck(ctx: ScreenContext): StageCheck | null {
  const description = ctx.job.descriptionMd ?? ''
  const gcc = [...postingPlaces(ctx.job).regions].filter((r) => GCC_CODES.includes(r))
  const sponsored = ctx.profile.extra.sponsorshipFor.length > 0 && !isRemotePosting(ctx.job)
  if ((gcc.length === 0 && !sponsored) || gcc.some((r) => isNational(ctx, r))) return null
  if (detectNationalsOnly(description, ctx.job.title)) {
    return { key: 'nationals', status: 'fail', reason: 'JD: nationals only (nationalisation quota)', short: 'nationals only' }
  }
  if (detectNationalsPreferred(description)) {
    return { key: 'nationals', status: 'at_risk', reason: 'JD: nationals preferred', short: 'nationals preferred' }
  }
  return null
}

function sponsorshipCheck(ctx: ScreenContext, needs: readonly RegionCode[]): StageCheck | null {
  if (needs.length === 0) return null
  const description = ctx.job.descriptionMd ?? ''
  const country = regionLabel(needs[0]!)
  const presence = detectPresenceAsk(description)
  if (presence?.kind === 'must_hold_visa') {
    return { key: 'visa', status: 'fail', reason: `JD: “${presence.phrase}” · you need sponsorship in ${country}`, short: 'must already hold a visa' }
  }
  if (detectVisaOffered(description)) return { key: 'visa', status: 'pass', reason: `Visa offered for ${country}` }
  if (presence?.kind === 'in_country') {
    return {
      key: 'visa',
      status: 'at_risk',
      reason: `JD prefers candidates already in ${country} (“${presence.phrase}”)`,
      short: `in-${country} preferred`,
      action: { kind: 'prepare', label: `Prepare: when you can be in ${country} and that you need a visa` },
    }
  }
  // A local-hire posting says it already: the local-hire check below covers it.
  if (ctx.job.localHire) return null
  return {
    key: 'visa',
    status: 'unknown',
    reason: `Visa not mentioned · you need sponsorship in ${country}`,
    short: 'sponsorship',
    action: { kind: 'ask', label: `Ask whether the ${country} work visa is provided` },
  }
}

/**
 * normalized.localHire (an ATS "local hire" status): at risk with the Match
 * Score's own reason text, unless the user is based in that country.
 */
function localHireCheck(ctx: ScreenContext): StageCheck | null {
  if (!ctx.job.localHire || isRemotePosting(ctx.job)) return null
  const places = [...postingPlaces(ctx.job).regions]
  const country = places.find((r) => GCC_CODES.includes(r)) ?? places[0]
  if (!country || country === ctx.profile.extra.basedIn) return null
  const where = regionLabel(country)
  return {
    key: 'local_hire',
    status: 'at_risk',
    reason: `Local hire: likely needs ${where} residency`,
    short: 'local hire',
    action: { kind: 'ask', label: `Ask whether they would sponsor a ${where} visa for the right candidate` },
  }
}

function languageCheck(ctx: ScreenContext): StageCheck {
  const l = languageComponent(ctx.job, ctx.profile)
  const label = l.component.label.replace(/^Language: /, '')
  if (l.mandatoryUnmet.length > 0) return { key: 'language', status: 'fail', reason: `${l.mandatoryUnmet.join(', ')} mandatory`, short: `${l.mandatoryUnmet[0]} mandatory` }
  // Recruiters treat a required language as a knockout ("Fluent Arabic is required");
  // only "preferred / an advantage" is at risk.
  if (l.missing.length > 0) {
    const name = l.missing[0]!.replace(/ fluency \(required\)$/, '')
    return { key: 'language', status: 'fail', reason: label, short: `${name} required` }
  }
  if (/preferred/.test(label)) return { key: 'language', status: 'at_risk', reason: label, short: 'language preferred' }
  return { key: 'language', status: 'pass', reason: label }
}

function noticeCheck(ctx: ScreenContext): StageCheck | null {
  const ask = detectNoticeAsk(ctx.job.descriptionMd)
  if (!ask) return null
  const wants = ask.days === 0 ? 'immediate joiners' : `joining within ${ask.days} days`
  if (ctx.noticePeriods.length === 0) {
    return { key: 'notice', status: 'unknown', reason: `JD wants ${wants} · your notice period is not set`, short: 'notice period', action: { kind: 'prepare', label: 'Set your notice period (Settings › Search preferences)' } }
  }
  const shortest = Math.min(...ctx.noticePeriods.map((p) => NOTICE_DAYS[p]))
  const yours = NOTICE_LABELS[ctx.noticePeriods.find((p) => NOTICE_DAYS[p] === shortest)!]
  if (shortest <= ask.days) return { key: 'notice', status: 'pass', reason: `JD wants ${wants} · you: ${yours}` }
  return {
    key: 'notice',
    status: 'at_risk',
    reason: `JD wants ${wants} · your shortest notice is ${yours}`,
    short: 'notice period',
    action: { kind: 'prepare', label: `Prepare: your notice (${yours}) and whether it can be bought out` },
  }
}

function degreeCheck(ctx: ScreenContext): StageCheck | null {
  const ask = detectDegreeMandatory(ctx.job.descriptionMd)
  if (!ask) return null
  const have = highestCredential(ctx.profile.credentials)
  if (have === null) {
    return { key: 'degree', status: 'at_risk', reason: 'JD: degree mandatory · no degree on your profile', short: 'degree', action: { kind: 'prepare', label: 'Add your degree to Profile › Education' } }
  }
  if (DEGREE_RANK[have] < DEGREE_RANK[ask.level]) {
    return { key: 'degree', status: 'fail', reason: `JD: ${ask.level} mandatory · your highest is ${have}`, short: `${ask.level} mandatory` }
  }
  return { key: 'degree', status: 'pass', reason: `Degree required · you hold a ${have}` }
}

function attestationCheck(ctx: ScreenContext): StageCheck | null {
  const phrase = detectAttestation(ctx.job.descriptionMd)
  if (!phrase) return null
  return {
    key: 'attestation',
    status: 'at_risk',
    reason: `JD: “${phrase}” · lee doesn’t know whether your degree is attested`,
    short: 'degree attestation',
    action: { kind: 'prepare', label: 'Check your degree attestation (state → MEA → embassy → MOFA)' },
  }
}

function banCheck(ctx: ScreenContext): StageCheck | null {
  if (isRemotePosting(ctx.job)) return null
  const countries = [...postingPlaces(ctx.job).regions].filter((r) => !isNational(ctx, r))
  const hit = professionBan(ctx.job.title, countries, ctx.now)
  if (!hit) return null
  const where = regionLabel(hit.ban.country)
  const rule = `${where} bars expatriate ${hit.ban.profession} from ${hit.ban.from}`
  if (hit.state === 'in_force') return { key: 'profession_ban', status: 'fail', reason: rule, short: `${where} expat ban` }
  if (hit.state === 'upcoming') return { key: 'profession_ban', status: 'at_risk', reason: `${rule} (not yet in force)`, short: `${where} expat ban ahead` }
  return { key: 'profession_ban', status: 'unknown', reason: `${rule} (rule not re-checked in a year)`, short: 'profession rule' }
}

const ENGINEER_RULES: Readonly<Partial<Record<RegionCode, string>>> = {
  KW: 'An “Engineer” permit title in Kuwait needs a Kuwait Society of Engineers NOC (accredited degree plus an exam); Indian degrees generally need NBA accreditation. Whether “Software Engineer” is in scope is unconfirmed',
  SA: 'An “Engineer” iqama title in Saudi Arabia needs Saudi Council of Engineers registration. Whether a software title is in scope is unconfirmed',
}

/** Kuwait / Saudi "Engineer" titles: at risk with the reason, never fail (unverified for software titles). */
function permitTitleCheck(ctx: ScreenContext): StageCheck | null {
  if (isRemotePosting(ctx.job) || !isEngineerTitle(ctx.job.title)) return null
  const country = ([...postingPlaces(ctx.job).regions] as RegionCode[]).find((r) => ENGINEER_RULES[r] && !isNational(ctx, r))
  if (!country) return null
  return {
    key: 'permit_title',
    status: 'at_risk',
    reason: ENGINEER_RULES[country]!,
    short: `${regionLabel(country)} engineer title`,
    action: { kind: 'ask', label: 'Ask whether the permit title can be “Software Developer”' },
  }
}

export function eligibilityStage(ctx: ScreenContext): StageResult {
  const needs = sponsorshipNeeds(ctx)
  const checks = [
    locationCheck(ctx),
    nationalsCheck(ctx),
    sponsorshipCheck(ctx, needs),
    localHireCheck(ctx),
    banCheck(ctx),
    permitTitleCheck(ctx),
    languageCheck(ctx),
    noticeCheck(ctx),
    degreeCheck(ctx),
    attestationCheck(ctx),
  ].filter((c): c is StageCheck => c !== null)
  const status = stageStatus('eligibility', checks)
  // What passed, in a line; the concerns are listed under it.
  const passed = checks.filter((c) => c.status === 'pass').slice(0, 3).map((c) => c.reason)
  const concerns = checks.length - checks.filter((c) => c.status === 'pass').length
  const summary = passed.length > 0 ? passed.join(' · ') : `${concerns} question${concerns === 1 ? '' : 's'} before a human reads the CV`
  return { stage: 'eligibility', status, score: STATUS_SCORE[status], summary, checks }
}
