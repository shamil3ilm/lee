import Link from 'next/link'
import { Layers } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as documentsQ from '@/lib/db/queries/documents'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { MergeDocumentsDialog } from '@/components/merge-documents-dialog'

export const dynamic = 'force-dynamic'

export default async function AdHocMergePage() {
  const userId = await requireUserId()
  const documents = await documentsQ.list(userId)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Merge PDFs"
        description="Pick any documents or assets across your library and combine them into a single PDF."
      />
      {documents.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nothing to merge yet."
          description="Generate a tailored CV or create a LaTeX document first; they appear here as merge sources."
          action={
            <Button asChild size="sm">
              <Link href="/documents/new/latex">New LaTeX document</Link>
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={Layers}
          title={`${documents.length} ${documents.length === 1 ? 'document' : 'documents'} available.`}
          description="Choose the sources and their order in the merger, then download one PDF."
          action={
            <MergeDocumentsDialog
              documents={documents}
              triggerLabel="Choose documents"
              variant="default"
              size="default"
            />
          }
        />
      )}
    </div>
  )
}
