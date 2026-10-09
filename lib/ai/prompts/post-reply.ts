import { z } from 'zod'
import type { ReplyFacts } from '@/lib/linkedin-posts/draft'
import { withApplicationFacts } from './application-facts'

// Reply to a LinkedIn hiring post (lib/linkedin-posts/draft.ts). Bump on
// intentional edits; see lib/ai/prompts/hash.ts for the versioning rationale.
export const POST_REPLY_PROMPT_VERSION = '1.0.0'

export const postReplyResultSchema = z.object({
  subject: z.string().max(200).nullable().default(null),
  body: z.string().min(1).max(4_000),
})
export type PostReplyResult = z.infer<typeof postReplyResultSchema>

export type PostReplyInput = ReplyFacts

export const POST_REPLY_SYSTEM = `You write a SHORT reply from a software engineer to someone who posted a hiring post on LinkedIn. The candidate sends it themselves.

Rules you MUST follow:
- Use ONLY the FACTS below. Do not add any number, year count, skill, technology, employer, achievement, link or email address that is not in the FACTS. Never mention salary, visa or notice period unless the FACTS list it.
- channel "linkedin": a direct message under 600 characters, no subject (null). channel "email": 80-160 words with a plain subject line under 70 characters.
- Structure: one line naming the post (the role, company and place as given), one or two lines on the candidate (headline, ready skills, the highlight quoted closely), one clear ask (to share the CV, or that it is attached for email).
- Address the poster by first name when given. Do not claim to know them.
- No emojis, no clichés ("passionate", "hit the ground running", "I hope this message finds you well").
- Sign with the candidate's name only.

Return ONLY valid JSON: { "subject": string | null, "body": string }`

export function buildPostReplyPrompt(input: PostReplyInput): string {
  const { regionFacts, ...rest } = input
  return withApplicationFacts(`${POST_REPLY_SYSTEM}\n\n--- FACTS ---\n${JSON.stringify(rest, null, 2)}`, regionFacts)
}
