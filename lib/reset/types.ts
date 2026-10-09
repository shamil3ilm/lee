import { z } from 'zod'

/**
 * Client-safe. Settings › Profile › Reset details: what can be reset, how
 * it is selected and what the preview says. Applications, documents
 * already sent, tailored CVs and discoveries are never resettable here.
 */

export const PROFILE_SECTIONS = ['basics', 'work', 'projects', 'skills', 'education', 'certificates', 'languages'] as const
export type ProfileSection = (typeof PROFILE_SECTIONS)[number]

export const PROFILE_SECTION_LABELS: Readonly<Record<ProfileSection, string>> = {
  basics: 'Basics',
  work: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  certificates: 'Certifications',
  languages: 'Languages',
}

export const RESET_TARGETS = ['overlay', 'readiness', 'links', 'searchPrefs', 'currentJob', 'study', 'variants', 'connections', 'learnedTitles'] as const
export type ResetTarget = (typeof RESET_TARGETS)[number]

export const RESET_TARGET_LABELS: Readonly<Record<ResetTarget, { label: string; help: string }>> = {
  overlay: {
    label: 'lee’s overlay',
    help: 'What lee adds on top of your portfolio: readiness choices waiting for an item, saved wordings, link kinds, and overlay or repo links whose item is gone. Interview-ready flags stay.',
  },
  readiness: {
    label: 'Also reset interview-ready flags',
    help: 'Every skill, project and bullet back to “Not ready / learning” until you confirm it again.',
  },
  links: { label: 'Profile links', help: 'Settings › Profile › Links.' },
  searchPrefs: { label: 'Search preferences', help: 'Back to the defaults; filtering turns off until you save them again.' },
  currentJob: { label: 'Current job details', help: 'Pay, benefits and ratings, and the comparisons you confirmed.' },
  study: { label: 'Study list notes', help: 'Notes, target dates and “what I own” on study items. The items stay.' },
  variants: { label: 'Résumé variants and their versions', help: 'Variants an application used are archived, not deleted, so its history stays.' },
  connections: { label: 'LinkedIn connections', help: 'Every imported connection (referral hints stop).' },
  learnedTitles: { label: 'Learned titles', help: 'Job titles lee learned from your “related” and “not for me” choices.' },
}

export const resetSelectionSchema = z.object({
  profile: z.array(z.enum(PROFILE_SECTIONS)).max(PROFILE_SECTIONS.length),
  targets: z.array(z.enum(RESET_TARGETS)).max(RESET_TARGETS.length),
  importBatchIds: z.array(z.string().uuid()).max(50),
})
export type ResetSelection = z.infer<typeof resetSelectionSchema>

export const CONFIRM_WORD = 'RESET'

/**
 * A full reset needs RESET typed: the whole master profile, the whole
 * overlay, the interview-ready flags, or every resettable thing at once.
 */
export function needsTypedConfirm(sel: ResetSelection): boolean {
  if (sel.profile.length === PROFILE_SECTIONS.length) return true
  if (sel.targets.includes('overlay') || sel.targets.includes('readiness')) return true
  return sel.targets.length === RESET_TARGETS.length
}

export function isEmptySelection(sel: ResetSelection): boolean {
  return sel.profile.length + sel.targets.length + sel.importBatchIds.length === 0
}

export interface ImportBatchView {
  id: string
  source: string
  mode: 'saved' | 'suggested'
  importedAt: string
  counts: Record<string, number>
}

/** Counts per thing (profile sections by name, targets by name, imports by batch id). */
export interface ResetCounts {
  profile: Record<ProfileSection, number>
  targets: Record<ResetTarget, number>
  /** Variants that are archived instead of deleted (used by applications). */
  variantsKept: number
}

/** What a selection would remove: section label → item labels (capped). */
export interface ResetPreview {
  groups: Array<{ label: string; count: number; items: string[] }>
  needsTypedConfirm: boolean
}
