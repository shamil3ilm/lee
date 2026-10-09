import { importSourceLabel } from '@/lib/import/labels'
import { batchItemLabels } from '@/lib/import/provenance'
import { readLinkedProfile } from '@/lib/profile/url-import'
import { shortDate } from '@/lib/ui/date'
import { changedSearchPrefs } from './search-defaults'
import { overlayCounts, sectionCount, sectionLabels, studyNoteLabels } from './profile'
import type { ResetState } from './state'
import {
  needsTypedConfirm,
  PROFILE_SECTION_LABELS,
  PROFILE_SECTIONS,
  RESET_TARGET_LABELS,
  RESET_TARGETS,
  type ImportBatchView,
  type ResetCounts,
  type ResetPreview,
  type ResetSelection,
  type ResetTarget,
} from './types'

/**
 * SERVER-ONLY (reads the loaded state), no writes. Counts for the panel and
 * the exact list of what a selection removes.
 */

const SHOW = 25

/** Variants a reset deletes, and the ones it archives instead (used or published). */
export function variantPlan(s: ResetState): { remove: string[]; archive: string[]; keptNames: string[] } {
  const keep = (v: ResetState['variants'][number]): boolean => s.usedVariantIds.has(v.id) || v.portfolioPublishedAt !== null
  return {
    remove: s.variants.filter((v) => !keep(v)).map((v) => v.id),
    archive: s.variants.filter((v) => keep(v) && v.archivedAt === null).map((v) => v.id),
    keptNames: s.variants.filter(keep).map((v) => v.name),
  }
}

function targetLabels(s: ResetState, t: ResetTarget): string[] {
  switch (t) {
    case 'overlay': {
      const c = s.resume ? overlayCounts(s.resume, s.links) : { readiness: 0, wordings: 0, linkKinds: 0 }
      const lines = [
        c.wordings ? `${c.wordings} saved wording(s)` : '',
        c.linkKinds ? `${c.linkKinds} link kind(s) back to the default` : '',
        s.portfolioOrphans ? `${s.portfolioOrphans} overlay entr(ies) of items your portfolio removed` : '',
        ...s.intentions.map((i) => `Readiness choice for “${i.name}”${s.orphanIntentions.includes(i) ? ' (item not in your profile)' : ''}`),
        ...s.orphanRepoLinks.map((r) => `Repo link ${r} (project is gone)`),
      ]
      return lines.filter(Boolean)
    }
    case 'readiness': {
      const n = s.resume ? overlayCounts(s.resume, s.links).readiness : 0
      return n ? [`${n} readiness flag(s) back to “Not ready / learning”`] : []
    }
    case 'links':
      return s.links.map((l) => `${l.label} (${l.url})`)
    case 'searchPrefs':
      return changedSearchPrefs(s.row)
    case 'currentJob':
      return s.currentJob ? ['Your current job'] : []
    case 'study':
      return s.resume ? studyNoteLabels(s.resume) : []
    case 'variants': {
      const plan = variantPlan(s)
      const byId = new Map(s.variants.map((v) => [v.id, v.name]))
      return [...plan.remove.map((id) => `${byId.get(id)} (deleted with its versions)`), ...plan.archive.map((id) => `${byId.get(id)} (archived: used by an application)`)]
    }
    case 'connections':
      return s.connections > 0 ? [`${s.connections.toLocaleString('en-US')} connection(s)`] : []
    case 'learnedTitles':
      return Object.keys((s.row?.learnedTitles ?? {}) as Record<string, unknown>)
  }
}

function targetCount(s: ResetState, t: ResetTarget): number {
  if (t === 'connections') return s.connections
  const c = s.resume ? overlayCounts(s.resume, s.links) : { readiness: 0, wordings: 0, linkKinds: 0 }
  if (t === 'overlay') return c.wordings + c.linkKinds + s.intentions.length + s.portfolioOrphans + s.orphanRepoLinks.length
  if (t === 'readiness') return c.readiness
  return targetLabels(s, t).length
}

export function resetCounts(s: ResetState): ResetCounts {
  const profile = Object.fromEntries(PROFILE_SECTIONS.map((p) => [p, s.resume ? sectionCount(s.resume, p) : 0])) as ResetCounts['profile']
  const targets = Object.fromEntries(RESET_TARGETS.map((t) => [t, targetCount(s, t)])) as ResetCounts['targets']
  return { profile, targets, variantsKept: variantPlan(s).archive.length }
}

export function batchViews(s: ResetState): ImportBatchView[] {
  return s.batches.map((b) => ({
    id: b.id,
    source: b.source,
    mode: b.mode === 'saved' ? 'saved' : 'suggested',
    importedAt: b.importedAt.toISOString(),
    counts: b.counts,
  }))
}

function batchLines(s: ResetState, id: string): string[] {
  const b = s.batches.find((x) => x.id === id)
  if (!b) return []
  const lines: string[] = []
  if (b.mode === 'saved' && s.resume && s.editable) lines.push(...batchItemLabels(s.resume, { source: b.source, importedAt: b.importedAt.toISOString() }))
  const intentions = Array.isArray(b.intentions) ? b.intentions.length : 0
  if (intentions) lines.push(`${intentions} readiness choice(s) waiting for the portfolio`)
  const linked = readLinkedProfile(s.row?.linkedProfile)
  if (linked?.fetchedAt === b.importedAt.toISOString()) lines.push('Page evidence from this import')
  const changes = b.changes as Record<string, unknown>
  if (changes.connections) lines.push('Connections this import added')
  if ('linkedinImportBefore' in changes) lines.push('LinkedIn headline, About and positions (for the optimizer)')
  for (const k of ['headline', 'summaryMd', 'seniority', 'yearsExperience'] as const) if (changes[k]) lines.push(`${k} back to its previous value`)
  for (const k of ['skillsAdded', 'industriesAdded', 'roleTypesAdded', 'linksAdded'] as const) {
    const v = changes[k]
    if (Array.isArray(v) && v.length) lines.push(`${v.length} ${k.replace('Added', '')} added by this import`)
  }
  return lines
}

export function previewReset(s: ResetState, sel: ResetSelection): ResetPreview {
  const groups: ResetPreview['groups'] = []
  const push = (label: string, items: string[], count = items.length): void => {
    if (count > 0) groups.push({ label, count, items: items.slice(0, SHOW) })
  }
  if (s.editable && s.resume) for (const p of sel.profile) push(`Master profile: ${PROFILE_SECTION_LABELS[p]}`, sectionLabels(s.resume, p), sectionCount(s.resume, p))
  for (const id of sel.importBatchIds) {
    const b = s.batches.find((x) => x.id === id)
    if (b) push(`Import: ${importSourceLabel(b.source)}, ${shortDate(b.importedAt)}`, batchLines(s, id))
  }
  for (const t of sel.targets) push(RESET_TARGET_LABELS[t].label, targetLabels(s, t), targetCount(s, t))
  return { groups, needsTypedConfirm: needsTypedConfirm(sel) }
}
