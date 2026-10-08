import { z } from 'zod'

/**
 * Where profile.json lives: Settings › Publish. Validated so the
 * values can be put into a GitHub API path safely (no "..", no leading
 * slash, the file must be .json).
 */

export const PORTFOLIO_TOKEN_ID = 'github_portfolio' as const

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/
const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/
const PATH = /^[A-Za-z0-9._-][A-Za-z0-9._/-]{0,199}\.json$/

export const publishConfigSchema = z.object({
  repo: z.string().trim().regex(REPO, 'Use owner/name, e.g. octocat/portfolio'),
  branch: z
    .string()
    .trim()
    .regex(BRANCH, 'Letters, digits, ".", "_", "-" and "/" only')
    .refine((v) => !v.includes('..') && !v.startsWith('/') && !v.endsWith('/'), 'Not a valid branch name'),
  path: z
    .string()
    .trim()
    .regex(PATH, 'A .json file path inside the repo, e.g. profile.json')
    .refine((v) => !v.split('/').includes('..') && !v.includes('//'), 'Not a valid file path'),
})
export type PublishConfig = z.infer<typeof publishConfigSchema>

export interface RepoTarget {
  owner: string
  repo: string
  branch: string
  path: string
}

export function toTarget(config: PublishConfig): RepoTarget {
  const [owner, repo] = config.repo.split('/') as [string, string]
  return { owner, repo, branch: config.branch, path: config.path }
}

export function isConfigured(config: { repo: string; branch: string; path: string }): boolean {
  return publishConfigSchema.safeParse(config).success
}
