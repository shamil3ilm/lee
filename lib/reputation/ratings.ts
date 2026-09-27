import { z } from 'zod'
import * as companiesQ from '@/lib/db/queries/companies'
import * as repQ from '@/lib/db/queries/companyReputation'
import { REVIEW_SITES, type ReviewSite, type UserRating } from './types'
import { ReputationError } from './errors'

/**
 * The user's own notes from review sites they read themselves (lee never
 * fetches those sites). One rating per site; saving again replaces it.
 */

export const ratingInputSchema = z.object({
  site: z.enum(REVIEW_SITES),
  rating: z.coerce.number().min(1, 'Rating is 1–5.').max(5, 'Rating is 1–5.'),
  summary: z.string().trim().max(1000, 'Keep the summary under 1,000 characters.').default(''),
  url: z
    .string()
    .trim()
    .url('Enter a full link, or leave it empty.')
    .refine((u) => /^https?:\/\//i.test(u), 'Links must start with http(s).')
    .nullable()
    .or(z.literal('').transform(() => null))
    .default(null),
})
export type RatingInput = z.input<typeof ratingInputSchema>

async function requireCompany(userId: string, companyId: string): Promise<void> {
  if (!(await companiesQ.getById(userId, companyId))) throw new ReputationError('Company not found.', 'not_found')
}

export async function saveRating(
  userId: string,
  companyId: string,
  input: RatingInput,
  now: Date = new Date(),
): Promise<UserRating[]> {
  const parsed = ratingInputSchema.safeParse(input)
  if (!parsed.success) throw new ReputationError(parsed.error.issues[0]?.message ?? 'Invalid rating.')
  await requireCompany(userId, companyId)
  const current = (await repQ.get(userId, companyId))?.userRatings ?? []
  const rating: UserRating = {
    site: parsed.data.site,
    rating: Math.round(parsed.data.rating * 10) / 10,
    summary: parsed.data.summary,
    url: parsed.data.url,
    recordedAt: now.toISOString(),
  }
  const next = [...current.filter((r) => r.site !== rating.site), rating]
  await repQ.saveRatings(userId, companyId, next)
  return next
}

export async function removeRating(userId: string, companyId: string, site: ReviewSite): Promise<UserRating[]> {
  await requireCompany(userId, companyId)
  const current = (await repQ.get(userId, companyId))?.userRatings ?? []
  const next = current.filter((r) => r.site !== site)
  await repQ.saveRatings(userId, companyId, next)
  return next
}
