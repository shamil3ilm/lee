// Build a project .zip in the browser ("Download project (.zip)"), with
// the same folder layout an import reads, so a project round-trips to
// Overleaf. fflate is lazy-loaded with the export action.

import { zipSync, type Zippable } from 'fflate'
import type { ProjectEntry } from './plan'

/** Fixed timestamp so the same project always zips to the same bytes. */
const MTIME = new Date('2026-01-01T00:00:00Z')

export function buildProjectZip(entries: readonly ProjectEntry[]): Uint8Array<ArrayBuffer> {
  const files: Zippable = {}
  for (const e of entries) files[e.path] = [e.bytes, { level: /\.(png|jpe?g|pdf|otf|ttf)$/i.test(e.path) ? 0 : 6, mtime: MTIME }]
  return zipSync(files)
}
