/**
 * v12.0 — distil an application's job into a `JobTarget`.
 *
 * `jobs.parsedMeta` is the ParsedJob JSON produced by the parse-job prompt
 * (tech_stack, requirements, responsibilities, seniority). It is untyped
 * jsonb, so every field is read defensively.
 */
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import type { JobTarget } from './types'

const NICE_RE = /\b(nice[- ]to[- ]have|bonus|a plus|is a plus|preferred|ideally|familiarity with|desirable|optional)\b/i
const NICE_HEADING_RE = /^\s*(?:#+\s*)?(?:\*\*)?\s*(nice[- ]to[- ]haves?|bonus(?: points)?|preferred(?: qualifications)?|good to have|desirable)\b/i
const ANY_HEADING_RE = /^\s*(?:#+\s+\S|\*\*[^*]+\*\*\s*:?\s*$|[A-Z][A-Za-z '&/]{2,40}:\s*$)/

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
}

/** Lines under a "Nice to have" / "Bonus" heading in the JD markdown. */
export function niceToHaveFromDescription(md: string): string[] {
  const out: string[] = []
  let inNice = false
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (NICE_HEADING_RE.test(line)) {
      inNice = true
      continue
    }
    if (inNice && ANY_HEADING_RE.test(line) && !/^[-*•]/.test(line)) {
      inNice = false
      continue
    }
    if (inNice) out.push(line.replace(/^[-*•]\s*/, ''))
  }
  return out
}

export function jobTargetFromApplication(app: ApplicationWithJob): JobTarget {
  const meta = (app.job.parsedMeta ?? {}) as Record<string, unknown>
  const description = app.job.descriptionMd ?? ''
  const allReqs = strArray(meta.requirements)
  const requirements = allReqs.filter((r) => !NICE_RE.test(r))
  const niceFromReqs = allReqs.filter((r) => NICE_RE.test(r))
  const niceToHave = [
    ...niceFromReqs,
    ...strArray(meta.nice_to_have),
    ...niceToHaveFromDescription(description),
  ]
  const seniority = typeof meta.seniority === 'string' && meta.seniority !== 'unknown'
    ? meta.seniority
    : undefined
  const techStack = strArray(meta.tech_stack)
  return {
    applicationId: app.id,
    title: app.job.title,
    companyName: app.job.company?.name ?? undefined,
    seniority,
    techStack: techStack.length ? techStack : (app.job.company?.techStack ?? []),
    requirements,
    niceToHave: [...new Set(niceToHave)],
    responsibilities: strArray(meta.responsibilities),
    descriptionMd: description,
  }
}

/** True when the target carries enough JD signal to run JD-mode scoring. */
export function hasJdSignal(t: JobTarget | null | undefined): t is JobTarget {
  if (!t) return false
  return (
    t.techStack.length > 0 ||
    t.requirements.length > 0 ||
    t.responsibilities.length > 0 ||
    t.descriptionMd.trim().length > 0
  )
}
