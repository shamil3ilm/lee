import type { Tone } from '@/lib/ui/tones'

/**
 * Networking pipeline for contacts. Client-safe. Stored in
 * `contacts.pipeline_stage`; `null` means "to contact" so every existing
 * contact starts in the first column without a backfill.
 */
export const CONTACT_STAGES = ['to_contact', 'contacted', 'replied', 'meeting', 'referral'] as const
export type ContactStage = (typeof CONTACT_STAGES)[number]

export const CONTACT_STAGE_LABELS: Record<ContactStage, string> = {
  to_contact: 'To contact',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  referral: 'Referral',
}

export const CONTACT_STAGE_TONE: Record<ContactStage, Tone> = {
  to_contact: 'neutral',
  contacted: 'applied',
  replied: 'screen',
  meeting: 'interview',
  referral: 'success',
}

export function isContactStage(v: string): v is ContactStage {
  return (CONTACT_STAGES as readonly string[]).includes(v)
}

/** Column for a stored value (unknown or null → To contact). */
export function contactStageOf(stored: string | null | undefined): ContactStage {
  return stored && isContactStage(stored) ? stored : 'to_contact'
}

/** Value to store for a column (To contact → null). */
export function storedContactStage(stage: ContactStage): string | null {
  return stage === 'to_contact' ? null : stage
}
