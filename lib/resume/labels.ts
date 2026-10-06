import type { LanguageFluency } from './types'

/** JSON Resume `fluency` text per level (client-safe). */
const FLUENCY_LABELS: Readonly<Record<LanguageFluency, string>> = {
  basic: 'Elementary',
  conversational: 'Conversational',
  professional: 'Professional working proficiency',
  fluent: 'Fluent',
  native: 'Native speaker',
}

export function fluencyLabel(f: LanguageFluency): string {
  return FLUENCY_LABELS[f]
}

/** Free-text proficiency ("Native", "C1", "fluent") → level; defaults to professional. */
export function parseFluency(text: string): LanguageFluency {
  const t = text.toLowerCase()
  if (/native|mother|c2/.test(t)) return 'native'
  if (/fluent|bilingual|c1/.test(t)) return 'fluent'
  if (/conversational|intermediate|limited|b1|b2/.test(t)) return 'conversational'
  if (/basic|elementary|beginner|a1|a2/.test(t)) return 'basic'
  return 'professional'
}
