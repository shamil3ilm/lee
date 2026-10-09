import type { ProjectItem, ResumeProfile } from '@/lib/resume/types'

/**
 * Client-safe, pure. GitHub activity as EVIDENCE next to a project's
 * readiness flags. It never changes `interviewReady` / `domainReady`: the
 * most it does is suggest that the user review them. Imported description
 * and topics are suggestions the user confirms (applyRepoSuggestion runs
 * only on that click).
 */

export interface RepoEvidence {
  fullName: string
  htmlUrl: string
  isPrivate: boolean
  userCommits: number
  userPrs: number
  lastCommitAt: string | null
  stars: number
  languages: Array<{ name: string; share: number }>
}

/** Commits by the user that make "review your readiness" worth suggesting. */
export const REVIEW_COMMIT_THRESHOLD = 20

export type ReviewHint = 'none' | 'review_ready' | 'review_low_activity'

/**
 * - not marked interview-ready, but substantial own activity → suggest a review;
 * - marked ready, but almost no own commits → suggest a review too
 *   (perhaps the work happened elsewhere; the user decides).
 */
export function reviewHint(project: Pick<ProjectItem, 'interviewReady'>, evidence: Pick<RepoEvidence, 'userCommits' | 'userPrs'>): ReviewHint {
  const activity = evidence.userCommits + evidence.userPrs * 3
  if (!project.interviewReady && activity >= REVIEW_COMMIT_THRESHOLD) return 'review_ready'
  if (project.interviewReady && evidence.userCommits === 0 && evidence.userPrs === 0) return 'review_low_activity'
  return 'none'
}

export function reviewHintText(hint: ReviewHint): string | null {
  if (hint === 'review_ready') return 'Your own commits here are substantial. Review whether this project is interview-ready (only you can mark it).'
  if (hint === 'review_low_activity') return 'No commits by you in this repository. If the work happened elsewhere, that is fine; otherwise review its readiness.'
  return null
}

export interface RepoSuggestion {
  projectId: string
  /** Proposed project description (≤ 200 chars), or null when nothing to propose. */
  description: string | null
  /** Topics not yet among the project's keywords. */
  keywords: string[]
  url: string | null
}

/** What linking a repo would add to the project — shown for confirmation, never applied silently. */
export function buildRepoSuggestion(
  project: ProjectItem,
  repo: { description: string | null; topics: readonly string[]; htmlUrl: string; isPrivate: boolean },
): RepoSuggestion {
  const known = new Set(project.keywords.map((k) => k.toLowerCase()))
  const keywords = [...new Set(repo.topics.map((t) => t.trim()).filter((t) => t && !known.has(t.toLowerCase())))].slice(0, 10)
  const description = repo.description?.trim().slice(0, 200) || null
  return {
    projectId: project.id,
    description: description && description !== project.description ? description : null,
    keywords,
    // A private repo's URL is useless to a reader: never proposed.
    url: !repo.isPrivate && !project.url ? repo.htmlUrl : null,
  }
}

/** Apply the parts of a suggestion the user ticked. Returns a new profile. */
export function applyRepoSuggestion(
  profile: ResumeProfile,
  suggestion: RepoSuggestion,
  accept: { description: boolean; keywords: readonly string[]; url: boolean },
): ResumeProfile {
  return {
    ...profile,
    projects: profile.projects.map((p) => {
      if (p.id !== suggestion.projectId) return p
      const allowed = new Set(suggestion.keywords)
      const added = accept.keywords.filter((k) => allowed.has(k))
      return {
        ...p,
        description: accept.description && suggestion.description ? suggestion.description : p.description,
        url: accept.url && suggestion.url ? suggestion.url : p.url,
        keywords: [...p.keywords, ...added].slice(0, 40),
      }
    }),
  }
}
