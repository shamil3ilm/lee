/**
 * v12.0 — ATS parseability (format half of the ATS headline score).
 *
 * Points (sum 100): text extractable 15 · standard headings 15 · contact 20 ·
 * single column 15 · file type 10 · no tables/images-as-text 10 ·
 * special characters 5 · no keyword stuffing 10. Keyword presence for a
 * target JD is blended in by the headline composer (headlines.ts).
 *
 * v1.1 — phone advice follows the target market (region.ts); keyword
 * stuffing is judged on prose only (summary + bullets — never the Skills
 * section or project tech-stack lines), by repetition within one passage or
 * by a term filling most bullets at high density; findings cite lines.
 */
import { headerEvidence, linesContaining } from '../evidence'
import { headingKey } from '../extract'
import { makeFinding } from '../findings'
import { phoneAdvice, phoneOptional } from '../region'
import { findSkillsInText } from '../synonyms'
import { wordCount } from '../text'
import type { CvFinding, CvLineRef, DimensionResult, RegionHint, ScorableCv } from '../types'

export interface AtsCheck {
  key: string
  label: string
  points: number
  max: number
}

export interface AtsDetails {
  checks: AtsCheck[]
  stuffing: { terms: string[]; skillsListed: number; stuffed: boolean }
}

export interface AtsOptions {
  /** v1.1 — target market (phone advice). */
  region?: RegionHint | null
}

/** Same term this many times in ONE passage (a bullet, the summary) is stuffing. */
const STUFF_PER_PASSAGE = 4
/** …or in at least this many passages, covering this share of them, at this density. */
const STUFF_MIN_PASSAGES = 6
const STUFF_PASSAGE_SHARE = 0.6
const STUFF_DENSITY = 0.04
const STUFF_SKILLS_LISTED = 40
const CRITICAL_CAP = 60

function hasSection(cv: ScorableCv, key: string): boolean {
  return (cv.meta.sectionOrder ?? []).includes(key)
}

/** Prose passages: the headline, the summary and each bullet. */
function prosePassages(cv: ScorableCv): string[] {
  const summary = cv.sections
    .filter((s) => headingKey(s.heading) === 'summary')
    .map((s) => s.lines.join(' '))
  return [cv.headline ?? '', ...summary, ...cv.bullets.map((b) => b.text)].filter((t) => t.trim())
}

export function detectStuffing(cv: ScorableCv): AtsDetails['stuffing'] {
  const passages = prosePassages(cv)
  const words = passages.reduce((n, p) => n + wordCount(p), 0)
  const perTerm = new Map<string, { total: number; passages: number; max: number }>()
  for (const p of passages) {
    for (const [term, n] of findSkillsInText(p)) {
      const cur = perTerm.get(term) ?? { total: 0, passages: 0, max: 0 }
      perTerm.set(term, { total: cur.total + n, passages: cur.passages + 1, max: Math.max(cur.max, n) })
    }
  }
  const terms = [...perTerm.entries()]
    .filter(([, s]) =>
      s.max >= STUFF_PER_PASSAGE ||
      (s.passages >= STUFF_MIN_PASSAGES &&
        s.passages / passages.length >= STUFF_PASSAGE_SHARE &&
        words > 0 &&
        s.total / words >= STUFF_DENSITY))
    .map(([t]) => t)
    .sort()
  const stuffed = terms.length > 0 || cv.skillsListed.length > STUFF_SKILLS_LISTED
  return { terms, skillsListed: cv.skillsListed.length, stuffed }
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function headingLines(cv: ScorableCv): CvLineRef[] {
  const lines = cv.lines ?? cv.plainText.split('\n')
  return cv.sections
    .filter((s) => s.headingIndex !== undefined)
    .map((s) => ({ index: s.headingIndex!, text: (lines[s.headingIndex!] ?? s.heading).trim() }))
    .slice(0, 8)
}

function contactPoints(cv: ScorableCv, region: RegionHint | null): number {
  const c = cv.contact
  const phoneOk = !!c.phone || phoneOptional(region)
  return (c.email ? 10 : 0) + (phoneOk ? 5 : 0) + (c.linkedin ? 3 : 0) + (c.location ? 2 : 0)
}

function contactFindings(cv: ScorableCv, region: RegionHint | null): CvFinding[] {
  const c = cv.contact
  const header = headerEvidence(cv)
  const out: CvFinding[] = []
  if (!c.email) {
    out.push(makeFinding('ats', {
      severity: 'critical',
      message: 'No email address detected',
      evidence: header,
      suggestion: 'Recruiters and ATS forms reply by email — put it in plain text at the top of the CV (not inside an image or header graphic).',
    }))
  }
  const advice = phoneAdvice(c.phone, region)
  if (advice) out.push(makeFinding('ats', { ...advice, evidence: header }))
  const listPhone = !c.phone && !phoneOptional(region) && !advice
  const missing = [listPhone && 'phone', !c.linkedin && 'LinkedIn URL', !c.location && 'location'].filter(Boolean) as string[]
  if (missing.length) {
    out.push(makeFinding('ats', {
      severity: 'minor',
      message: `Contact details missing: ${missing.join(', ')}`,
      evidence: header,
      suggestion: 'Recruiters often filter by location and follow up by phone or LinkedIn — having these in the header makes that easy.',
    }))
  }
  return out
}

export function scoreAts(cv: ScorableCv, opts: AtsOptions = {}): DimensionResult<AtsDetails> {
  const region = opts.region ?? null
  const findings: CvFinding[] = []
  const checks: AtsCheck[] = []
  const add = (key: string, label: string, points: number, max: number): void => {
    checks.push({ key, label, points, max })
  }

  // 1. Text extractable
  const chars = cv.plainText.replace(/\s+/g, ' ').trim().length
  if (chars >= 400) add('text', 'Text extractable', 15, 15)
  else if (chars >= 200) {
    add('text', 'Text extractable', 8, 15)
    findings.push(makeFinding('ats', {
      severity: 'major',
      message: `Only ${chars} characters of text could be extracted`,
      evidence: headerEvidence(cv),
      suggestion: 'An ATS reads only real text — exporting the CV as a text-based PDF or DOCX (not a scan or image) fixes this.',
    }))
  } else {
    add('text', 'Text extractable', 0, 15)
    findings.push(makeFinding('ats', {
      severity: 'critical',
      message: 'Almost no text could be extracted — an ATS will see a blank CV',
      evidence: headerEvidence(cv),
      suggestion: 'Re-exporting as a text-based PDF or DOCX lets parsers read it; scanned or image-only files read as blank.',
    }))
  }

  // 2. Standard headings
  const hasExp = hasSection(cv, 'experience') || (cv.meta.structured === true && cv.roles.length > 0)
  const hasSkills = hasSection(cv, 'skills')
  const hasEdu = hasSection(cv, 'education')
  add('headings', 'Standard section headings', (hasExp ? 9 : 0) + (hasSkills ? 3 : 0) + (hasEdu ? 3 : 0), 15)
  const headings = headingLines(cv)
  if (!hasExp) {
    findings.push(makeFinding('ats', {
      severity: 'major',
      message: 'No standard "Experience" heading found',
      evidence: headings.length ? headings : headerEvidence(cv),
      suggestion: 'ATS parsers find roles by heading — a plain "Experience" or "Work Experience" heading lets them.',
    }))
  }
  const missingSecs = [!hasSkills && 'Skills', !hasEdu && 'Education'].filter(Boolean) as string[]
  if (missingSecs.length) {
    findings.push(makeFinding('ats', {
      severity: 'minor',
      message: `Missing standard ${missingSecs.length === 1 ? 'section' : 'sections'}: ${missingSecs.join(', ')}`,
      evidence: headings.length ? headings : headerEvidence(cv),
      suggestion: 'ATS parsers map fields by heading — conventional section names help them file your details.',
    }))
  }

  // 3. Contact
  add('contact', 'Contact details', contactPoints(cv, region), 20)
  findings.push(...contactFindings(cv, region))

  // 4. Layout
  if (cv.meta.columnsSuspected) {
    add('layout', 'Single-column layout', 0, 15)
    const gapped = linesContaining(cv, /\S(?: {3,}|\t+)\S/).map(({ highlight: _h, ...l }) => l)
    findings.push(makeFinding('ats', {
      severity: 'major',
      message: 'Multi-column layout suspected — ATS parsers often read columns out of order',
      evidence: gapped.length ? gapped : headerEvidence(cv),
      suggestion: 'A single-column template keeps sections in reading order for parsers.',
    }))
  } else add('layout', 'Single-column layout', 15, 15)

  // 5. File type
  const ft = (cv.meta.fileType ?? '').toLowerCase()
  if (['pdf', 'docx', 'json', 'tex'].includes(ft)) add('fileType', 'ATS-friendly file type', 10, 10)
  else if (['txt', 'md'].includes(ft)) {
    add('fileType', 'ATS-friendly file type', 7, 10)
    findings.push(makeFinding('ats', {
      severity: 'minor',
      message: `Plain ${ft.toUpperCase()} file — most application forms expect PDF or DOCX`,
      evidence: headerEvidence(cv, 1),
      suggestion: 'A text-based PDF or DOCX is what most application forms accept.',
    }))
  } else add('fileType', 'ATS-friendly file type', 5, 10)

  // 6. Tables / images-as-text
  let tablePts = 10
  if (!cv.meta.structured && cv.meta.sourceKind === 'upload') {
    const lines = cv.plainText.split('\n').filter((l) => l.trim())
    const tableLines = lines.filter((l) => (l.match(/\|/g) ?? []).length >= 3 || (l.match(/\t/g) ?? []).length >= 2)
    if (lines.length > 0 && tableLines.length / lines.length > 0.15) {
      tablePts -= 5
      findings.push(makeFinding('ats', {
        severity: 'major',
        message: 'Table-like layout detected — cells are often scrambled by ATS parsers',
        evidence: linesContaining(cv, /(?:\|[^|]*){3,}|(?:\t[^\t]*){2,}/).map(({ highlight: _h, ...l }) => l),
        suggestion: 'Plain headings and bullet lists parse more reliably than tables.',
      }))
    }
    const pages = cv.meta.pageCountEstimate ?? 1
    if (ft === 'pdf' && chars / pages < 300) {
      tablePts -= 5
      findings.push(makeFinding('ats', {
        severity: 'major',
        message: 'Very little text per page — content may be embedded as images',
        evidence: headerEvidence(cv),
        suggestion: 'Text inside images or graphics is invisible to parsers — keeping it as real text avoids that.',
      }))
    }
  }
  add('tables', 'No tables / images-as-text', tablePts, 10)

  // 7. Special characters / emoji
  const emoji = (cv.plainText.match(/\p{Extended_Pictographic}/gu) ?? []).length
  const symbols = (cv.plainText.match(/[^ -~\p{L}\p{N}\s•–—’‘“”€£¥·]/gu) ?? []).length
  const density = cv.plainText.length ? symbols / cv.plainText.length : 0
  if (emoji >= 3 || density > 0.02) {
    add('chars', 'Plain characters', 0, 5)
    findings.push(makeFinding('ats', {
      severity: 'minor',
      message: `Unusual symbols or emoji detected (${emoji} emoji)`,
      evidence: linesContaining(cv, /[\p{Extended_Pictographic}]|[^ -~\p{L}\p{N}\s•–—’‘“”€£¥·]/u),
      suggestion: 'Many ATS parsers drop or garble icons and emoji — plain words survive.',
    }))
  } else add('chars', 'Plain characters', 5, 5)

  // Keyword stuffing (reported here, penalised in the ATS headline blend).
  const stuffing = detectStuffing(cv)
  add('stuffing', 'No keyword stuffing', stuffing.stuffed ? 0 : 10, 10)
  if (stuffing.stuffed) {
    const term = stuffing.terms[0]
    const ev = term ? linesContaining(cv, new RegExp(`\\b${escapeRe(term)}\\b`, 'i')) : []
    findings.push(makeFinding('ats', {
      severity: 'major',
      message: stuffing.terms.length
        ? `Keyword stuffing suspected: ${stuffing.terms.join(', ')} repeated far more than the rest of the CV`
        : `Keyword stuffing suspected: ${stuffing.skillsListed} skills listed`,
      evidence: ev.length ? ev : headingLines(cv),
      suggestion: 'Modern ATS and recruiters discount repeated keywords — skills you can evidence in a bullet carry more weight.',
    }))
  }

  // A critical problem (no email, no extractable text) caps the score — an
  // otherwise tidy CV an ATS can't contact or read is not a "B".
  const sum = checks.reduce((s, ch) => s + ch.points, 0)
  const score = findings.some((f) => f.severity === 'critical') ? Math.min(sum, CRITICAL_CAP) : sum
  return { score, details: { checks, stuffing }, findings }
}
