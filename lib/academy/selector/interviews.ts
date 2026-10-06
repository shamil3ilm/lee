/**
 * Interview stage kind → skill domains to practise (v13 §9). Covers the
 * stage kinds the forms offer (lib/stages/kinds.ts) and the legacy kinds
 * prep packs still use. Pure, client-safe.
 */

const STAGE_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  system_design: ['system_design', 'performance'],
  live_coding: ['foundations', 'languages'],
  tech_screen: ['foundations', 'data'],
  technical: ['foundations', 'data', 'languages'],
  take_home: ['quality', 'backend'],
  onsite: ['system_design', 'foundations', 'collaboration'],
  final: ['system_design', 'collaboration'],
  phone_screen: ['collaboration'],
  recruiter_screen: ['collaboration'],
  behavioral: ['collaboration'],
}

export const STAGE_KIND_LABELS: Readonly<Record<string, string>> = {
  system_design: 'System design',
  live_coding: 'Live coding',
  tech_screen: 'Technical screen',
  technical: 'Technical',
  take_home: 'Take-home',
  onsite: 'Onsite',
  final: 'Final',
  phone_screen: 'Phone screen',
  recruiter_screen: 'Recruiter screen',
  behavioral: 'Behavioral',
  other: 'Other',
}

export const INTERVIEW_WINDOW_DAYS = 7

export function domainsForStage(kind: string): string[] {
  return [...(STAGE_DOMAINS[kind] ?? [])]
}

export function stageKindLabel(kind: string): string {
  return STAGE_KIND_LABELS[kind] ?? 'Interview'
}
