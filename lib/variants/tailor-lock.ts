import { plural } from '@/lib/ui/labels'
import type { MasterCV, TailoredCV } from '@/lib/documents/types'
import { checkFactLock } from '@/lib/resume/fact-lock'
import { lockWorkFacts, type WorkFact } from '@/lib/resume/work-facts'

/**
 * Fact lock on the AI's tailored CV. The prompt only ever sees the starting
 * CV (a variant, or the derived master — interview-ready items and
 * design-worded domain items only), and this enforces in code that the
 * answer stays inside it: no employer or project that is not there, no
 * line with a number the starting CV does not contain. So a not-ready item
 * can never be reintroduced by the model.
 */

function allText(cv: MasterCV): string {
  return [
    cv.basics.headline,
    cv.summary,
    ...cv.experience.flatMap((e) => [e.company, e.role, e.start, e.end, ...e.bullets, ...(e.tech ?? [])]),
    ...(cv.projects ?? []).flatMap((p) => [p.name, p.description, ...(p.tech ?? []), ...(p.highlights ?? [])]),
    ...(cv.education ?? []).flatMap((e) => [e.school, e.degree, e.start ?? '', e.end ?? '']),
    ...(cv.certifications ?? []).flatMap((c) => [c.name, c.date ?? '']),
  ].join(' | ')
}

export interface LockedTailoring {
  cv: TailoredCV
  dropped: number
  /** Jobs whose title or dates the model changed, put back as held. */
  restored: number
}

export function lockTailoredCv(tailored: TailoredCV, starting: MasterCV): LockedTailoring {
  const source = allText(starting)
  const companies = new Set(starting.experience.map((e) => e.company.toLowerCase()))
  const projectNames = new Set((starting.projects ?? []).map((p) => p.name.toLowerCase()))
  let dropped = 0
  const keep = (line: string): boolean => {
    const ok = checkFactLock(line, source).ok
    if (!ok) dropped++
    return ok
  }
  const kept = tailored.experience
    .filter((e) => {
      const ok = companies.has(e.company.toLowerCase())
      if (!ok) dropped++
      return ok
    })
    .map((e) => ({ ...e, bullets: e.bullets.filter(keep) }))
  // Positions, employers and dates stay exactly as held (lib/resume/work-facts.ts).
  const work = lockWorkFacts(kept, starting.experience, experienceFact, withExperienceFact)
  const experience = work.items
  const projects = tailored.projects
    ?.filter((p) => {
      const ok = projectNames.has(p.name.toLowerCase())
      if (!ok) dropped++
      return ok
    })
    .map((p) => ({ ...p, highlights: p.highlights?.filter(keep) }))
  const summaryOk = keep(tailored.summary)
  const notes = [
    dropped > 0 ? `lee removed ${plural(dropped, 'line')} that went beyond your résumé's facts.` : '',
    work.restored > 0 ? `lee kept ${plural(work.restored, 'job title')} and dates as held.` : '',
  ].filter(Boolean)
  const cv: TailoredCV = {
    ...tailored,
    summary: summaryOk ? tailored.summary : starting.summary,
    experience,
    ...(projects ? { projects } : {}),
    _tailoring: {
      ...tailored._tailoring,
      reasoning: notes.length > 0 ? `${tailored._tailoring.reasoning} (${notes.join(' ')})`.trim() : tailored._tailoring.reasoning,
    },
  }
  return { cv, dropped, restored: work.restored }
}

type Experience = MasterCV['experience'][number]

function experienceFact(e: Experience): WorkFact {
  return { employer: e.company, position: e.role, start: e.start, end: e.end }
}

function withExperienceFact<T extends Experience>(e: T, f: WorkFact): T {
  return { ...e, company: f.employer, role: f.position, start: f.start, end: f.end }
}
