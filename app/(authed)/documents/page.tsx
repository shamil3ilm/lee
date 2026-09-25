import { requireUserId } from '@/lib/auth/require-session'
import * as documentsQ from '@/lib/db/queries/documents'
import { PageHeader } from '@/components/page-header'
import { DocumentsTable } from '@/components/documents-table'

export const dynamic = 'force-dynamic'

// Filter values include exact-kind matches AND two "group" values (`outreach`
// spans three kinds; `interview_prep` is a friendlier alias for the single
// interview_prep_pack kind). Groups are filtered in-memory below because the
// DB query only handles exact kind matches.
const FILTER_VALUES = [
  'master_cv',
  'tailored_cv',
  'cover_letter',
  'outreach',
  'interview_prep',
  'latex',
] as const

type FilterValue = 'all' | (typeof FILTER_VALUES)[number]

function narrowFilter(v: unknown): FilterValue {
  if (typeof v !== 'string') return 'all'
  return (FILTER_VALUES as readonly string[]).includes(v) ? (v as FilterValue) : 'all'
}

interface DocumentsLibraryPageProps {
  searchParams: Promise<{ kind?: string | string[]; applicationId?: string | string[] }>
}

export default async function DocumentsLibraryPage({
  searchParams,
}: DocumentsLibraryPageProps) {
  const userId = await requireUserId()
  const params = await searchParams
  const filter = narrowFilter(params.kind)
  const applicationId =
    typeof params.applicationId === 'string' ? params.applicationId : undefined

  // Fetch all rows for this user (optionally scoped to an application), then
  // apply the group / exact-kind filter client-side to this page. This avoids
  // extending the query layer just to support two aggregate chips.
  const all = await documentsQ.list(userId, { applicationId })
  const documents =
    filter === 'all'
      ? all
      : filter === 'outreach'
        ? all.filter((d) => d.kind.startsWith('outreach_'))
        : filter === 'interview_prep'
          ? all.filter((d) => d.kind === 'interview_prep_pack')
          : filter === 'latex'
            ? all.filter((d) => d.kind.startsWith('latex_'))
            : filter === 'cover_letter'
              ? // Include both JSON cover letters AND LaTeX cover letters so
                // users see every cover letter under one chip regardless of
                // authoring format.
                all.filter(
                  (d) => d.kind === 'cover_letter' || d.kind === 'latex_cover_letter',
                )
              : all.filter((d) => d.kind === filter)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documents"
        description="All generated CVs, cover letters, outreach drafts, and interview prep packs."
      />
      <DocumentsTable documents={documents} currentFilter={filter} />
    </div>
  )
}
