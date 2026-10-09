import type { ContactLine, RenderedResume } from '@/lib/variants/render'
import { joinHeading, joinMeta, type DocxResume } from './model'

/**
 * A rendered (fact-locked) variant → the Word model. Same facts and order
 * as the PDF. Contact goes on two lines, as recruiters skim it: (1) how to
 * reach the person, (2) the region facts (nationality, visa, notice…).
 */

const REACH = new Set<ContactLine['field']>(['email', 'phone', 'location', 'url', 'profile'])

function contactLines(contact: readonly ContactLine[]): string[] {
  const reach = contact.filter((c) => REACH.has(c.field)).map((c) => c.value)
  const facts = contact.filter((c) => !REACH.has(c.field)).map((c) => `${c.label}: ${c.value}`)
  return [reach.join(' | '), facts.join(' | ')].filter(Boolean)
}

export function variantToDocxModel(r: RenderedResume): DocxResume {
  return {
    name: r.name,
    headline: r.headline,
    contact: contactLines(r.contact),
    paper: r.paper,
    sections: r.sections.map((s) => ({
      heading: s.label,
      paragraphs: s.lines,
      entries: s.entries.map((e) => ({
        heading: joinHeading(e.title, e.subtitle),
        meta: joinMeta([e.location, e.dates]),
        detail: e.keywords.length > 0 ? e.keywords.join(', ') : '',
        bullets: e.bullets.map((b) => b.text),
      })),
    })),
  }
}
