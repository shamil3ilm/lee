import { canonicalJson } from '@/lib/portfolio/canonical'
import type { ResumeProfile } from '@/lib/resume/types'
import type { MatchJob } from '@/lib/discovery/match/types'
import { BEST_CV_VERSION } from './version'

/**
 * Keys for the stored best CV. A row is current while its key equals:
 *   discoveries   bestCvKey(profile, variants)            — a new JD on a
 *                 discovery clears the row's key (lib/db/queries/discoveryMatch)
 *   applications  bestCvKey(…) + ':' + jdHash(job)        — the job is
 *                 editable, so its JD is part of the key
 * Any profile save, variant save, rename, archive or rules bump moves the key.
 */

export interface KeyedVariant {
  id: string
  version: number
  name: string
  region: string
}

/** FNV-1a, 32-bit: short and stable (no Node crypto, so it is client-safe). */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function bestCvKey(profile: ResumeProfile, variants: readonly KeyedVariant[]): string {
  const vs = [...variants]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((v) => [v.id, v.version, v.name, v.region])
  return `${BEST_CV_VERSION}:${fnv1a(canonicalJson(profile))}:${fnv1a(JSON.stringify(vs))}`
}

/** The JD as the scorer reads it (title, place, description, stack). */
export function jdHash(job: MatchJob): string {
  return fnv1a(JSON.stringify([job.title, job.location ?? '', job.remoteType ?? '', job.descriptionMd ?? '', [...(job.techStack ?? [])]]))
}

export function applicationKey(userKey: string, job: MatchJob): string {
  return `${userKey}:${jdHash(job)}`
}
