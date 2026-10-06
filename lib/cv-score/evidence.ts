/**
 * v1.1 — build the source-line citations ("evidence") a finding points at.
 * Indexes refer to `ScorableCv.lines`; every helper degrades to a text
 * search when a hand-built ScorableCv carries no line indexes.
 */
import type { CvLineRef, ScorableCv } from './types'

const MAX_LINES = 6

function allLines(cv: ScorableCv): string[] {
  return cv.lines ?? cv.plainText.split('\n')
}

function ref(cv: ScorableCv, index: number, highlight?: string): CvLineRef | null {
  const text = allLines(cv)[index]
  if (text === undefined || !text.trim()) return null
  const h = highlight && text.toLowerCase().includes(highlight.toLowerCase()) ? highlight : undefined
  return { index, text: text.trim(), ...(h ? { highlight: h } : {}) }
}

function refs(cv: ScorableCv, indexes: readonly number[], highlight?: string): CvLineRef[] {
  const out: CvLineRef[] = []
  for (const i of indexes) {
    const r = ref(cv, i, highlight)
    if (r && !out.some((o) => o.index === r.index)) out.push(r)
    if (out.length >= MAX_LINES) break
  }
  return out
}

/** First line containing `needle` (case-insensitive), searching from the top. */
export function findLine(cv: ScorableCv, needle: string): number | undefined {
  const n = needle.trim().toLowerCase().slice(0, 60)
  if (!n) return undefined
  const lines = allLines(cv)
  const i = lines.findIndex((l) => l.toLowerCase().includes(n))
  return i === -1 ? undefined : i
}

/**
 * Lines of bullet `bulletIndex` (index into `cv.bullets`). `highlight` marks
 * the phrase the finding is about on whichever line holds it.
 */
export function bulletEvidence(cv: ScorableCv, bulletIndex: number, highlight?: string): CvLineRef[] {
  const b = cv.bullets[bulletIndex]
  if (!b) return []
  const idx = b.lines?.length ? b.lines : [findLine(cv, b.text.slice(0, 40))].filter((x): x is number => x !== undefined)
  if (!highlight) return refs(cv, idx)
  const lines = refs(cv, idx)
  return lines.map((l) => (l.text.toLowerCase().includes(highlight.toLowerCase()) ? { ...l, highlight } : l))
}

/** Header line(s) of a role. */
export function roleEvidence(cv: ScorableCv, roleIndex: number): CvLineRef[] {
  const r = cv.roles[roleIndex]
  if (!r) return []
  if (r.lines?.length) return refs(cv, r.lines)
  const i = findLine(cv, r.title || r.company)
  return i === undefined ? [] : refs(cv, [i])
}

/** The top-of-CV contact block (first non-empty lines before any section heading). */
export function headerEvidence(cv: ScorableCv, max = 3): CvLineRef[] {
  const header = cv.sections.find((s) => s.heading === 'Header')
  const idx = header?.lineIndexes?.length ? header.lineIndexes : allLines(cv).map((_, i) => i)
  return refs(cv, idx).slice(0, max)
}

/** Lines matching `needle`, up to `max`. */
export function linesContaining(cv: ScorableCv, needle: RegExp, max = MAX_LINES): CvLineRef[] {
  const out: CvLineRef[] = []
  allLines(cv).forEach((l, i) => {
    if (out.length >= max) return
    const m = needle.exec(l)
    needle.lastIndex = 0
    if (m) out.push({ index: i, text: l.trim(), highlight: m[0] })
  })
  return out
}

/** The section heading line for a canonical section, when present. */
export function sectionHeadingEvidence(cv: ScorableCv, heading: string): CvLineRef[] {
  const sec = cv.sections.find((s) => s.heading === heading)
  if (sec?.headingIndex === undefined) return []
  return refs(cv, [sec.headingIndex])
}
