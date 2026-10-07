import rawManifest from '@/content/academy/problems/manifest.json'
import { PROBLEM_SOURCES, STUDY_PLAN_SOURCES } from '@/content/academy/problems'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { issueLines, manifestSchema } from '@/lib/academy/content/schema'
import { problemSchema, studyPlanSchema, type Problem, type StudyPlan } from './schema'

/**
 * The coding problem set (v13 phase 13.1): validated once per process.
 *
 * SERVER-ONLY: problems carry hidden tests and reference solutions. Only
 * server components, server actions and services import this module; the
 * browser gets `toPublicProblem` (./public.ts). `scripts/check-playground-
 * bundle.mjs` fails the build check if a reference solution or a hidden
 * expected value ever shows up in the client bundle.
 */

export interface ProblemCatalog {
  packName: string
  packVersion: string
  problems: readonly Problem[]
  bySlug: ReadonlyMap<string, Problem>
  plans: readonly StudyPlan[]
  planById: ReadonlyMap<string, StudyPlan>
}

export type CatalogResult = { ok: true; catalog: ProblemCatalog } | { ok: false; errors: string[] }

function crossErrors(problems: readonly Problem[], plans: readonly StudyPlan[], skills: ReadonlySet<string>): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const p of problems) {
    if (seen.has(p.slug)) errors.push(`problem "${p.slug}" is duplicated`)
    seen.add(p.slug)
    if (!skills.has(p.skillId)) errors.push(`${p.slug}: unknown skill "${p.skillId}"`)
    if (p.kind === 'function') {
      const arity = p.fn.params.length
      for (const [i, t] of [...p.samples, ...p.hidden].entries()) {
        if (t.args.length !== arity) errors.push(`${p.slug}: test ${i} has ${t.args.length} args, expected ${arity}`)
      }
    }
  }
  const planIds = new Set<string>()
  for (const plan of plans) {
    if (planIds.has(plan.id)) errors.push(`study plan "${plan.id}" is duplicated`)
    planIds.add(plan.id)
    for (const slug of plan.problems) if (!seen.has(slug)) errors.push(`plan ${plan.id}: unknown problem "${slug}"`)
  }
  return errors
}

export function validateProblems(raw: { problems: readonly unknown[]; plans: readonly unknown[]; manifest?: unknown }, skills: ReadonlySet<string>): CatalogResult {
  const errors: string[] = []
  const problems: Problem[] = []
  raw.problems.forEach((p, i) => {
    const r = problemSchema.safeParse(p)
    if (r.success) problems.push(r.data)
    else errors.push(...issueLines(`problems[${i}${typeof (p as { slug?: unknown }).slug === 'string' ? `:${(p as { slug: string }).slug}` : ''}]`, r.error))
  })
  const plans: StudyPlan[] = []
  raw.plans.forEach((p, i) => {
    const r = studyPlanSchema.safeParse(p)
    if (r.success) plans.push(r.data)
    else errors.push(...issueLines(`plans[${i}]`, r.error))
  })
  const manifest = manifestSchema.safeParse(raw.manifest ?? { pack: 'test', version: '0.0.0' })
  if (!manifest.success) errors.push(...issueLines('manifest', manifest.error))
  if (errors.length > 0 || !manifest.success) return { ok: false, errors }
  const cross = crossErrors(problems, plans, skills)
  if (cross.length > 0) return { ok: false, errors: cross }
  return {
    ok: true,
    catalog: {
      packName: manifest.data.pack,
      packVersion: manifest.data.version,
      problems,
      bySlug: new Map(problems.map((p) => [p.slug, p])),
      plans,
      planById: new Map(plans.map((p) => [p.id, p])),
    },
  }
}

let cached: ProblemCatalog | null = null

/** The shipped problem set. Throws when invalid (never served half-broken). */
export function loadProblemCatalog(): ProblemCatalog {
  if (cached) return cached
  const skills = new Set(loadAcademyContent().graph.skills.map((s) => s.id))
  const result = validateProblems({ problems: PROBLEM_SOURCES, plans: STUDY_PLAN_SOURCES, manifest: rawManifest }, skills)
  if (!result.ok) throw new Error(`Invalid problem set: ${result.errors.slice(0, 5).join('; ')}`)
  cached = result.catalog
  return cached
}

/** "academy-problems@1.0.0", recorded on every coding attempt. */
export function problemsContentVersion(c: Pick<ProblemCatalog, 'packName' | 'packVersion'>): string {
  return `${c.packName}@${c.packVersion}`
}
