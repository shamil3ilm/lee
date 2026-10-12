/**
 * Employer boilerplate: "About us", "Who we are", benefits and perks, equal
 * opportunity notes. They describe the COMPANY, not the job, so the domain
 * bonus and the strong-area seniority offset must not read them: a super
 * app's "payments through our wallet" paragraph is not payments work for
 * its Category Executive. Pure and client-safe.
 */

const HEADING_LINE = /^\s*(?:#{1,6}\s+\S.*|(?:\*\*|__)[^*_]{2,60}(?:\*\*|__)\s*:?\s*|[A-Z\p{Lu}][^.!?\n]{1,50}:\s*)$/u

const BOILERPLATE_HEADING = new RegExp(
  String.raw`^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:about (?:us|the company|[\p{L}\p{N}&.' -]{1,40})|who we are|our (?:story|mission|company|culture|values)|company (?:overview|description)|why (?:join us|work (?:with|for) us|you(?:'|’)ll love working here)|benefits(?: and perks| & perks)?|perks(?: and benefits| & benefits)?|what we offer|we offer|compensation and benefits|equal (?:employment )?opportunity|eeo statement|diversity(?: and inclusion| & inclusion)?)(?![\p{L}\p{N}])`,
  'iu',
)

/** Headings that start the role itself again ("About the role" is the job, not the company). */
const ROLE_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*about (?:the|this) (?:role|job|position|team)\b/i

/** The description without employer boilerplate sections (from the heading to the next heading). */
export function stripBoilerplate(text: string | null | undefined): string {
  if (!text) return ''
  const out: string[] = []
  let skipping = false
  for (const line of text.split(/\r?\n/)) {
    if (HEADING_LINE.test(line)) skipping = BOILERPLATE_HEADING.test(line) && !ROLE_HEADING.test(line)
    if (!skipping) out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
