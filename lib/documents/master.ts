import * as documentsQ from '@/lib/db/queries/documents'
import * as profileQ from '@/lib/db/queries/profile'
import { fetchPublicRepos } from '@/lib/github/adapter'
import type { AIProvider } from '@/lib/ai/types'
import {
  masterCvSchema,
  type CvProjects,
  type MasterCV,
} from './types'
import type { Document } from '@/lib/db/queries/documents'

/**
 * Returns the latest master CV for a user, or null if none has been saved.
 * "Latest" = highest version among documents with kind='master_cv' and
 * applicationId=null.
 */
export async function getMasterCV(userId: string): Promise<MasterCV | null> {
  const rows = await documentsQ.list(userId, { kind: 'master_cv' })
  // documents.list orders by createdAt desc, but we want the highest version.
  const master = rows
    .filter((r) => r.applicationId === null)
    .sort((a, b) => b.version - a.version)[0]
  if (!master) return null
  return masterCvSchema.parse(master.content)
}

export async function saveMasterCV(userId: string, cv: MasterCV): Promise<Document> {
  const parsed = masterCvSchema.parse(cv)
  const version = await documentsQ.nextVersion(userId, null, 'master_cv')
  return documentsQ.create(userId, {
    applicationId: null,
    kind: 'master_cv',
    version,
    title: `Master CV v${version}`,
    content: parsed,
  })
}

/**
 * Constructs a starter MasterCV from the user_profile row. Does NOT persist —
 * the caller shows this to the user for review, then calls saveMasterCV.
 */
export async function bootstrapFromProfile(userId: string): Promise<MasterCV> {
  const profile = await profileQ.get(userId)
  const headline = profile?.headline ?? 'Software Engineer'
  const summary = profile?.summaryMd ?? ''
  const primary = (profile?.skills ?? []).slice(0, 8)
  const secondary = (profile?.skills ?? []).slice(8)
  return {
    basics: {
      name: '',
      headline,
    },
    summary,
    experience: [],
    skills: {
      primary,
      secondary: secondary.length ? secondary : undefined,
    },
  }
}

/**
 * Fetches a user's public GitHub repos and asks the AI to distill 3-5
 * portfolio-worthy projects. Returns a proposal; the caller merges into the
 * master CV after review.
 */
export async function syncFromGithub(input: {
  userId: string
  username: string
  ai: AIProvider
  token?: string
}): Promise<{ proposed: CvProjects }> {
  const repos = await fetchPublicRepos(input.username, input.token)
  // Prefer well-starred, recently active repos; cap at 10 for the prompt.
  const shortlist = [...repos]
    .sort((a, b) => b.stargazers - a.stargazers)
    .slice(0, 10)
  const proposed = await input.ai.distillGithubProjects({ repos: shortlist })
  return { proposed }
}
