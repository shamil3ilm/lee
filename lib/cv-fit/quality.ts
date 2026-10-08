import { cvToScorable } from '@/lib/cv-score/extract'
import { computeCvScore } from '@/lib/cv-score/compute'
import type { CvMarket, CvScoreResult, JobTarget } from '@/lib/cv-score/types'
import type { MasterCV } from '@/lib/documents/types'
import { variantToMasterCv } from '@/lib/variants/export'
import type { RenderedResume } from '@/lib/variants/render'
import type { Region } from '@/lib/variants/types'

/**
 * The CV Score of a rendered variant through CV Score's public, pure
 * `computeCvScore` (no AI, nothing stored): the tiebreaker of the best-CV
 * pick (general mode) and the before/after delta of tailoring (JD mode).
 */

const MARKET: Readonly<Record<Region, CvMarket>> = { gcc: 'gcc', india: 'india', remote: 'us' }

export function scoreMasterCv(cv: MasterCV, region: Region, now: Date, target: JobTarget | null = null): CvScoreResult {
  return computeCvScore({
    cv: cvToScorable({ kind: 'master_cv', cv }),
    target,
    ctx: { now, canAutofix: false, region: { market: MARKET[region], source: 'prefs', label: region } },
    source: { kind: 'master_cv', documentId: null, label: 'Variant' },
  })
}

/** General-mode CV Score total (0–100) of a rendered variant; 0 when it cannot be scored. */
export function variantQuality(rendered: RenderedResume, region: Region, now: Date): number {
  try {
    return scoreMasterCv(variantToMasterCv(rendered), region, now).total.score ?? 0
  } catch {
    // An empty variant (no name / headline yet) does not parse as a CV.
    return 0
  }
}
