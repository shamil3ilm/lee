import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { listMockViews } from '@/lib/academy/coding/mock'
import { EmptyState } from '@/components/empty-state'
import { LocalTime } from '@/components/local-time'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MockStartForm } from '@/components/playground/problems/mock-start-form'

export const dynamic = 'force-dynamic'

/** Mock assessments: start one, and every past result (saved and kept). */
export default async function MockPage() {
  const userId = await requireUserId()
  const mocks = await listMockViews(userId)
  return (
    <div className="space-y-6">
      <PageHeader title="Mock assessment" description="2–3 problems against the clock, each one a step harder, scored when you finish." />
      <Card>
        <CardHeader className="space-y-1 pb-3">
          <CardTitle>New mock</CardTitle>
          <CardDescription>Problems are picked for your level. Submissions count as practice too.</CardDescription>
        </CardHeader>
        <CardContent>
          <MockStartForm />
        </CardContent>
      </Card>
      {mocks.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No mock assessments yet" description="Your scores will be listed here." />
      ) : (
        <ul className="space-y-2" aria-label="Past mock assessments">
          {mocks.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm" data-testid="mock-row">
              <Link href={`/playground/problems/mock/${m.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                <LocalTime date={m.startedAt} format="datetime" />
              </Link>
              <span className="text-muted-foreground">
                {m.problems.length} problems · {m.durationMin} min
              </span>
              <span className="ml-auto">
                {m.finishedAt ? (
                  <Badge variant={m.score !== null && m.score >= 70 ? 'success' : 'warning'} className="tabular-nums">
                    Score {m.score ?? 0}
                  </Badge>
                ) : (
                  <Badge variant="info">In progress</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
