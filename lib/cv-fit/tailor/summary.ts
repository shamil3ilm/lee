import { skillLabel, withImplied } from '@/lib/discovery/match/lexicon'
import { creditFor } from '@/lib/discovery/match/skills'
import { checkDomainWording, checkFactLock } from '@/lib/resume/fact-lock'
import type { ResumeProfile } from '@/lib/resume/types'
import type { Recipe } from '@/lib/variants/types'
import type { ChecklistItem, Suggestion } from './types'
import type { Unit } from './units'

/**
 * Headline and summary from FACTS only: the variant's own headline and
 * summary (written by the user), plus the JD keywords that fully ready
 * evidence genuinely supports ("Backend Engineer · Go, PostgreSQL"). A
 * keyword backed only by design-only work or a sibling skill is never used,
 * and the result must pass the number lock against the whole master profile
 * and the domain lock (no implementation claims added). Pure.
 */

/** Every user-written string in the profile (ids and flags left out): the number source. */
export function factsText(profile: ResumeProfile): string {
  const out: string[] = []
  const walk = (v: unknown, key: string): void => {
    if (key === 'id' || key.endsWith('Id') || key === 'visibility') return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach((x) => walk(x, ''))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(profile, '')
  return out.join(' | ')
}

/** JD skills fully backed by ready evidence, must-haves first. */
export function supportedKeywords(checklist: readonly ChecklistItem[], units: readonly Unit[]): string[] {
  const full = new Set<string>()
  for (const u of units) if (u.mode === 'full') for (const s of u.skills) full.add(s)
  const have = withImplied(full)
  const ordered = [...checklist].sort((a, b) => Number(a.weight === 'nice') - Number(b.weight === 'nice'))
  const out: string[] = []
  for (const c of ordered) {
    if (c.status !== 'met') continue
    for (const s of c.skills) if (creditFor(s, have).credit === 1 && !out.includes(s)) out.push(s)
  }
  return out.map(skillLabel)
}

function mentioned(text: string, label: string): boolean {
  return text.toLowerCase().includes(label.toLowerCase())
}

function listOf(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

function locked(text: string, facts: string): boolean {
  return checkFactLock(text, facts).ok && checkDomainWording(text).ok
}

export function headlineAndSummary(
  profile: ResumeProfile,
  recipe: Recipe,
  checklist: readonly ChecklistItem[],
  units: readonly Unit[],
): Suggestion[] {
  const keywords = supportedKeywords(checklist, units)
  const reqIds = checklist.filter((c) => c.status === 'met').map((c) => c.id)
  const facts = factsText(profile)
  const out: Suggestion[] = []
  const headline = recipe.headline || profile.basics.label
  const forHeadline = keywords.filter((k) => !mentioned(headline, k)).slice(0, 3)
  if (headline && forHeadline.length > 0) {
    const text = `${headline} · ${forHeadline.join(', ')}`.slice(0, 200)
    if (locked(text.replace(headline, ''), facts)) {
      out.push({ id: 'headline', kind: 'headline', requirementIds: reqIds, from: headline, text, reason: `Adds the JD keywords your ready work shows: ${forHeadline.join(', ')}` })
    }
  }
  const summary = recipe.summary || profile.basics.summary
  const forSummary = keywords.filter((k) => !mentioned(summary, k)).slice(0, 5)
  if (summary && forSummary.length > 0) {
    const sentence = `Relevant to this role: ${listOf(forSummary)}.`
    const text = `${summary.replace(/\s+$/, '')} ${sentence}`.slice(0, 2000)
    if (locked(sentence, facts)) {
      out.push({ id: 'summary', kind: 'summary', requirementIds: reqIds, from: summary, text, reason: `Names what this JD asks for that your ready work shows: ${forSummary.join(', ')}` })
    }
  }
  return out
}
