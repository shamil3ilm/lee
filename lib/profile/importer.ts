import type { AIProvider } from '@/lib/ai'
import * as profileQ from '@/lib/db/queries/profile'
import type { ImportItem } from '@/lib/import/types'
import { getResumeProfile } from '@/lib/resume/service'
import { buildCvImportItems, cvProposalFrom, type CvImportContext, type CvProposal } from './cv-import'

/**
 * SERVER-ONLY. CV / profile-markdown import, step 1: parse through the AI
 * provider into a proposal and review items. Nothing is saved; the user
 * confirms items and applyCvImportAction applies them (lib/profile/cv-import.ts).
 */

export interface ParseCvImportArgs {
  userId: string
  cvText?: string
  profileMd?: string
  ai: AIProvider
}

export async function cvImportContext(userId: string): Promise<CvImportContext> {
  const [row, { profile: resume }] = await Promise.all([profileQ.get(userId), getResumeProfile(userId)])
  return {
    headline: row?.headline ?? null,
    summaryMd: row?.summaryMd ?? null,
    skills: row?.skills ?? [],
    industries: row?.industries ?? [],
    roleTypes: row?.roleTypes ?? [],
    seniority: row?.seniority ?? null,
    yearsExperience: row?.yearsExperience ?? null,
    stackWeights: (row?.stackWeights ?? {}) as Record<string, number>,
    resume,
  }
}

export async function parseCvImport(args: ParseCvImportArgs): Promise<{ proposal: CvProposal; items: ImportItem[] }> {
  const parsed = await args.ai.parseProfile({ cvText: args.cvText, profileMd: args.profileMd })
  const proposal = cvProposalFrom(parsed)
  return { proposal, items: buildCvImportItems(proposal, await cvImportContext(args.userId)) }
}
