import type { LinkedInPostInput, LinkedInPostResult, LinkedInProfileInput, LinkedInProfileResult } from './prompts/linkedin'

/** Deterministic offline drafts (tests, e2e): built from the given facts only. */

const OPENERS: Readonly<Record<LinkedInPostInput['kind'], string>> = {
  achievement: 'A piece of work I am proud of:',
  case_study: 'I wrote up a case study:',
  radar: 'Something I am learning this week:',
  open_to_work: 'I am open to new roles.',
}

export function pseudoLinkedInPost(input: LinkedInPostInput): LinkedInPostResult {
  const lines = [OPENERS[input.kind], '', ...input.facts.slice(0, 4)]
  if (input.link) lines.push('', input.link)
  return { text: lines.join('\n').slice(0, 3000) }
}

export function pseudoLinkedInProfile(input: LinkedInProfileInput): LinkedInProfileResult {
  const role = input.targetRoles[0] ?? 'Software Engineer'
  const kw = input.keywords.slice(0, 3)
  const headline = kw.length > 0 ? `${role} | ${kw.join(' · ')}` : role
  const firstLine = input.cvText.split('\n').find((l) => l.trim()) ?? ''
  return {
    headlines: [headline.slice(0, 220)],
    about: [`${role} focused on ${kw.join(', ') || 'building reliable software'}.`, firstLine].filter(Boolean).join('\n\n').slice(0, 2600),
  }
}
