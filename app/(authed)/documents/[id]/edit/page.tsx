import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import * as documentsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import { LatexEditor } from '@/components/latex-editor'
import { readCompileSettings } from '@/lib/latex/compile-settings'

export const dynamic = 'force-dynamic'

interface EditPageProps {
  params: Promise<{ id: string }>
}

export default async function EditLatexPage({ params }: EditPageProps) {
  const userId = await requireUserId()
  const { id } = await params
  const doc = await documentsQ.getById(userId, id)
  if (!doc) notFound()
  if (doc.kind !== 'latex_cv' && doc.kind !== 'latex_cover_letter') {
    // The editor is LaTeX-only for now. Non-latex docs use their own view.
    notFound()
  }

  const content = latexDocumentContentSchema.safeParse(doc.content)
  const initialSource = content.success ? content.data.source : ''
  const compileError = content.success ? content.data.compileError : undefined
  const compileLog = content.success ? content.data.compileLog : undefined
  const initialAssets = await assetsQ.list(userId, doc.id)

  // The workspace fills the app shell's content area edge to edge (the
  // negative margins cancel <main>'s padding), like Overleaf's editor.
  return (
    <div className="-mx-4 -my-6 md:-mx-8 md:-my-8">
      <LatexEditor
        documentId={doc.id}
        initialTitle={doc.title}
        initialSource={initialSource}
        initialError={compileError ? { message: compileError, log: compileLog ?? '' } : null}
        initialAssets={initialAssets}
        initialSettings={readCompileSettings(content.success ? content.data.compileSettings : undefined)}
      />
    </div>
  )
}
