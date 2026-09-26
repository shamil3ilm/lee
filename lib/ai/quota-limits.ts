/**
 * Published free-tier limits, used when a provider does not report its own
 * limits in response headers (Gemini) and to fill dimensions the headers do
 * not cover (Groq reports RPD + TPM only; RPM and TPD come from here).
 *
 * Provider headers, when present, always win over these constants.
 */

export const QUOTA_WARN = 0.7
export const QUOTA_CRITICAL = 0.9

export const GROQ_RATE_LIMITS_URL = 'https://console.groq.com/docs/rate-limits'
export const GEMINI_RATE_LIMITS_URL = 'https://ai.google.dev/gemini-api/docs/rate-limits'
export const LIMITS_LAST_VERIFIED = '2026-09-26'

export interface FreeTierLimit {
  provider: string
  /** Exact model id, or a prefix/substring matched in order (see matchers). */
  label: string
  rpm?: number
  rpd?: number
  tpm?: number
  tpd?: number
  audioSecondsPerHour?: number
  audioSecondsPerDay?: number
  /** Provider bills shorter audio as this many seconds. */
  minBilledAudioSeconds?: number
  /** How the provider counts a "day". */
  dayWindow: 'rolling_24h' | 'midnight_pacific'
  /** True when the numbers are not confirmed by the provider's current docs. */
  approximate: boolean
  source: string
  lastVerified: string
}

const GROQ_TEXT: Omit<FreeTierLimit, 'label'> = {
  provider: 'groq',
  rpm: 30,
  rpd: 1_000,
  tpm: 8_000,
  tpd: 200_000,
  dayWindow: 'rolling_24h',
  approximate: false,
  source: GROQ_RATE_LIMITS_URL,
  lastVerified: LIMITS_LAST_VERIFIED,
}

const GROQ_WHISPER: Omit<FreeTierLimit, 'label'> = {
  provider: 'groq',
  rpm: 20,
  rpd: 2_000,
  audioSecondsPerHour: 7_200,
  audioSecondsPerDay: 28_800,
  // https://console.groq.com/docs/speech-to-text — "Minimum Billed Length: 10 seconds".
  minBilledAudioSeconds: 10,
  dayWindow: 'rolling_24h',
  approximate: false,
  source: GROQ_RATE_LIMITS_URL,
  lastVerified: LIMITS_LAST_VERIFIED,
}

/**
 * Gemini: the rate-limits page no longer publishes per-model free-tier
 * numbers (it links to AI Studio → Rate limit) and the API returns no
 * rate-limit headers. These are the last published free-tier values for the
 * Flash / Flash-Lite families — APPROXIMATE, re-check in AI Studio. RPD
 * resets at midnight Pacific per the docs.
 */
const GEMINI_FLASH: Omit<FreeTierLimit, 'label'> = {
  provider: 'gemini',
  rpm: 10,
  rpd: 250,
  tpm: 250_000,
  dayWindow: 'midnight_pacific',
  approximate: true,
  source: GEMINI_RATE_LIMITS_URL,
  lastVerified: LIMITS_LAST_VERIFIED,
}

const GEMINI_FLASH_LITE: Omit<FreeTierLimit, 'label'> = {
  ...GEMINI_FLASH,
  rpm: 15,
  rpd: 1_000,
}

type Matcher = { provider: string; test: (model: string) => boolean; limit: Omit<FreeTierLimit, 'label'> }

// Order matters: flash-lite before flash.
const MATCHERS: Matcher[] = [
  { provider: 'groq', test: (m) => m === 'openai/gpt-oss-20b' || m === 'openai/gpt-oss-120b', limit: GROQ_TEXT },
  { provider: 'groq', test: (m) => m.startsWith('whisper-large-v3'), limit: GROQ_WHISPER },
  { provider: 'gemini', test: (m) => /flash-lite/.test(m), limit: GEMINI_FLASH_LITE },
  { provider: 'gemini', test: (m) => /flash/.test(m), limit: GEMINI_FLASH },
]

export function freeTierLimitFor(provider: string, model: string): FreeTierLimit | null {
  const hit = MATCHERS.find((m) => m.provider === provider && m.test(model))
  return hit ? { ...hit.limit, label: model } : null
}
