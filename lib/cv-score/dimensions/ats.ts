/**
 * v12.0 — ATS parseability (format half of the ATS headline score).
 *
 * Points (sum 100): text extractable 15 · standard headings 15 · contact 20 ·
 * single column 15 · file type 10 · no tables/images-as-text 10 ·
 * special characters 5 · no keyword stuffing 10. Keyword presence for a
 * target JD is blended in by the headline composer (headlines.ts).
 */
import { makeFinding } from '../findings'
import { findSkillsInText } from '../synonyms'
import type { CvFinding, DimensionResult, ScorableCv } from '../types'

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

const STUFF_REPEAT = 8
const STUFF_SKILLS_LISTED = 40
const CRITICAL_CAP = 60

function hasSection(cv: ScorableCv, key: string): boolean {
  return (cv.meta.sectionOrder ?? []).includes(key)
}

export function detectStuffing(cv: ScorableCv): AtsDetails['stuffing'] {
  const counts = findSkillsInText(cv.plainText)
  const terms = [...counts.entries()]
    .filter(([, n]) => n >= STUFF_REPEAT)
    .map(([t]) => t)
    .sort()
  const stuffed = terms.length > 0 || cv.skillsListed.length > STUFF_SKILLS_LISTED
  return { terms, skillsListed: cv.skillsListed.length, stuffed }
}

export function scoreAts(cv: ScorableCv): DimensionResult<AtsDetails> {
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
      suggestion: 'Export the CV as a text-based PDF or DOCX (not a scan or image).',
    }))
  } else {
    add('text', 'Text extractable', 0, 15)
    findings.push(makeFinding('ats', {
      severity: 'critical',
      message: 'Almost no text could be extracted — an ATS will see a blank CV',
      suggestion: 'Re-export as a text-based PDF or DOCX; avoid scanned or image-only files.',
    }))
  }

  // 2. Standard headings
  const hasExp = hasSection(cv, 'experience') || (cv.meta.structured === true && cv.roles.length > 0)
  const hasSkills = hasSection(cv, 'skills')
  const hasEdu = hasSection(cv, 'education')
  add('headings', 'Standard section headings', (hasExp ? 9 : 0) + (hasSkills ? 3 : 0) + (hasEdu ? 3 : 0), 15)
  if (!hasExp) {
    findings.push(makeFinding('ats', {
      severity: 'major',
      message: 'No standard "Experience" heading found',
      suggestion: 'Use a plain heading such as "Experience" or "Work Experience" so ATS parsers find your roles.',
    }))
  }
  const missingSecs = [!hasSkills && 'Skills', !hasEdu && 'Education'].filter(Boolean) as string[]
  if (missingSecs.length) {
    findings.push(makeFinding('ats', {
      severity: 'minor',
      message: `Missing standard section(s): ${missingSecs.join(', ')}`,
      suggestion: 'ATS parsers map fields by heading — include the standard sections with conventional names.',
    }))
  }

  // 3. Contact
  const c = cv.contact
  add('contact', 'Contact details', (c.email ? 10 : 0) + (c.phone ? 5 : 0) + (c.linkedin ? 3 : 0) + (c.location ? 2 : 0), 20)
  if (!c.email) {
    findings.push(makeFinding('ats', {
      severity: 'critical',
      message: 'No email address detected',
      suggestion: 'Put your email in plain text at the top of the CV (not inside an image or header graphic).',
    }))
  }
  const missingContact = [!c.phone && 'phone', !c.linkedin && 'LinkedIn URL', !c.location && 'location'].filter(Boolean) as string[]
  if (missingContact.length) {
    findings.push(makeFinding('ats', {
      severity: 'minor',
      message: `Contact details missing: ${missingContact.join(', ')}`,
      suggestion: 'Recruiters filter by location and reach out by phone — include them in the header.',
    }))
  }

  // 4. Layout
  if (cv.meta.columnsSuspected) {
    add('layout', 'Single-column layout', 0, 15)
    findings.push(makeFinding('ats', {
      severity: 'major',
      message: 'Multi-column layout suspected — ATS parsers often read columns out of order',
      suggestion: 'Switch to a single-column template so sections are parsed in reading order.',
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
      suggestion: 'Submit a text-based PDF or DOCX.',
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
        suggestion: 'Replace tables with plain headings and bullet lists.',
      }))
    }
    const pages = cv.meta.pageCountEstimate ?? 1
    if (ft === 'pdf' && chars / pages < 300) {
      tablePts -= 5
      findings.push(makeFinding('ats', {
        severity: 'major',
        message: 'Very little text per page — content may be embedded as images',
        suggestion: 'Make sure all text is real text, not part of an image or graphic.',
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
      suggestion: 'Replace icons/emoji with plain words — many ATS parsers drop or garble them.',
    }))
  } else add('chars', 'Plain characters', 5, 5)

  // Keyword stuffing (reported here, penalised in the ATS headline blend).
  const stuffing = detectStuffing(cv)
  add('stuffing', 'No keyword stuffing', stuffing.stuffed ? 0 : 10, 10)
  if (stuffing.stuffed) {
    findings.push(makeFinding('ats', {
      severity: 'major',
      message: stuffing.terms.length
        ? `Keyword stuffing suspected: ${stuffing.terms.join(', ')} repeated ${STUFF_REPEAT}+ times`
        : `Keyword stuffing suspected: ${stuffing.skillsListed} skills listed`,
      suggestion: 'Modern ATS and recruiters penalise stuffing — keep skills you can evidence and cut the rest.',
    }))
  }

  // A critical problem (no email, no extractable text) caps the score — an
  // otherwise tidy CV an ATS can't contact or read is not a "B".
  const sum = checks.reduce((s, ch) => s + ch.points, 0)
  const score = findings.some((f) => f.severity === 'critical') ? Math.min(sum, CRITICAL_CAP) : sum
  return { score, details: { checks, stuffing }, findings }
}
