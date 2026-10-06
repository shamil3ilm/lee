import type { MasterCV, TailoredCV } from '@/lib/documents/types'
import { checkFactLock } from '@/lib/resume/fact-lock'

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
  const experience = tailored.experience
    .filter((e) => {
      const ok = companies.has(e.company.toLowerCase())
      if (!ok) dropped++
      return ok
    })
    .map((e) => ({ ...e, bullets: e.bullets.filter(keep) }))
  const projects = tailored.projects
    ?.filter((p) => {
      const ok = projectNames.has(p.name.toLowerCase())
      if (!ok) dropped++
      return ok
    })
    .map((p) => ({ ...p, highlights: p.highlights?.filter(keep) }))
  const summaryOk = keep(tailored.summary)
  const cv: TailoredCV = {
    ...tailored,
    summary: summaryOk ? tailored.summary : starting.summary,
    experience,
    ...(projects ? { projects } : {}),
    _tailoring: {
      ...tailored._tailoring,
      reasoning:
        dropped > 0
          ? `${tailored._tailoring.reasoning} (lee removed ${dropped} line(s) that went beyond your résumé's facts.)`.trim()
          : tailored._tailoring.reasoning,
    },
  }
  return { cv, dropped }
}
