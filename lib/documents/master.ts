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
import { toMasterCv } from '@/lib/resume/derive'
import { fromMasterCv } from '@/lib/resume/legacy'
import { applyMasterCvEdit } from '@/lib/resume/merge-cv'
import { readStoredProfile, saveResumeProfile } from '@/lib/resume/service'

/**
 * The user's master CV. Since the master profile exists (lib/resume) the
 * MasterCV is DERIVED from it — only presentable (interview-ready, or
 * domain-ready in design wording) items. Users who never saved a profile
 * fall back to their legacy `master_cv` document.
 */
export async function getMasterCV(userId: string): Promise<MasterCV | null> {
  const profile = await readStoredProfile(userId)
  if (profile) return toMasterCv(profile)
  const master = await documentsQ.getLatestMaster(userId)
  if (!master) return null
  const parsed = masterCvSchema.safeParse(master.content)
  return parsed.success ? parsed.data : null
}

/**
 * Save a MasterCV-level edit (CV Score autofix). It is applied to the
 * master profile — the one source of facts — and the derived snapshot is
 * returned. A user without a profile gets one built from this CV.
 */
export async function saveMasterCV(userId: string, cv: MasterCV): Promise<Document> {
  const parsed = masterCvSchema.parse(cv)
  const stored = await readStoredProfile(userId)
  const next = stored ? applyMasterCvEdit(stored, parsed) : fromMasterCv(parsed)
  const { masterDocument } = await saveResumeProfile(userId, next)
  const doc = masterDocument ?? (await documentsQ.getLatestMaster(userId))
  if (!doc) throw new Error('master CV snapshot missing after save')
  return doc
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
