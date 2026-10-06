import { requireUserId } from '@/lib/auth/require-session'
import { dueCards } from '@/lib/academy/service/reviews'
import { PageHeader } from '@/components/page-header'
import { ReviewSession } from '@/components/playground/review-session'

export const dynamic = 'force-dynamic'

/** v13 §11 — spaced repetition (SM-2) over the concept cards you have met. */
export default async function PlaygroundReviewPage() {
  const userId = await requireUserId()
  const cards = await dueCards(userId)
  return (
    <div className="space-y-6">
      <PageHeader title="Review" description="Recall first, then reveal. Your grade sets when the card comes back." />
      <ReviewSession cards={cards} />
    </div>
  )
}
