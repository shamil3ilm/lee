import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, Circle } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { mockView } from '@/lib/academy/coding/mock'
import { DIFFICULTY_LABELS } from '@/lib/academy/problems/schema'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DIFFICULTY_TONE } from '@/components/playground/problems/labels'
import { FinishMockButton } from '@/components/playground/problems/mock-start-form'
import { MockTimer } from '@/components/playground/problems/mock-timer'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One mock assessment: its problems, the timer, and the saved score once finished. */
export default async function MockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId()
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const mock = await mockView(userId, id)
  if (!mock) notFound()
  const running = !mock.finishedAt
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mock assessment"
        description={`${mock.problems.length} problems · ${mock.durationMin} minutes`}
        actions={running ? <FinishMockButton id={mock.id} /> : null}
      />
      {running ? <MockTimer endsAt={mock.endsAt.toISOString()} mockId={mock.id} /> : null}
      {!running ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums" data-testid="mock-score">
              {mock.score ?? 0}
            </span>
            <span className="text-sm text-muted-foreground">/ 100, weighted by difficulty (an unsolved problem counts half its best pass rate)</span>
          </CardContent>
        </Card>
      ) : null}
      <ol className="space-y-2" aria-label="Mock problems">
        {mock.problems.map((p, i) => (
          <li key={p.slug} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
            {p.result.solved ? <CheckCircle2 className="size-4 text-success" aria-label="Solved" role="img" /> : <Circle className="size-4 text-muted-foreground" aria-label="Not solved" role="img" />}
            <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
            {running ? (
              <Link href={`/playground/problems/${p.slug}?mock=${mock.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {p.title}
              </Link>
            ) : (
              <span className="font-medium">{p.title}</span>
            )}
            <Badge variant={DIFFICULTY_TONE[p.difficulty]}>{DIFFICULTY_LABELS[p.difficulty]}</Badge>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {p.result.submissions} submission{p.result.submissions === 1 ? '' : 's'} · best {p.result.bestPassRate}%
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
