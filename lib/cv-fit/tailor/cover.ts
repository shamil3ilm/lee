import type { CoverLetterTailoring } from '@/lib/ai/prompts/cover-letter'
import * as tailoringsQ from '@/lib/db/queries/cvTailorings'

/**
 * The cover letter reads the same parsed requirements and accepted evidence
 * as the tailored copy: the checklist saved with the latest tailoring, and
 * the gaps the user chose to answer with adjacent experience. Read
 * defensively (jsonb from an older shape → left out).
 */

type Req = CoverLetterTailoring['requirements'][number]

const STATUSES = new Set(['met', 'partial', 'missing'])

function requirement(v: unknown): Req | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.text !== 'string' || typeof r.status !== 'string' || !STATUSES.has(r.status)) return null
  return {
    text: r.text.slice(0, 200),
    weight: r.weight === 'nice' ? 'nice' : 'must',
    status: r.status as Req['status'],
    ...(typeof r.evidence === 'string' ? { evidence: r.evidence.slice(0, 200) } : {}),
  }
}

export function toCoverTailoring(row: Pick<tailoringsQ.CvTailoringRow, 'requirements' | 'gaps'>): CoverLetterTailoring {
  const requirements = Array.isArray(row.requirements) ? row.requirements.map(requirement).filter((r): r is Req => r !== null) : []
  const adjacent = Array.isArray(row.gaps)
    ? row.gaps.flatMap((g) => {
        if (!g || typeof g !== 'object') return []
        const d = g as Record<string, unknown>
        return d.action === 'cover' && typeof d.text === 'string' && typeof d.evidence === 'string'
          ? [{ requirement: d.text.slice(0, 200), evidence: d.evidence.slice(0, 200) }]
          : []
      })
    : []
  return { requirements, adjacent }
}

export async function coverTailoringFor(userId: string, applicationId: string): Promise<CoverLetterTailoring | undefined> {
  const row = await tailoringsQ.latestForApplication(userId, applicationId)
  return row ? toCoverTailoring(row) : undefined
}
