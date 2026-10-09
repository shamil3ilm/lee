/**
 * The résumé as a Word document sees it: one column of headings, plain
 * paragraphs and bullet lists. Both the variant renderer and stored CV
 * documents (master / tailored) map onto this, so the .docx writer has one
 * input shape and no knowledge of where the facts came from.
 */

export type DocxPaper = 'a4' | 'letter'

export interface DocxEntry {
  /** "Backend Engineer — PayFlow" (a Heading 2). */
  heading: string
  /** "Dubai | Apr 2021 – Present" (same line as the heading, not bold). */
  meta: string
  /** Optional plain line, e.g. a project's stack. */
  detail: string
  bullets: string[]
}

export interface DocxSection {
  /** A Heading 1: "Experience", "Skills", … */
  heading: string
  paragraphs: string[]
  entries: DocxEntry[]
}

export interface DocxResume {
  name: string
  headline: string
  /** Contact lines under the name (each one paragraph). */
  contact: string[]
  sections: DocxSection[]
  paper: DocxPaper
}

/** "Title — Company" without a dangling dash when either side is empty. */
export function joinHeading(title: string, subtitle: string): string {
  return [title, subtitle].map((s) => s.trim()).filter(Boolean).join(' — ')
}

/** "Dubai | Apr 2021 – Present" */
export function joinMeta(parts: readonly string[]): string {
  return parts.map((s) => s.trim()).filter(Boolean).join(' | ')
}
