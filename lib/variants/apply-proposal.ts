import { readyHighlights } from '@/lib/resume/readiness'
import type { ResumeProfile } from '@/lib/resume/types'
import type { HighlightPick, Recipe } from './types'

export interface AcceptedProposal {
  headline: string | null
  summary: string | null
  /** Accepted selection (already filtered to offered ids); null = keep the recipe's. */
  selectedIds: string[] | null
  /** highlightId → the id of the accepted (now saved) wording. */
  wordingIds: ReadonlyMap<string, string>
}

/**
 * Fold an accepted AI proposal into a recipe (pure). Jobs keep their place
 * (employment history is not the AI's call); within a job the selected
 * highlights lead in the proposed order. Selected projects replace the
 * project list. Accepted wordings are chosen for their highlights.
 */
export function applyProposalToRecipe(profile: ResumeProfile, recipe: Recipe, accepted: AcceptedProposal): Recipe {
  const sel = accepted.selectedIds
  const rank = new Map((sel ?? []).map((id, i) => [id, i]))
  const pick = (id: string, existing: readonly HighlightPick[]): HighlightPick => ({
    id,
    wordingId: accepted.wordingIds.get(id) ?? existing.find((p) => p.id === id)?.wordingId ?? null,
  })

  const work = recipe.work.map((w) => {
    const job = profile.work.find((x) => x.id === w.id)
    const chosen = sel && job ? job.highlights.filter((h) => rank.has(h.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!) : []
    const ids = chosen.length > 0 ? chosen.map((h) => h.id) : w.highlights.map((h) => h.id)
    return { ...w, highlights: ids.map((id) => pick(id, w.highlights)) }
  })

  const projects = sel
    ? profile.projects
        .filter((p) => rank.has(p.id))
        .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
        .map((p) => {
          const existing = recipe.projects.find((x) => x.id === p.id)?.highlights ?? []
          const ids = existing.length > 0 ? existing.map((h) => h.id) : readyHighlights(p.highlights).slice(0, 3).map((h) => h.id)
          return { id: p.id, highlights: ids.map((id) => pick(id, existing)) }
        })
    : recipe.projects.map((p) => ({ ...p, highlights: p.highlights.map((h) => pick(h.id, p.highlights)) }))

  return {
    ...recipe,
    headline: accepted.headline ?? recipe.headline,
    summary: accepted.summary ?? recipe.summary,
    work,
    projects: sel && projects.length === 0 ? recipe.projects : projects,
  }
}
