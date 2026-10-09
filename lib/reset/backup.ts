import { db } from '@/lib/db/client'
import { linkedinConnections } from '@/lib/db/schema'
import * as variantQ from '@/lib/db/queries/variantReset'
import { eq } from 'drizzle-orm'
import { studyList } from '@/lib/resume/study'
import { searchPrefsOf } from './search-defaults'
import type { ResetState } from './state'
import type { ResetSelection } from './types'

/**
 * SERVER-ONLY. "Download a backup first": the data a selection would
 * reset, as JSON the browser saves before anything is removed. Only the
 * selected parts; never applications, documents or discoveries.
 */

export const BACKUP_FORMAT = 'lee-reset-backup/1'

export interface ResetBackup {
  format: typeof BACKUP_FORMAT
  exportedAt: string
  selection: ResetSelection
  data: Record<string, unknown>
}

export async function buildBackup(userId: string, s: ResetState, sel: ResetSelection, now: Date = new Date()): Promise<ResetBackup> {
  const data: Record<string, unknown> = {}
  if (sel.profile.length > 0 && s.resume) {
    data.masterProfile = Object.fromEntries(sel.profile.map((p) => [p, s.resume![p]]))
  }
  const t = new Set(sel.targets)
  if (t.has('overlay')) {
    data.overlay = {
      resume: s.resume,
      linkKinds: s.links.map((l) => ({ id: l.id, url: l.url, kind: l.kind })),
      intentions: s.intentions,
      orphanRepoLinks: s.orphanRepoLinks,
    }
  }
  if (t.has('readiness') && s.resume) data.readiness = s.resume
  if (t.has('links')) data.links = s.links
  if (t.has('searchPrefs')) data.searchPrefs = searchPrefsOf(s.row)
  if (t.has('currentJob')) data.currentJob = { currentJob: s.currentJob, narratives: s.narratives }
  if (t.has('study')) data.study = s.resume ? studyList(s.resume) : []
  if (t.has('learnedTitles')) data.learnedTitles = s.row?.learnedTitles ?? {}
  if (t.has('variants')) {
    const versions = await variantQ.versionsOf(userId, s.variants.map((v) => v.id))
    data.variants = s.variants.map((v) => ({
      name: v.name,
      region: v.region,
      roleFamily: v.roleFamily,
      archived: v.archivedAt !== null,
      versions: versions.filter((x) => x.variantId === v.id).map((x) => ({ version: x.version, createdAt: x.createdAt.toISOString(), recipe: x.recipe })),
    }))
  }
  if (t.has('connections')) {
    data.connections = await db
      .select({ name: linkedinConnections.name, company: linkedinConnections.company, position: linkedinConnections.position, connectedOn: linkedinConnections.connectedOn, email: linkedinConnections.email })
      .from(linkedinConnections)
      .where(eq(linkedinConnections.userId, userId))
  }
  if (sel.importBatchIds.length > 0) {
    data.imports = s.batches
      .filter((b) => sel.importBatchIds.includes(b.id))
      .map((b) => ({ source: b.source, mode: b.mode, importedAt: b.importedAt.toISOString(), counts: b.counts, intentions: b.intentions, changes: b.changes }))
    if (s.resume) data.masterProfileAtBackup = s.resume
  }
  return { format: BACKUP_FORMAT, exportedAt: now.toISOString(), selection: sel, data }
}
