/** Client-safe. Post text lee keeps is capped: a snippet, never a full body. */

export const MAX_SNIPPET_BYTES = 1_000

const encoder = new TextEncoder()

/** `text` cut to at most `max` UTF-8 bytes, on a character boundary, with "…" when cut. */
export function capBytes(text: string, max: number = MAX_SNIPPET_BYTES): string {
  const trimmed = text.trim()
  if (encoder.encode(trimmed).length <= max) return trimmed
  let out = ''
  let bytes = 0
  const budget = max - 3 // room for "…"
  for (const ch of trimmed) {
    const n = encoder.encode(ch).length
    if (bytes + n > budget) break
    out += ch
    bytes += n
  }
  return `${out.trimEnd()}…`
}
