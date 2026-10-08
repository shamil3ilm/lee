import { NEW_SOURCE_LABELS, type NewSource } from './types'

/** Run summary of one shared "what's new" source job (Settings › Background jobs, Radar › Sources). Pure. */

export interface WhatsNewRunSummary {
  kind: 'radar-new'
  source: NewSource
  status: 'polled' | 'failed' | 'paused'
  fetched: number
  new: number
  joined: number
  variants: number
  error?: string
  partialErrors?: number
}

export function describeWhatsNewSummary(s: WhatsNewRunSummary): string {
  const label = `What's new · ${NEW_SOURCE_LABELS[s.source] ?? s.source}`
  if (s.status === 'paused') return `${label}: paused by the usage throttle`
  if (s.status === 'failed') return `${label}: failed${s.error ? ` (${s.error})` : ''}`
  const parts = [`${s.fetched} found`, `${s.new} new`]
  if (s.joined > 0) parts.push(`${s.joined} on another source too`)
  if (s.variants > 0) parts.push(`${s.variants} variant(s) folded`)
  if (s.partialErrors) parts.push(`${s.partialErrors} request(s) failed`)
  return `${label}: ${parts.join(' · ')}`
}
