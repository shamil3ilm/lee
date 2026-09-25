import { requireUserId } from '@/lib/auth/require-session'
import * as documentsQ from '@/lib/db/queries/documents'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { MergeDocumentsDialog } from '@/components/merge-documents-dialog'

export const dynamic = 'force-dynamic'

export default async function AdHocMergePage() {
  const userId = await requireUserId()
  const documents = await documentsQ.list(userId)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Merge documents"
        description="Pick any documents or assets across your library and concatenate them into a single PDF."
      />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            {documents.length === 0
              ? 'No documents yet. Generate a CV or upload a LaTeX doc to enable merging.'
              : `${documents.length} documents available. Open the merger to select sources.`}
          </p>
          <MergeDocumentsDialog
            documents={documents}
            triggerLabel="Open merger"
            variant="default"
            size="default"
          />
        </CardContent>
      </Card>
    </div>
  )
}
