import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'
import type { BriefDraft } from './types'

/**
 * A draft is signed when the citation check has run, so "Confirm" can only
 * save what was checked (the user may remove sentences, never add or edit
 * them). The key is derived from AUTH_SECRET.
 */

type Unsigned = Omit<BriefDraft, 'signature'>

/** JSON with object keys sorted, so key order never changes the signature. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stableStringify(x)}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

function canonical(d: Unsigned): string {
  return stableStringify([d.entryId, d.sections, d.sources, d.timeline, d.promptVersion, d.promptHash, d.dropped])
}

function mac(d: Unsigned): string {
  return createHmac('sha256', `radar-brief:${env.AUTH_SECRET}`).update(canonical(d)).digest('hex')
}

export function signDraft(d: Unsigned): BriefDraft {
  return { ...d, signature: mac(d) }
}

export function verifyDraft(d: BriefDraft): boolean {
  const { signature, ...rest } = d
  const expected = Buffer.from(mac(rest), 'hex')
  const given = /^[0-9a-f]{64}$/i.test(signature ?? '') ? Buffer.from(signature, 'hex') : Buffer.alloc(0)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
