import { requireUserId } from '@/lib/auth/require-session'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { attemptHistory } from '@/lib/academy/service/views'
import { PageHeader, Toolbar } from '@/components/page-header'
import { NativeSelect } from '@/components/ui/native-select'
import { HistoryList } from '@/components/playground/history-list'
import { AutoApplyForm } from '@/components/filters/auto-apply-form'
import { plural } from '@/lib/ui/labels'

export const dynamic = 'force-dynamic'

/**
 * v13 §10.1 — the attempt timeline. Records are append-only; each keeps the
 * content-pack and engine versions it was played on (replay and then-vs-now
 * comparisons come later).
 */
export default async function PlaygroundHistoryPage({ searchParams }: { searchParams: Promise<{ skill?: string }> }) {
  const userId = await requireUserId()
  const { skill } = await searchParams
  const content = loadAcademyContent()
  const skillId = skill && content.graph.byId.has(skill) ? skill : undefined
  const entries = await attemptHistory(userId, { skillId, limit: 100 })
  return (
    <div className="space-y-6">
      <PageHeader title="History" description="Every finished item, newest first. History is kept; nothing here is overwritten." />
      <Toolbar>
        <AutoApplyForm
          action="/playground/history"
          label="Filter history"
          status={plural(entries.length, 'finished item')}
          className="flex flex-wrap items-center gap-2"
        >
          <NativeSelect name="skill" defaultValue={skillId ?? ''} className="h-8 w-56 max-w-full" aria-label="Skill">
            <option value="">All skills</option>
            {content.graph.skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </AutoApplyForm>
      </Toolbar>
      <HistoryList entries={entries} />
    </div>
  )
}
