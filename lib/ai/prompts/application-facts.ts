/**
 * The region block for cover letters and outreach: the screening facts a
 * GCC, Indian or remote reader looks for, taken ONLY from the candidate's
 * private settings and only those they opted to share (lib/apply/
 * application-facts.ts builds it). Added in cover-letter 1.3.0, linkedin
 * message 1.2.0, recruiter reply 1.2.0 and follow-up 1.2.0. With no facts the
 * prompt is unchanged.
 */

export type FactsRegion = 'gcc' | 'india' | 'remote'

export interface ApplicationFact {
  label: string
  value: string
}

export interface ApplicationFacts {
  region: FactsRegion
  /** Only facts the user entered and opted to share, in reading order. */
  lines: ApplicationFact[]
}

const REGION_NAME: Readonly<Record<FactsRegion, string>> = { gcc: 'GCC', india: 'India', remote: 'Remote' }

const REGION_RULE: Readonly<Record<FactsRegion, string>> = {
  gcc: 'GCC recruiters screen on these first. In ONE or two short sentences near the end (the last paragraph of a letter, just before the sign-off of a message), state the visa status, notice period and availability to relocate listed below. Mention nationality only if it is listed. Never mention salary.',
  india:
    'Indian screeners ask for current CTC, expected CTC and the notice period. State them in one short line near the end: current and expected CTC only if listed below, the notice period if listed. If no CTC is listed, say nothing about pay.',
  remote:
    'Remote readers want it short and link-first. State the time-zone overlap in one sentence using the time zone listed below (e.g. "I can overlap N hours with your team"); do not promise specific hours you cannot infer.',
}

export function withApplicationFacts(prompt: string, facts: ApplicationFacts | null | undefined): string {
  if (!facts || facts.lines.length === 0) return prompt
  const list = facts.lines.map((l) => `- ${l.label}: ${l.value}`).join('\n')
  return `${prompt}

--- APPLICATION FACTS (${REGION_NAME[facts.region]}; from the candidate’s private settings) ---
${list}
${REGION_RULE[facts.region]}
Use ONLY these facts, word for word where they are values. Never infer or invent a visa status, notice period, nationality, location or pay that is not listed.`
}

/** "Visa: … Notice period: …" — the deterministic fixture provider's rendering. */
export function factsSentence(facts: ApplicationFacts | null | undefined): string {
  if (!facts || facts.lines.length === 0) return ''
  return facts.lines.map((l) => `${l.label}: ${l.value}.`).join(' ')
}
