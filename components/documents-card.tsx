'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Download,
  FileText,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  TextCursorInput,
  Trash2,
} from 'lucide-react'
import type { DocumentSummary as Document } from '@/lib/db/queries/documents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { relativeFromNow } from '@/lib/ui/date'
import { StalenessBadge } from '@/components/staleness-badge'
import { CvScoreBadge } from '@/components/cv-score/cv-score-badge'
import type { DocScore } from '@/lib/cv-score/fit'

const DocumentRenameDialog = dynamic(
  () => import('@/components/document-rename-dialog').then((m) => m.DocumentRenameDialog),
  { ssr: false },
)
import { FeedbackButtons } from '@/components/feedback-buttons'
import { UsageBadge } from '@/components/ai/usage-badge'
import type { AiUsage } from '@/lib/ai/usage-types'
import { logImplicitAction } from '@/lib/ui/implicit-signals'

// The merge dialog pulls in @dnd-kit; keep it out of /applications/[id]'s
// first-load bundle. Hover/focus on the trigger warms the chunk.
function preloadMergeDialog(): void {
  void import('@/components/merge-documents-dialog')
}

interface MergeTriggerButtonProps {
  onClick?: () => void
  onPointerEnter?: () => void
  onFocus?: () => void
  loading?: boolean
}

/** Same look as the dialog's own trigger, so the swap is invisible. */
function MergeTriggerButton({ onClick, onPointerEnter, onFocus, loading }: MergeTriggerButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onFocus={onFocus}
      disabled={loading}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
      Merge documents
    </Button>
  )
}

const MergeDocumentsDialog = dynamic(
  () => import('@/components/merge-documents-dialog').then((m) => m.MergeDocumentsDialog),
  { ssr: false, loading: () => <MergeTriggerButton loading /> },
)

type DocumentKind =
  | 'master_cv'
  | 'tailored_cv'
  | 'cover_letter'
  | 'latex_cv'
  | 'latex_cover_letter'
  | 'merged_pdf'

interface DocumentsCardProps {
  applicationId: string
  documents: Document[]
  /** Latest CV score per document id (CV rows only). */
  scores?: Record<string, DocScore>
  /** v18 — AI usage per document id (tokens · model · latency). */
  usage?: Record<string, AiUsage>
}

const KIND_LABELS: Record<DocumentKind, string> = {
  master_cv: 'Master CV',
  tailored_cv: 'Tailored CV',
  cover_letter: 'Cover letter',
  latex_cv: 'LaTeX CV',
  latex_cover_letter: 'LaTeX Letter',
  merged_pdf: 'Merged',
}

const KIND_BADGE: Record<
  DocumentKind,
  'blue' | 'violet' | 'emerald' | 'neutral' | 'indigo'
> = {
  master_cv: 'neutral',
  tailored_cv: 'violet',
  cover_letter: 'blue',
  latex_cv: 'indigo',
  latex_cover_letter: 'indigo',
  merged_pdf: 'neutral',
}

function isLatexKind(kind: DocumentKind): boolean {
  return kind === 'latex_cv' || kind === 'latex_cover_letter'
}

function generateEndpoint(applicationId: string, kind: DocumentKind): string | null {
  if (kind === 'tailored_cv') {
    return `/api/applications/${applicationId}/documents/generate-tailored`
  }
  if (kind === 'cover_letter') {
    return `/api/applications/${applicationId}/documents/generate-cover-letter`
  }
  // No "regenerate from AI" endpoint for master or LaTeX docs.
  return null
}

export function DocumentsCard({
  applicationId,
  documents,
  scores = {},
  usage = {},
}: DocumentsCardProps) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'tailored' | 'cover_letter'>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null)
  const [renaming, setRenaming] = useState<Document | null>(null)
  // The merge dialog (and @dnd-kit) is fetched on the first click only.
  const [mergeRequested, setMergeRequested] = useState(false)

  async function generate(
    kind: 'tailored' | 'cover_letter',
    priorDocId?: string,
  ): Promise<void> {
    setBusy(kind)
    if (priorDocId) void logImplicitAction(priorDocId, 'regenerated')
    try {
      const endpoint =
        kind === 'tailored'
          ? `/api/applications/${applicationId}/documents/generate-tailored`
          : `/api/applications/${applicationId}/documents/generate-cover-letter`
      const res = await fetch(endpoint, { method: 'POST' })
      const json = (await res.json()) as {
        documentId?: string
        error?: string
        skipped?: boolean
        message?: string
        fixHint?: string
      }
      if (json.skipped) {
        toast.warning(
          json.message
            ? `${json.message}${json.fixHint ? ` — ${json.fixHint}` : ''}`
            : 'Generation skipped.',
        )
      } else if (res.ok && json.documentId) {
        toast.success(kind === 'tailored' ? 'Tailored CV generated' : 'Cover letter drafted')
        router.refresh()
      } else {
        toast.error(json.error ?? 'Could not generate document.')
      }
    } catch {
      toast.error('Network error — could not generate document.')
    } finally {
      setBusy(null)
    }
  }

  async function regenerate(doc: Document): Promise<void> {
    const kind = doc.kind as DocumentKind
    if (kind === 'tailored_cv') {
      await generate('tailored', doc.id)
    } else if (kind === 'cover_letter') {
      await generate('cover_letter', doc.id)
    } else {
      toast.error('Master CV is regenerated from Settings → CV.')
    }
  }

  // Only AI-generated docs get thumbs; the master CV is user-authored.
  function isRatable(kind: DocumentKind): boolean {
    return kind === 'tailored_cv' || kind === 'cover_letter'
  }

  async function performDelete(doc: Document): Promise<void> {
    setDeletingId(doc.id)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
      const json = (await res.json()) as { success?: boolean; error?: string }
      if (res.ok && json.success) {
        toast.success('Document deleted')
        router.refresh()
      } else {
        toast.error(json.error ?? 'Could not delete document.')
      }
    } catch {
      toast.error('Network error — could not delete document.')
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">Documents</CardTitle>
        <Badge variant="outline" className="text-[10px]">
          {documents.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <FileText className="size-5" />
            <span>No documents yet.</span>
          </div>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => {
              const kind = doc.kind as DocumentKind
              return (
                <li
                  key={doc.id}
                  className="flex items-start gap-2 rounded-md border p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={KIND_BADGE[kind]} className="text-[10px]">
                        {KIND_LABELS[kind] ?? kind}
                      </Badge>
                      <span className="truncate font-medium">{doc.title}</span>
                      <CvScoreBadge documentId={doc.id} score={scores[doc.id]} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        v{doc.version} · {relativeFromNow(doc.createdAt)}
                      </span>
                      <StalenessBadge documentId={doc.id} />
                    </div>
                    {isRatable(kind) ? (
                      <>
                        <FeedbackButtons
                          documentId={doc.id}
                          caption={null}
                          className="mt-1"
                        />
                        <UsageBadge usage={usage[doc.id]} className="mt-1" />
                      </>
                    ) : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Actions"
                        disabled={deletingId === doc.id}
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="size-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isLatexKind(kind) ? (
                        <DropdownMenuItem asChild>
                          <Link href={`/documents/${doc.id}/edit`}>
                            <Pencil className="size-4" />
                            Edit LaTeX
                          </Link>
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem asChild>
                        <Link href={`/api/documents/${doc.id}/pdf`} target="_blank">
                          <Download className="size-4" />
                          Download PDF
                        </Link>
                      </DropdownMenuItem>
                      {generateEndpoint(applicationId, kind) ? (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault()
                            void regenerate(doc)
                          }}
                        >
                          <RefreshCw className="size-4" />
                          Regenerate
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onSelect={() => setRenaming(doc)}>
                        <TextCursorInput className="size-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          setConfirmDelete(doc)
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void generate('tailored')
            }}
            disabled={busy !== null}
          >
            {busy === 'tailored' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {busy === 'tailored' ? 'Generating…' : '+ Generate tailored CV'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void generate('cover_letter')
            }}
            disabled={busy !== null}
          >
            {busy === 'cover_letter' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {busy === 'cover_letter' ? 'Generating…' : '+ Draft cover letter'}
          </Button>
        </div>
        {documents.length > 0 ? (
          <div className="pt-1">
            {mergeRequested ? (
              <MergeDocumentsDialog
                documents={documents}
                applicationId={applicationId}
                triggerLabel="Merge documents"
                defaultOpen
              />
            ) : (
              <MergeTriggerButton
                onClick={() => setMergeRequested(true)}
                onPointerEnter={preloadMergeDialog}
                onFocus={preloadMergeDialog}
              />
            )}
          </div>
        ) : null}
      </CardContent>

      {renaming ? (
        <DocumentRenameDialog
          documentId={renaming.id}
          currentTitle={renaming.title}
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null)
          }}
        />
      ) : null}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              This will permanently remove {confirmDelete?.title ?? 'this document'}. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={deletingId !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirmDelete) void performDelete(confirmDelete)
              }}
              disabled={deletingId !== null}
            >
              {deletingId !== null ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
