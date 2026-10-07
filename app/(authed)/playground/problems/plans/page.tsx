import Link from 'next/link'
import { CheckCircle2, Circle, CircleDot } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as codingQ from '@/lib/db/queries/academyCoding'
import { statusOf } from '@/lib/academy/coding/list'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'
import { DIFFICULTY_LABELS } from '@/lib/academy/problems/schema'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DIFFICULTY_TONE, STATUS_LABELS } from '@/components/playground/problems/labels'
import { ProgressBar } from '@/components/playground/problems/summary-cards'

export const dynamic = 'force-dynamic'

const ICON = { todo: Circle, attempted: CircleDot, solved: CheckCircle2 } as const
const ICON_CLASS = { todo: 'text-muted-foreground', attempted: 'text-warning', solved: 'text-success' } as const

/** Curated study plans with progress bars (content/academy/problems/study-plans.ts). */
export default async function StudyPlansPage() {
  const userId = await requireUserId()
  const catalog = loadProblemCatalog()
  const progress = new Map((await codingQ.listProgress(userId)).map((p) => [p.problemSlug, p]))
  return (
    <div className="space-y-6">
      <PageHeader title="Study plans" description="Curated problem lists for the roles you are targeting, with your progress." />
      <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2">
        {catalog.plans.map((plan) => {
          const problems = plan.problems.flatMap((slug) => {
            const p = catalog.bySlug.get(slug)
            return p ? [{ p, status: statusOf(progress.get(slug)) }] : []
          })
          const solved = problems.filter((x) => x.status === 'solved').length
          return (
            <Card key={plan.id} data-testid="study-plan">
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="flex items-center justify-between gap-2">
                  {plan.title}
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    {solved}/{problems.length}
                  </span>
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <ProgressBar value={solved} total={problems.length} label={`${plan.title} progress`} />
              </CardHeader>
              <CardContent>
                <details>
                  <summary className="cursor-pointer text-sm text-primary">Show the {problems.length} problems</summary>
                  <ol className="mt-2 space-y-1.5">
                    {problems.map(({ p, status }) => {
                      const Icon = ICON[status]
                      return (
                        <li key={p.slug} className="flex min-w-0 items-center gap-2 text-sm">
                          <Icon className={`size-4 shrink-0 ${ICON_CLASS[status]}`} aria-label={STATUS_LABELS[status]} role="img" />
                          <Link href={`/playground/problems/${p.slug}`} className="min-w-0 truncate underline-offset-4 hover:underline">
                            {p.title}
                          </Link>
                          <Badge variant={DIFFICULTY_TONE[p.difficulty]} className="ml-auto shrink-0">
                            {DIFFICULTY_LABELS[p.difficulty]}
                          </Badge>
                        </li>
                      )
                    })}
                  </ol>
                </details>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
