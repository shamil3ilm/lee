import { repairMojibake } from '@/lib/discovery/relevance/text'

/**
 * Text decoding for job-board responses, done once at the source so stored
 * discoveries hold real characters ("دبي", "Zürich"), not mojibake
 * ("Ø¯Ø¨ÙŠ", "ZÃ¼rich"). The relevance gate still runs `repairMojibake` on
 * what it reads, as a fallback for rows stored before this existed.
 */

/** The `charset=` of a Content-Type header, lower-cased; null when absent. */
export function charsetOf(contentType: string | null): string | null {
  const m = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(contentType ?? '')
  return m ? m[1]!.toLowerCase() : null
}

/**
 * Bytes → text. Honours a declared charset; without one, UTF-8 (BOM
 * stripped), falling back to Windows-1252 when the bytes are not valid UTF-8.
 */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const declared = charsetOf(contentType)
  if (declared && declared !== 'utf-8' && declared !== 'utf8') {
    try {
      return new TextDecoder(declared).decode(bytes)
    } catch {
      // Unknown label: fall through to the UTF-8 path.
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Reads a fetch Response as JSON, decoding its bytes with `decodeBody`. */
export async function readJson(res: Response): Promise<unknown> {
  const bytes = new Uint8Array(await res.arrayBuffer())
  return JSON.parse(decodeBody(bytes, res.headers.get('content-type')))
}

/**
 * One text field from a board: double-encoded UTF-8 repaired, Unicode
 * composed (NFC) so "é" is one character, surrounding space trimmed.
 */
export function cleanText(value: string): string {
  return repairMojibake(value).normalize('NFC').trim()
}

/** `cleanText` for optional fields; empty results become undefined. */
export function cleanOptional(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const out = cleanText(value)
  return out === '' ? undefined : out
}
