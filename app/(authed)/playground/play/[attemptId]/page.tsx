import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import { playView } from '@/lib/academy/service/views'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { ChoiceWorkbench } from '@/components/playground/choice-workbench'
import { FORMAT_LABELS, MODE_LABELS } from '@/components/playground/labels'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** v13 §11 — the workbench for one attempt (13.0: the built-in choice formats). */
export default async function PlayPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const userId = await requireUserId()
  const { attemptId } = await params
  if (!UUID_RE.test(attemptId)) notFound()
  const view = await playView(userId, attemptId)
  if (!view) notFound()
  return (
    <div className="space-y-6">
      <PageHeader
        title={view.skillName}
        description={`${FORMAT_LABELS[view.format] ?? view.format} · ${MODE_LABELS[view.mode] ?? view.mode}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {view.result ? <Badge variant="secondary">Submitted</Badge> : null}
            <Link href={`/playground/skills/${view.skillId}`} className="text-sm text-primary underline-offset-4 hover:underline">
              Skill details
            </Link>
          </div>
        }
      />
      <ChoiceWorkbench initial={view} />
    </div>
  )
}
