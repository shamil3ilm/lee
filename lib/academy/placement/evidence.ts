import type { Depth, ResumeProfile } from '@/lib/resume/types'

/**
 * The master profile cut into evidence units, each carrying the PRIVATE
 * readiness flags of the item it came from (lib/resume/types.ts). Placement
 * reads these flags; it never writes them. Pure.
 *
 * Strength of a unit:
 *   full    interviewReady (any depth): the user says they can explain the
 *           implementation, so it may seed a rating.
 *   domain  own work that is domain-ready only: weak evidence, seeds low.
 *   study   ai_assisted / learning and not interview-ready: a study target,
 *           NEVER proficiency evidence (even when domain-ready: owning the
 *           design is not owning the implementation skill).
 */

export type Strength = 'full' | 'domain' | 'study'
export type UnitKind = 'skill' | 'project' | 'highlight' | 'work'

export interface EvidenceUnit {
  /** The profile item id (skill, project, highlight or work). */
  id: string
  kind: UnitKind
  /** What the user calls it ("Cert-Ed", "Go", the employer name). */
  label: string
  /** How the study list names it (a highlight's own text). */
  studyLabel: string
  /** Where it lives, for study-list display ("Languages", "PayFlow"). */
  context: string
  depth: Depth
  interviewReady: boolean
  strength: Strength
  terms: string[]
  text: string
  notes: string
  targetDate: string
}

interface Flags {
  depth: Depth
  interviewReady: boolean
  domainReady: boolean
  studyNotes: string
  studyTarget: string
}

export function strengthOf(f: Pick<Flags, 'depth' | 'interviewReady' | 'domainReady'>): Strength | null {
  if (f.interviewReady) return 'full'
  if (f.depth === 'own') return f.domainReady ? 'domain' : null
  return 'study'
}

function unit(
  base: Pick<EvidenceUnit, 'id' | 'kind' | 'label' | 'context' | 'terms' | 'text'>,
  flags: Flags,
): EvidenceUnit[] {
  const strength = strengthOf(flags)
  if (!strength) return []
  return [
    {
      ...base,
      studyLabel: base.kind === 'highlight' ? base.text : base.label,
      depth: flags.depth,
      interviewReady: flags.interviewReady,
      strength,
      notes: flags.studyNotes,
      targetDate: flags.studyTarget,
    },
  ]
}

const OWN_READY: Flags = { depth: 'own', interviewReady: true, domainReady: true, studyNotes: '', studyTarget: '' }

/** Every evidence unit in the profile, in profile order. */
export function evidenceUnits(profile: ResumeProfile): EvidenceUnit[] {
  const out: EvidenceUnit[] = []
  for (const w of profile.work) {
    for (const h of w.highlights) {
      out.push(...unit({ id: h.id, kind: 'highlight', label: w.name, context: w.name, terms: [], text: h.text }, h))
    }
    // The job's keywords count only when the user can explain some of the job.
    if (w.keywords.length > 0 && w.highlights.some((h) => h.interviewReady)) {
      out.push(...unit({ id: w.id, kind: 'work', label: w.name, context: w.name, terms: w.keywords, text: '' }, OWN_READY))
    }
  }
  for (const p of profile.projects) {
    out.push(
      ...unit(
        { id: p.id, kind: 'project', label: p.name, context: 'Project', terms: [p.name, ...p.keywords], text: `${p.name} ${p.description}` },
        p,
      ),
    )
    for (const h of p.highlights) {
      out.push(...unit({ id: h.id, kind: 'highlight', label: p.name, context: p.name, terms: [], text: h.text }, h))
    }
  }
  for (const g of profile.skills) {
    for (const s of g.skills) {
      out.push(...unit({ id: s.id, kind: 'skill', label: s.name, context: g.name, terms: [s.name], text: s.name }, s))
    }
  }
  return out
}
