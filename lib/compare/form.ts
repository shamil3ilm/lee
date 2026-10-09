import {
  currentJobSchema,
  type CompareCurrency,
  type CurrentJob,
  type Criterion,
  type HealthCover,
  type Place,
  type RatingKey,
  type WorkMode,
} from './types'

/**
 * The current-job form's string state ↔ the stored CurrentJob. Client-safe
 * and pure: inputs stay strings while typing, and only `fromForm` decides
 * what an empty or odd value means (always "not set", never zero).
 */

export type Tri = '' | 'yes' | 'no'

export interface CurrentJobForm {
  employer: string
  title: string
  location: string
  place: Place | ''
  workMode: WorkMode | ''
  startDate: string
  monthlyGross: string
  currency: CompareCurrency
  health: HealthCover
  bonus: Tri
  bonusNote: string
  pfGratuity: Tri
  leaveDays: string
  wfh: Tri
  learningBudget: Tri
  housing: Tri
  transport: Tri
  flights: Tri
  other: string
  commuteNotes: string
  ratings: Record<RatingKey, string>
  wantMore: Criterion[]
  /** Expected yearly gross (Indian "expected CTC"). */
  expectedAnnual: string
  /** Opt-in: state current and expected CTC in Indian applications. */
  shareCtc: boolean
}

const triOf = (v: boolean | null): Tri => (v === null ? '' : v ? 'yes' : 'no')
const triTo = (v: Tri): boolean | null => (v === '' ? null : v === 'yes')

export function toForm(job: CurrentJob | null, prefill?: { employer: string; title: string } | null): CurrentJobForm {
  const j = job ?? currentJobSchema.parse({ employer: prefill?.employer ?? '', title: prefill?.title ?? '' })
  const b = j.benefits
  const r = j.ratings
  return {
    employer: j.employer,
    title: j.title,
    location: j.location,
    place: j.place ?? '',
    workMode: j.workMode ?? '',
    startDate: j.startDate,
    monthlyGross: j.monthlyGross === null ? '' : String(j.monthlyGross),
    currency: j.currency,
    health: b.health,
    bonus: triOf(b.bonus),
    bonusNote: b.bonusNote,
    pfGratuity: triOf(b.pfGratuity),
    leaveDays: b.leaveDays === null ? '' : String(b.leaveDays),
    wfh: triOf(b.wfh),
    learningBudget: triOf(b.learningBudget),
    housing: triOf(b.housing),
    transport: triOf(b.transport),
    flights: triOf(b.flights),
    other: b.other,
    commuteNotes: j.commuteNotes,
    ratings: {
      growth: r.growth === null ? '' : String(r.growth),
      techStack: r.techStack === null ? '' : String(r.techStack),
      manager: r.manager === null ? '' : String(r.manager),
      workLife: r.workLife === null ? '' : String(r.workLife),
      security: r.security === null ? '' : String(r.security),
      culture: r.culture === null ? '' : String(r.culture),
    },
    wantMore: [...j.wantMore],
    expectedAnnual: j.expectedAnnual === null ? '' : String(j.expectedAnnual),
    shareCtc: j.shareCtc,
  }
}

/** "1,85,000" / "185000" → 185000; empty → null; anything else → NaN (fails validation). */
export function parseAmount(raw: string): number | null {
  const t = raw.replace(/[,\s]/g, '').trim()
  if (t === '') return null
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN
}

function intOrNull(raw: string): number | null {
  const n = parseAmount(raw)
  return n === null ? null : Number.isNaN(n) ? n : Math.round(n)
}

/** Form → the object the server validates with currentJobSchema. */
export function fromForm(f: CurrentJobForm): unknown {
  return {
    employer: f.employer,
    title: f.title,
    location: f.location,
    place: f.place || null,
    workMode: f.workMode || null,
    startDate: f.startDate,
    monthlyGross: parseAmount(f.monthlyGross),
    currency: f.currency,
    benefits: {
      health: f.health,
      bonus: triTo(f.bonus),
      bonusNote: f.bonusNote,
      pfGratuity: triTo(f.pfGratuity),
      leaveDays: intOrNull(f.leaveDays),
      wfh: triTo(f.wfh),
      learningBudget: triTo(f.learningBudget),
      housing: triTo(f.housing),
      transport: triTo(f.transport),
      flights: triTo(f.flights),
      other: f.other,
    },
    commuteNotes: f.commuteNotes,
    ratings: Object.fromEntries(Object.entries(f.ratings).map(([k, v]) => [k, v === '' ? null : Number(v)])),
    wantMore: f.wantMore,
    expectedAnnual: parseAmount(f.expectedAnnual),
    shareCtc: f.shareCtc,
  }
}
