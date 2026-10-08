/** Google Search's AI Mode, opened by the user in their own browser. Client-safe, no imports. */

export const AI_MODE_BASE_URL = 'https://www.google.com/search'
/** Google Search's AI Mode tab. */
export const AI_MODE_UDM = '50'
export const MAX_PROMPT_LENGTH = 1000

/** A plain https link the user opens in a new tab of their own browser. */
export function aiModeSearchUrl(prompt: string): string {
  const q = prompt.trim().slice(0, MAX_PROMPT_LENGTH)
  return `${AI_MODE_BASE_URL}?udm=${AI_MODE_UDM}&q=${encodeURIComponent(q)}`
}
