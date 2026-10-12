import { applyChannel } from '@/lib/apply/checklist'
import type { ScreenContext } from './input'
import type { StageCheck, StageResult } from './types'

/**
 * Stage (e): how crowded the pile is and whether you can skip it. Shown
 * only — odds never enter Fit (spec §3.6): posting age, a referral (the
 * biggest single lever in the research), and the apply channel.
 */

const DAY = 86_400_000

const BOARDS = new Set(['LinkedIn', 'Indeed', 'Naukri', 'Bayt', 'Wellfound'])

function ageCheck(ctx: ScreenContext): StageCheck | null {
  const at = ctx.postedAt ?? ctx.firstSeenAt
  if (!at) return null
  const days = Math.max(0, Math.floor((ctx.now.getTime() - at.getTime()) / DAY))
  const when = ctx.postedAt ? 'Posted' : 'First seen'
  const ago = days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`
  if (days < 3) return { key: 'age', status: 'pass', reason: `${when} ${ago}: early (week 1 gets the most applicants, apply soon)` }
  if (days <= 14) return { key: 'age', status: 'pass', reason: `${when} ${ago}` }
  if (days <= 30) return { key: 'age', status: 'at_risk', reason: `${when} ${ago}: later than most applicants`, short: 'older posting' }
  return { key: 'age', status: 'at_risk', reason: `${when} ${ago}: likely stale or evergreen`, short: 'stale posting' }
}

function referralCheck(ctx: ScreenContext): StageCheck | null {
  if (ctx.referral === undefined) return null
  const company = ctx.job.companyName?.trim() || 'this company'
  if (!ctx.referral || ctx.referral.count === 0) {
    return { key: 'referral', status: 'unknown', reason: `No LinkedIn connections found at ${company}` }
  }
  const first = ctx.referral.people[0]?.name
  const n = ctx.referral.count
  return {
    key: 'referral',
    status: 'pass',
    reason: `${n} connection${n === 1 ? '' : 's'} at ${company}${first ? ` (ask ${first})` : ''}`,
    action: { kind: 'referral', label: first ? `Ask ${first} for a referral` : `Ask a connection at ${company} for a referral` },
  }
}

function channelCheck(ctx: ScreenContext): StageCheck | null {
  const ch = applyChannel(ctx.job.applyUrl)
  if (!ch) return null
  if (BOARDS.has(ch.label)) {
    return {
      key: 'channel',
      status: 'at_risk',
      reason: `Via ${ch.label}: a high-volume pile`,
      short: 'job board',
      action: { kind: 'apply_direct', label: 'Find the employer’s own careers page and apply direct' },
    }
  }
  return { key: 'channel', status: 'pass', reason: ch.label === 'Company site' ? 'Apply direct (company site)' : `Apply direct (${ch.label})` }
}

export function oddsStage(ctx: ScreenContext): StageResult {
  const checks = [ageCheck(ctx), referralCheck(ctx), channelCheck(ctx)].filter((c): c is StageCheck => c !== null)
  const status = checks.some((c) => c.status === 'at_risk') ? 'at_risk' : checks.length > 0 ? 'pass' : 'unknown'
  return {
    stage: 'odds',
    status,
    score: status === 'pass' ? 1 : 0.7,
    summary: checks.map((c) => c.reason.split(':')[0]).join(' · ') || 'Nothing known about the competition',
    checks,
  }
}
