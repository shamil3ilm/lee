import type { AcademyContent } from './content/catalog'

/**
 * Versions recorded on every attempt (v13 §10.1) so an old attempt can be
 * replayed on the exact engine and content it was played on. Bump the engine
 * version when scoring, rating or selection behaviour changes; bump
 * content/academy/manifest.json when any content file changes.
 */
export const ACADEMY_ENGINE_VERSION = '13.0.0'

/** "academy-core@13.0.0". */
export function contentVersion(content: Pick<AcademyContent, 'packName' | 'packVersion'>): string {
  return `${content.packName}@${content.packVersion}`
}
