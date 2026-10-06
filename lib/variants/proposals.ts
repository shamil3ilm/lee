import type { ResumeVariantResult, VariantItemForAi } from '@/lib/ai/prompts/resume-variant'
import { checkDomainWording, checkFactLock, domainLockMessage, factLockMessage } from '@/lib/resume/fact-lock'
import { presentation, resolveHighlight } from '@/lib/resume/readiness'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'

/**
 * What the AI may see, and what of its answer survives. Only interview-
 * ready items (and design-only items, in their design wording) are sent;
 * the answer is then filtered in code: unknown / not-offered ids are
 * dropped, wordings must pass the fact lock (and the domain lock for
 * design-only items), and numbers in the headline / summary that the
 * profile lacks are flagged. Nothing is saved until the user confirms.
 */

export function itemsForAi(profile: ResumeProfile): VariantItemForAi[] {
  const out: VariantItemForAi[] = []
  const add = (h: Highlight, context: string): void => {
    const r = resolveHighlight(h, null)
    if (r) out.push({ id: h.id, kind: 'highlight', context, text: r.text, designOnly: r.mode === 'domain' })
  }
  for (const w of profile.work) for (const h of w.highlights) add(h, `${w.name} — ${w.position}`)
  for (const p of profile.projects) {
    const mode = presentation(p)
    if (mode === 'excluded') continue
    out.push({ id: p.id, kind: 'project', context: 'Project', text: [p.name, mode === 'full' ? p.description : ''].filter(Boolean).join(': '), designOnly: mode === 'domain' })
    if (mode === 'full') for (const h of p.highlights) add(h, `Project ${p.name}`)
  }
  return out
}

export interface ProposedWording {
  highlightId: string
  text: string
}

export interface Rejection {
  what: string
  reason: string
}

export interface FilteredProposal {
  headline: string
  summary: string
  /** Problems in the headline / summary (shown; the user decides). */
  flags: string[]
  selectedIds: string[]
  wordings: ProposedWording[]
  rejected: Rejection[]
}

function findHighlight(profile: ResumeProfile, id: string): Highlight | undefined {
  for (const w of profile.work) for (const h of w.highlights) if (h.id === id) return h
  for (const p of profile.projects) for (const h of p.highlights) if (h.id === id) return h
  return undefined
}

function profileFacts(profile: ResumeProfile): string {
  return itemsForAi(profile)
    .map((i) => i.text)
    .concat(profile.basics.summary, profile.basics.label, ...profile.work.flatMap((w) => [w.startDate, w.endDate]))
    .join(' | ')
}

export function filterProposal(profile: ResumeProfile, offered: readonly VariantItemForAi[], answer: ResumeVariantResult): FilteredProposal {
  const allowed = new Map(offered.map((i) => [i.id, i]))
  const rejected: Rejection[] = []
  const selectedIds = [...new Set(answer.selectedIds)].filter((id) => {
    if (allowed.has(id)) return true
    rejected.push({ what: `Selection "${id}"`, reason: 'Not an interview-ready item in your profile.' })
    return false
  })
  const wordings: ProposedWording[] = []
  for (const w of answer.wordings) {
    const item = allowed.get(w.id)
    const h = item?.kind === 'highlight' ? findHighlight(profile, w.id) : undefined
    const text = w.text.trim()
    if (!item || !h) {
      rejected.push({ what: `Wording for "${w.id}"`, reason: 'Not an interview-ready highlight in your profile.' })
      continue
    }
    const lock = checkFactLock(text, h.text)
    if (!lock.ok) {
      rejected.push({ what: `Wording "${text}"`, reason: factLockMessage(lock) })
      continue
    }
    const domain = checkDomainWording(text)
    if (item.designOnly && !domain.ok) {
      rejected.push({ what: `Wording "${text}"`, reason: domainLockMessage(domain) })
      continue
    }
    if (text && text !== h.text && !h.alternates.some((a) => a.text === text)) wordings.push({ highlightId: h.id, text })
  }
  const facts = profileFacts(profile)
  const flags: string[] = []
  for (const [label, text] of [['Headline', answer.headline], ['Summary', answer.summary]] as const) {
    const lock = checkFactLock(text, facts)
    if (!lock.ok) flags.push(`${label}: ${factLockMessage(lock)}`)
  }
  return { headline: answer.headline.trim(), summary: answer.summary.trim(), flags, selectedIds, wordings, rejected }
}
