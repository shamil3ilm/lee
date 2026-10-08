import { skillsInText, withImplied } from '@/lib/discovery/match/lexicon'
import type { MatchProfile } from '@/lib/discovery/match/types'
import type { RenderedResume } from '@/lib/variants/render'

/**
 * What a RENDERED variant shows, in the shape the Match Score's coverage
 * checks read (`skills` + `evidence`). Rendering already applied every
 * readiness rule (not-ready items left out, domain-only items in design
 * wording), so this is exactly what the CV claims — nothing more:
 *   - skills come from fully presented lines (bullets, the skills line,
 *     project stacks), never from design-only bullets: those back a
 *     requirement only through content-word overlap (partial), as in the
 *     Match Score;
 *   - evidence lines are the bullets, project lines and the skills line.
 */

export type VariantEvidence = Pick<MatchProfile, 'skills' | 'evidence'>

export function renderedEvidence(r: RenderedResume): VariantEvidence {
  const lines: string[] = []
  const skillText: string[] = []
  for (const s of r.sections) {
    for (const e of s.entries) {
      if (s.key === 'projects') {
        const line = `${e.title}${e.subtitle ? `: ${e.subtitle}` : ''}${e.keywords.length ? ` (${e.keywords.join(', ')})` : ''}`
        lines.push(line)
        if (e.keywords.length > 0) skillText.push(line)
      }
      for (const b of e.bullets) {
        lines.push(b.text)
        if (b.mode !== 'domain') skillText.push(b.text)
      }
    }
    if (s.key === 'skills') {
      for (const l of s.lines) {
        lines.push(`Skills: ${l}`)
        skillText.push(l)
      }
    }
  }
  const skills = new Set<string>()
  for (const t of skillText) for (const c of skillsInText(t)) skills.add(c)
  return { skills: withImplied(skills), evidence: [...new Set(lines.map((l) => l.trim()).filter(Boolean))] }
}
