import { requireUserId } from '@/lib/auth/require-session'
import * as applicationsQ from '@/lib/db/queries/applications'
import * as documentsQ from '@/lib/db/queries/documents'
import { PageHeader } from '@/components/page-header'
import { CvScoreWorkbench } from '@/components/cv-score/cv-score-workbench'
import type { AppOption, CvDocOption } from '@/components/cv-score/source-picker'

export const dynamic = 'force-dynamic'

const CV_KINDS = new Set(['master_cv', 'tailored_cv', 'latex_cv'])
const ACTIVE = ['interview', 'screen', 'applied', 'saved']
const TABS = ['score', 'compare', 'batch'] as const

interface CvScorePageProps {
  searchParams: Promise<{ documentId?: string | string[]; applicationId?: string | string[]; tab?: string | string[] }>
}

const one = (v: string | string[] | undefined): string => (typeof v === 'string' ? v : '')

export default async function CvScorePage({ searchParams }: CvScorePageProps) {
  const userId = await requireUserId()
  const params = await searchParams
  const [docs, apps] = await Promise.all([documentsQ.list(userId), applicationsQ.list(userId)])

  const documents: CvDocOption[] = docs
    .filter((d) => CV_KINDS.has(d.kind))
    .sort((a, b) => (a.kind === b.kind ? b.version - a.version : a.kind.localeCompare(b.kind)))
    .map((d) => ({ id: d.id, title: d.title, kind: d.kind as CvDocOption['kind'], applicationId: d.applicationId }))

  // Active applications first (most relevant targets), then the rest.
  const rank = (s: string): number => {
    const i = ACTIVE.indexOf(s)
    return i === -1 ? ACTIVE.length : i
  }
  const applications: AppOption[] = [...apps]
    .sort((a, b) => rank(a.status) - rank(b.status))
    .map((a) => ({ id: a.id, title: a.job.title, company: a.job.company?.name ?? null, status: a.status }))

  const requestedDoc = one(params.documentId)
  const requestedApp = one(params.applicationId)
  const tab = one(params.tab)
  const master = documents.find((d) => d.kind === 'master_cv')

  return (
    <div className="space-y-4">
      <PageHeader
        title="CV Score"
        description="Score any CV on its own or against a job — Total Match, Role, Skills, Experience, ATS, Impact, Readability and Structure, with fixes."
      />
      <CvScoreWorkbench
        documents={documents}
        applications={applications}
        initialDocumentId={documents.some((d) => d.id === requestedDoc) ? requestedDoc : (master?.id ?? '')}
        initialApplicationId={applications.some((a) => a.id === requestedApp) ? requestedApp : ''}
        initialTab={(TABS as readonly string[]).includes(tab) ? (tab as (typeof TABS)[number]) : 'score'}
      />
    </div>
  )
}
