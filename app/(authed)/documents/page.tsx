import { requireUserId } from '@/lib/auth/require-session'
import * as documentsQ from '@/lib/db/queries/documents'
import { PageHeader } from '@/components/page-header'
import { DocumentsTable } from '@/components/documents-table'

export const dynamic = 'force-dynamic'

const DOCUMENT_KINDS = ['master_cv', 'tailored_cv', 'cover_letter'] as const
type DocumentKind = (typeof DOCUMENT_KINDS)[number]

function narrowKind(v: unknown): DocumentKind | undefined {
  return typeof v === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(v)
    ? (v as DocumentKind)
    : undefined
}

interface DocumentsLibraryPageProps {
  searchParams: Promise<{ kind?: string | string[]; applicationId?: string | string[] }>
}

export default async function DocumentsLibraryPage({
  searchParams,
}: DocumentsLibraryPageProps) {
  const userId = await requireUserId()
  const params = await searchParams
  const kind = narrowKind(params.kind)
  const applicationId =
    typeof params.applicationId === 'string' ? params.applicationId : undefined
  const documents = await documentsQ.list(userId, { kind, applicationId })
  return (
    <div className="space-y-4">
      <PageHeader
        title="Documents"
        description="All generated CVs and cover letters."
      />
      <DocumentsTable documents={documents} currentKind={kind ?? null} />
    </div>
  )
}
