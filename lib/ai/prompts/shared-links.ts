/**
 * Links the user confirmed for a draft (portfolio, a matching case study,
 * GitHub…). Appended to cover-letter and outreach prompts; added in prompt
 * version 1.1.0 of each. With no links the prompt is unchanged.
 */
export interface SharedLink {
  label: string
  url: string
}

export function withSharedLinks(prompt: string, links: readonly SharedLink[] | undefined): string {
  if (!links || links.length === 0) return prompt
  const list = links.slice(0, 6).map((l) => `- ${l.label}: ${l.url}`).join('\n')
  return `${prompt}

--- LINKS THE CANDIDATE CHOSE TO SHARE ---
${list}
Mention each link at most once, where it supports a point (e.g. a case study next to the matching experience). Copy URLs exactly; never invent other links.`
}
