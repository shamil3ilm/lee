import type { ProgressRow } from '@/lib/db/queries/academyCoding'
import { DIFFICULTIES, ROLES, TOPICS, type CodeLanguage, type Difficulty, type Problem, type Role, type Topic } from '@/lib/academy/problems/schema'
import { languagesFor } from '@/lib/academy/problems/schema'

/**
 * The problem set table (/playground/problems): filters, search, sorting
 * and pagination over the catalog joined with the user's progress. Pure, so
 * the filter logic is unit-tested without a database.
 */

export const PROBLEM_STATUSES = ['todo', 'attempted', 'solved'] as const
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number]

export const PROBLEM_SORTS = ['default', 'difficulty', 'acceptance', 'title', 'recent'] as const
export type ProblemSort = (typeof PROBLEM_SORTS)[number]

export const PAGE_SIZE = 20

export interface ProblemFilters {
  difficulty?: Difficulty
  topic?: Topic
  role?: Role
  status?: ProblemStatus
  language?: CodeLanguage
  q?: string
  sort: ProblemSort
  page: number
}

export interface ProblemRow {
  slug: string
  title: string
  difficulty: Difficulty
  topics: readonly Topic[]
  roles: readonly Role[]
  skillId: string
  languages: readonly CodeLanguage[]
  status: ProblemStatus
  submissions: number
  accepted: number
  /** Your acceptance rate on this problem, 0–100 (null before any submission). */
  acceptance: number | null
  bestRuntimeMs: number | null
  lastSubmittedAt: Date | null
}

export interface ProblemPage {
  rows: ProblemRow[]
  total: number
  page: number
  pages: number
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

const LANGS: readonly CodeLanguage[] = ['javascript', 'typescript', 'python', 'php', 'sql']

/** Read filters from search params (unknown values are dropped, never thrown). */
export function parseFilters(sp: Record<string, string | string[] | undefined>): ProblemFilters {
  const one = (k: string) => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }
  const page = Number.parseInt(one('page') ?? '1', 10)
  const q = (one('q') ?? '').trim().slice(0, 80)
  return {
    difficulty: pick(one('difficulty'), DIFFICULTIES),
    topic: pick(one('topic'), TOPICS),
    role: pick(one('role'), ROLES),
    status: pick(one('status'), PROBLEM_STATUSES),
    language: pick(one('language'), LANGS),
    q: q || undefined,
    sort: pick(one('sort'), PROBLEM_SORTS) ?? 'default',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

export function statusOf(progress: ProgressRow | undefined): ProblemStatus {
  if (!progress || progress.submissions === 0) return progress?.status === 'solved' ? 'solved' : 'todo'
  return progress.status === 'solved' ? 'solved' : 'attempted'
}

export function toRow(p: Problem, progress: ProgressRow | undefined): ProblemRow {
  const submissions = progress?.submissions ?? 0
  const accepted = progress?.accepted ?? 0
  return {
    slug: p.slug,
    title: p.title,
    difficulty: p.difficulty,
    topics: p.topics,
    roles: p.roles,
    skillId: p.skillId,
    languages: languagesFor(p),
    status: statusOf(progress),
    submissions,
    accepted,
    acceptance: submissions > 0 ? Math.round((100 * accepted) / submissions) : null,
    bestRuntimeMs: progress?.bestRuntimeMs ?? null,
    lastSubmittedAt: progress?.lastSubmittedAt ?? null,
  }
}

function matches(r: ProblemRow, f: ProblemFilters): boolean {
  if (f.difficulty && r.difficulty !== f.difficulty) return false
  if (f.topic && !r.topics.includes(f.topic)) return false
  if (f.role && !r.roles.includes(f.role)) return false
  if (f.status && r.status !== f.status) return false
  if (f.language && !r.languages.includes(f.language)) return false
  if (f.q) {
    const q = f.q.toLowerCase()
    const hay = `${r.title} ${r.slug} ${r.topics.join(' ')} ${r.roles.join(' ')}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

const DIFF_RANK: Readonly<Record<Difficulty, number>> = { easy: 0, medium: 1, hard: 2 }

function compare(sort: ProblemSort): (a: ProblemRow, b: ProblemRow) => number {
  switch (sort) {
    case 'difficulty':
      return (a, b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty] || a.title.localeCompare(b.title)
    case 'acceptance':
      return (a, b) => (b.acceptance ?? -1) - (a.acceptance ?? -1) || a.title.localeCompare(b.title)
    case 'title':
      return (a, b) => a.title.localeCompare(b.title)
    case 'recent':
      return (a, b) => (b.lastSubmittedAt?.getTime() ?? 0) - (a.lastSubmittedAt?.getTime() ?? 0) || a.title.localeCompare(b.title)
    case 'default':
      return () => 0
  }
}

export function filterProblems(problems: readonly Problem[], progress: readonly ProgressRow[], f: ProblemFilters): ProblemPage {
  const bySlug = new Map(progress.map((p) => [p.problemSlug, p]))
  const rows = problems
    .map((p) => toRow(p, bySlug.get(p.slug)))
    .filter((r) => matches(r, f))
  const sorted = f.sort === 'default' ? rows : [...rows].sort(compare(f.sort))
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(f.page, pages)
  return { rows: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: sorted.length, page, pages }
}

export interface ProblemSummary {
  solved: Record<Difficulty, number>
  totals: Record<Difficulty, number>
  submissions: number
  accepted: number
  /** Overall acceptance rate, 0–100 (null before any submission). */
  acceptance: number | null
}

export function summarize(problems: readonly Problem[], progress: readonly ProgressRow[]): ProblemSummary {
  const known = new Map(problems.map((p) => [p.slug, p]))
  const solved: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  const totals: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  for (const p of problems) totals[p.difficulty]++
  let submissions = 0
  let accepted = 0
  for (const row of progress) {
    const p = known.get(row.problemSlug)
    if (!p) continue
    if (row.status === 'solved') solved[p.difficulty]++
    submissions += row.submissions
    accepted += row.accepted
  }
  return { solved, totals, submissions, accepted, acceptance: submissions > 0 ? Math.round((100 * accepted) / submissions) : null }
}

/** Query string for a filter change (page resets unless given). */
export function filterHref(base: ProblemFilters, change: Partial<ProblemFilters>): string {
  const next = { ...base, page: 1, ...change }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === '' || (k === 'sort' && v === 'default') || (k === 'page' && v === 1)) continue
    params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `/playground/problems?${s}` : '/playground/problems'
}
