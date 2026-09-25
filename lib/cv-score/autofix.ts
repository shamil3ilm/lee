/**
 * v12.0 — one-click fixes for MASTER CV findings. Never applied silently:
 * `previewAutofix` proposes a structured diff, `applyAutofix` re-validates
 * every change against the CURRENT master and saves a new version.
 *
 * Allowed fixes:
 *   rewrite_bullet — weak-opener bullet rewritten by the AI. Rejected when the
 *                    rewrite introduces a digit run the original didn't have
 *                    (no invented metrics), still opens weakly, or is empty /
 *                    wildly longer.
 *   add_skill      — append a JD keyword to skills.secondary ONLY when the
 *                    term is already evidenced elsewhere in the CV.
 */
import { CV_BULLET_REWRITE_PROMPT_VERSION } from '@/lib/ai/prompts/cv-bullet-rewrite'
import type { AIProvider } from '@/lib/ai/types'
import { saveMasterCV } from '@/lib/documents/master'
import { masterCvSchema, type MasterCV } from '@/lib/documents/types'
import { computeCvScore } from './compute'
import { latestMasterDocument } from './compare'
import { weakOpenerOf } from './dimensions/impact'
import { CvScoreError } from './errors'
import { cvToScorable } from './extract'
import { loadTarget, scoreContextFor } from './score'
import { canonicalize, findSkillsInText } from './synonyms'
import { digitRuns, looseNormalize, wordCount } from './text'

export type AutofixChange =
  | {
      kind: 'rewrite_bullet'
      findingId: string
      path: string
      roleIndex: number
      bulletIndex: number
      before: string
      after: string
    }
  | { kind: 'add_skill'; findingId: string; path: 'skills.secondary'; term: string; before: null; after: string }

export interface AutofixRejection {
  findingId: string
  reason: string
}

export interface AutofixPreview {
  baseDocumentId: string
  baseVersion: number
  changes: AutofixChange[]
  rejected: AutofixRejection[]
  proposed: MasterCV
}

// ---------------------------------------------------------------------------
// Pure guards
// ---------------------------------------------------------------------------

/** Reason a rewrite is unsafe, or null when it is acceptable. */
export function rewriteRejection(before: string, after: string): string | null {
  const a = after.trim()
  if (!a) return 'empty rewrite'
  if (looseNormalize(a) === looseNormalize(before)) return 'rewrite is identical'
  const allowed = new Set(digitRuns(before))
  const invented = digitRuns(a).filter((d) => !allowed.has(d))
  if (invented.length) return `rewrite adds numbers not in the original (${invented.join(', ')})`
  if (weakOpenerOf(a)) return 'rewrite still opens with a weak phrase'
  if (wordCount(a) > Math.max(40, wordCount(before) * 2.5)) return 'rewrite is much longer than the original'
  return null
}

function skillSet(cv: MasterCV): Set<string> {
  return new Set([...cv.skills.primary, ...(cv.skills.secondary ?? [])].map(canonicalize))
}

/** Text of the CV outside the Skills section (evidence of real usage). */
function evidenceText(cv: MasterCV): string {
  return [
    cv.basics.headline,
    cv.summary,
    ...cv.experience.flatMap((e) => [e.role, ...e.bullets, ...(e.tech ?? [])]),
    ...(cv.projects ?? []).flatMap((p) => [p.name, p.description, ...(p.tech ?? []), ...(p.highlights ?? [])]),
  ].join('\n')
}

export function termEvidenced(cv: MasterCV, term: string): boolean {
  const canon = canonicalize(term)
  const text = evidenceText(cv)
  if (findSkillsInText(text).has(canon)) return true
  for (const e of cv.experience) for (const t of e.tech ?? []) if (canonicalize(t) === canon) return true
  const t = looseNormalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return t.length >= 2 && new RegExp(`(?<![a-z0-9])${t}(?![a-z0-9])`).test(looseNormalize(text))
}

export function addSkillRejection(cv: MasterCV, term: string): string | null {
  if (skillSet(cv).has(canonicalize(term))) return 'already listed in Skills'
  if (!termEvidenced(cv, term)) return 'no evidence of this skill elsewhere in the CV'
  return null
}

/** Apply changes immutably. Throws CvScoreError on a malformed change. */
export function applyChanges(cv: MasterCV, changes: AutofixChange[]): MasterCV {
  let experience = cv.experience
  let secondary = cv.skills.secondary ?? []
  for (const c of changes) {
    if (c.kind === 'rewrite_bullet') {
      const role = experience[c.roleIndex]
      if (!role || c.bulletIndex < 0 || c.bulletIndex >= role.bullets.length) {
        throw new CvScoreError('invalid_change', 'A proposed change no longer matches your CV.', 409)
      }
      experience = experience.map((e, i) =>
        i === c.roleIndex ? { ...e, bullets: e.bullets.map((b, j) => (j === c.bulletIndex ? c.after.trim() : b)) } : e,
      )
    } else {
      secondary = [...secondary, c.term]
    }
  }
  return {
    ...cv,
    experience,
    skills: { ...cv.skills, ...(secondary.length ? { secondary } : {}) },
  }
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface PreviewInput {
  userId: string
  applicationId?: string | null
  findingIds?: string[]
  ai: AIProvider | null
  now?: Date
}

async function loadMaster(userId: string): Promise<{ id: string; version: number; cv: MasterCV }> {
  const doc = await latestMasterDocument(userId)
  if (!doc) throw new CvScoreError('no_master_cv', 'Create your master CV first.', 404)
  const parsed = masterCvSchema.safeParse(doc.content)
  if (!parsed.success) throw new CvScoreError('invalid_document', 'Your master CV is malformed.', 422)
  return { id: doc.id, version: doc.version, cv: parsed.data }
}

export async function previewAutofix(input: PreviewInput): Promise<AutofixPreview> {
  const master = await loadMaster(input.userId)
  const target = await loadTarget(input.userId, input.applicationId)
  const ctx = await scoreContextFor(input.userId, true, input.now)
  const result = computeCvScore({
    cv: cvToScorable({ kind: 'master_cv', cv: master.cv }),
    target,
    ctx,
    source: { kind: 'master_cv', documentId: master.id, label: 'Master CV' },
  })
  const wanted = input.findingIds ? new Set(input.findingIds) : null
  const fixable = result.findings.filter((f) => f.autoFixable && f.fix && (!wanted || wanted.has(f.id)))

  const changes: AutofixChange[] = []
  const rejected: AutofixRejection[] = []
  const pending: { findingId: string; roleIndex: number; bulletIndex: number; text: string }[] = []

  for (const f of fixable) {
    const fix = f.fix!
    if (fix.kind === 'add_skill') {
      const already = changes.some((c) => c.kind === 'add_skill' && canonicalize(c.term) === canonicalize(fix.term))
      const reason = already ? 'duplicate' : addSkillRejection(master.cv, fix.term)
      if (reason) rejected.push({ findingId: f.id, reason })
      else changes.push({ kind: 'add_skill', findingId: f.id, path: 'skills.secondary', term: fix.term, before: null, after: fix.term })
      continue
    }
    const text = master.cv.experience[fix.roleIndex]?.bullets[fix.bulletIndex]
    if (!text) {
      rejected.push({ findingId: f.id, reason: 'bullet not found' })
      continue
    }
    if (wordCount(text) < 4) {
      // Signal gate: too little to rewrite without inventing content.
      rejected.push({ findingId: f.id, reason: 'bullet too short to rewrite safely — edit it manually' })
      continue
    }
    pending.push({ findingId: f.id, roleIndex: fix.roleIndex, bulletIndex: fix.bulletIndex, text })
  }

  if (pending.length) {
    if (!input.ai) {
      for (const p of pending) rejected.push({ findingId: p.findingId, reason: 'AI unavailable' })
    } else {
      try {
        const res = await input.ai.rewriteCvBullets(
          {
            bullets: pending.map((p) => ({
              id: p.findingId,
              text: p.text,
              role: master.cv.experience[p.roleIndex]?.role,
              company: master.cv.experience[p.roleIndex]?.company,
            })),
          },
          {
            userId: input.userId,
            kind: 'cv_bullet_rewrite',
            promptVersion: CV_BULLET_REWRITE_PROMPT_VERSION,
            signalCheckPassed: true,
          },
        )
        const byId = new Map(res.rewrites.map((r) => [r.id, r.text]))
        for (const p of pending) {
          const after = byId.get(p.findingId)
          const reason = after === undefined ? 'no rewrite returned' : rewriteRejection(p.text, after)
          if (reason || after === undefined) rejected.push({ findingId: p.findingId, reason: reason ?? 'no rewrite returned' })
          else {
            changes.push({
              kind: 'rewrite_bullet',
              findingId: p.findingId,
              path: `experience[${p.roleIndex}].bullets[${p.bulletIndex}]`,
              roleIndex: p.roleIndex,
              bulletIndex: p.bulletIndex,
              before: p.text,
              after: after.trim(),
            })
          }
        }
      } catch {
        for (const p of pending) rejected.push({ findingId: p.findingId, reason: 'AI rewrite failed — try again later' })
      }
    }
  }

  return {
    baseDocumentId: master.id,
    baseVersion: master.version,
    changes,
    rejected,
    proposed: applyChanges(master.cv, changes),
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export async function applyAutofix(input: {
  userId: string
  baseDocumentId: string
  changes: AutofixChange[]
}): Promise<{ documentId: string; version: number; applied: number }> {
  if (input.changes.length === 0) throw new CvScoreError('no_changes', 'Select at least one change to apply.', 400)
  const master = await loadMaster(input.userId)
  if (master.id !== input.baseDocumentId) {
    throw new CvScoreError('stale_base', 'Your master CV changed since this preview — preview again.', 409)
  }
  const seen = new Set<string>()
  for (const c of input.changes) {
    const key = c.kind === 'rewrite_bullet' ? `b:${c.roleIndex}:${c.bulletIndex}` : `s:${canonicalize(c.term)}`
    if (seen.has(key)) throw new CvScoreError('duplicate_change', 'The same change was submitted twice.', 400)
    seen.add(key)
    if (c.kind === 'rewrite_bullet') {
      const current = master.cv.experience[c.roleIndex]?.bullets[c.bulletIndex]
      if (current === undefined || current !== c.before) {
        throw new CvScoreError('stale_base', 'Your master CV changed since this preview — preview again.', 409)
      }
      const reason = rewriteRejection(c.before, c.after)
      if (reason) throw new CvScoreError('unsafe_change', `A rewrite was rejected: ${reason}.`, 422)
    } else {
      const reason = addSkillRejection(master.cv, c.term)
      if (reason) throw new CvScoreError('unsafe_change', `Can't add "${c.term}": ${reason}.`, 422)
    }
  }
  const next = applyChanges(master.cv, input.changes)
  const doc = await saveMasterCV(input.userId, next)
  return { documentId: doc.id, version: doc.version, applied: input.changes.length }
}
