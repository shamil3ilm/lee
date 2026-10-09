import Link from 'next/link'
import { requireUserId } from '@/lib/auth/require-session'
import * as capturesQ from '@/lib/db/queries/postCaptures'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { CaptureReview } from '@/components/discovery/capture-review'

export const dynamic = 'force-dynamic'

/**
 * Where the "Send to lee" bookmarklet lands: the text the user selected and
 * the page link, waiting for review (30 minutes). Nothing is added until
 * the user clicks Add.
 */
export default async function CapturePage() {
  const userId = await requireUserId()
  const capture = await capturesQ.latestPending(userId)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Review what you sent"
        description="The text you selected and the page link, sent with Send to lee. Check it, then add it to Discovery or discard it."
      />
      <Card>
        <CardContent className="p-4">
          {capture ? (
            <CaptureReview capture={{ id: capture.id, text: capture.text, url: capture.url }} />
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="capture-empty">
              Nothing is waiting. Captures are kept for 30 minutes. Select a post’s text, click your Send to lee bookmark
              again, or set it up in{' '}
              <Link href="/settings/linkedin#linkedin-hiring-posts" className="underline">
                Settings › LinkedIn
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
