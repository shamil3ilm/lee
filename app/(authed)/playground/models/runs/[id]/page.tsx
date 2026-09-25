import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import * as runsQ from '@/lib/db/queries/labRuns'
import { toRunView } from '@/lib/lab/views'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { RunResults } from '@/components/lab/run-results'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function LabRunPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId()
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const found = await runsQ.getRunWithResults(userId, id)
  if (!found) notFound()
  const run = toRunView(found.run, found.results)
  const c = run.config
  const created = new Date(run.createdAt).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return (
    <div className="space-y-6">
      <PageHeader
        title="Arena run"
        description={`${created} · ${run.results.length} models${run.blind ? ' · blind' : ''}`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/playground/models/arena">New run</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-3 p-4 text-sm">
          {c.system ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">System</p>
              <p className="whitespace-pre-wrap break-words">{c.system}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-medium text-muted-foreground">Prompt</p>
            <p className="whitespace-pre-wrap break-words">{c.prompt}</p>
          </div>
          {c.jsonSchema ? (
            <details>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">JSON schema</summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-xs">
                {JSON.stringify(c.jsonSchema, null, 2)}
              </pre>
            </details>
          ) : null}
          <p className="text-xs text-muted-foreground">
            temperature {c.temperature ?? 'default'} · max tokens {c.maxTokens ?? 'default'}
          </p>
        </CardContent>
      </Card>
      <RunResults run={run} />
    </div>
  )
}
