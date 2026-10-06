import { issueLines, skillGraphFileSchema, type Domain, type SkillDef } from './schema'

/**
 * The skill graph (v13 §2): a DAG of competencies. Validation is strict
 * (unique ids, known domains, existing prerequisites, no cycles) so a bad
 * content edit fails tests and the loader, never a page at runtime. Pure.
 */

export interface SkillGraph {
  version: string
  domains: readonly Domain[]
  skills: readonly SkillDef[]
  byId: ReadonlyMap<string, SkillDef>
  domainById: ReadonlyMap<string, Domain>
}

export type GraphResult = { ok: true; graph: SkillGraph } | { ok: false; errors: string[] }

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dup.add(id)
    seen.add(id)
  }
  return [...dup]
}

/** The ids on one cycle, or null when the graph is acyclic (iterative DFS). */
export function findCycle(skills: readonly SkillDef[]): string[] | null {
  const byId = new Map(skills.map((s) => [s.id, s]))
  const state = new Map<string, 'visiting' | 'done'>()
  for (const start of skills) {
    if (state.get(start.id) === 'done') continue
    const path: string[] = []
    const stack: Array<{ id: string; next: number }> = [{ id: start.id, next: 0 }]
    state.set(start.id, 'visiting')
    path.push(start.id)
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!
      const prereqs = byId.get(top.id)?.prerequisites ?? []
      if (top.next >= prereqs.length) {
        state.set(top.id, 'done')
        stack.pop()
        path.pop()
        continue
      }
      const next = prereqs[top.next]!
      top.next += 1
      if (!byId.has(next)) continue
      const s = state.get(next)
      if (s === 'visiting') return [...path.slice(path.indexOf(next)), next]
      if (s === 'done') continue
      state.set(next, 'visiting')
      path.push(next)
      stack.push({ id: next, next: 0 })
    }
  }
  return null
}

export function validateSkillGraph(raw: unknown): GraphResult {
  const parsed = skillGraphFileSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, errors: issueLines('skills', parsed.error) }
  const { version, domains, skills } = parsed.data
  const errors: string[] = []
  for (const id of duplicates(domains.map((d) => d.id))) errors.push(`duplicate domain id "${id}"`)
  for (const id of duplicates(skills.map((s) => s.id))) errors.push(`duplicate skill id "${id}"`)
  const domainIds = new Set(domains.map((d) => d.id))
  const skillIds = new Set(skills.map((s) => s.id))
  for (const s of skills) {
    if (!domainIds.has(s.domain)) errors.push(`${s.id}: unknown domain "${s.domain}"`)
    for (const p of s.prerequisites) {
      if (p === s.id) errors.push(`${s.id}: lists itself as a prerequisite`)
      else if (!skillIds.has(p)) errors.push(`${s.id}: prerequisite "${p}" does not exist`)
    }
  }
  const cycle = findCycle(skills)
  if (cycle) errors.push(`prerequisite cycle: ${cycle.join(' → ')}`)
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    graph: {
      version,
      domains,
      skills,
      byId: new Map(skills.map((s) => [s.id, s])),
      domainById: new Map(domains.map((d) => [d.id, d])),
    },
  }
}

/** Skill ids with every prerequisite before its dependants (stable by file order). */
export function topologicalOrder(graph: SkillGraph): string[] {
  const out: string[] = []
  const placed = new Set<string>()
  const visit = (id: string): void => {
    if (placed.has(id)) return
    for (const p of graph.byId.get(id)?.prerequisites ?? []) visit(p)
    placed.add(id)
    out.push(id)
  }
  for (const s of graph.skills) visit(s.id)
  return out
}

/** Skills in one domain, in file order. */
export function skillsInDomain(graph: SkillGraph, domainId: string): SkillDef[] {
  return graph.skills.filter((s) => s.domain === domainId)
}
