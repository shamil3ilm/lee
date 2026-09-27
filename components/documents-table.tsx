'use client'
import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, FileText, Loader2, Pencil, TextCursorInput, Trash2 } from 'lucide-react'
import type { DocumentSummary as Document } from '@/lib/db/queries/documents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { relativeFromNow } from '@/lib/ui/date'
import { StalenessBadge } from '@/components/staleness-badge'
import { CvScoreBadge } from '@/components/cv-score/cv-score-badge'
import type { DocScore } from '@/lib/cv-score/fit'

const DocumentRenameDialog = dynamic(
  () => import('@/components/document-rename-dialog').then((m) => m.DocumentRenameDialog),
  { ssr: false },
)

type DocumentKind =
  | 'master_cv'
  | 'tailored_cv'
  | 'cover_letter'
  | 'outreach_linkedin_connection'
  | 'outreach_linkedin_message'
  | 'outreach_recruiter_reply'
  | 'outreach_followup_email'
  | 'interview_prep_pack'
  | 'latex_cv'
  | 'latex_cover_letter'
  | 'merged_pdf'

// The filter chip value maps to the URL `?kind=` param. The bespoke `outreach`,
// `interview_prep`, and `latex` values are prefix-matched server-side in the
// page (the backend query filters by exact kind, so grouping is done at the
// page level).
type FilterValue =
  | 'all'
  | 'master_cv'
  | 'tailored_cv'
  | 'cover_letter'
  | 'outreach'
  | 'interview_prep'
  | 'latex'
  | 'merged'

interface DocumentsTableProps {
  documents: Document[]
  currentFilter: FilterValue
  /** Latest CV score per document id; unscored documents are absent. */
  scores?: Record<string, DocScore>
}

const KIND_LABELS: Record<DocumentKind, string> = {
  master_cv: 'Master CV',
  tailored_cv: 'Tailored CV',
  cover_letter: 'Cover letter',
  outreach_linkedin_connection: 'LinkedIn Connect',
  outreach_linkedin_message: 'LinkedIn Message',
  outreach_recruiter_reply: 'Recruiter Reply',
  outreach_followup_email: 'Follow-up',
  interview_prep_pack: 'Interview Prep',
  latex_cv: 'LaTeX CV',
  latex_cover_letter: 'LaTeX Letter',
  merged_pdf: 'Merged',
}

const KIND_BADGE: Record<
  DocumentKind,
  'blue' | 'violet' | 'neutral' | 'emerald' | 'indigo'
> = {
  master_cv: 'neutral',
  tailored_cv: 'violet',
  cover_letter: 'blue',
  outreach_linkedin_connection: 'violet',
  outreach_linkedin_message: 'violet',
  outreach_recruiter_reply: 'violet',
  // v4.2 — follow-ups sit under the same "Outreach" filter, so they share the
  // violet badge palette with the rest of the outreach kinds.
  outreach_followup_email: 'violet',
  interview_prep_pack: 'emerald',
  latex_cv: 'indigo',
  latex_cover_letter: 'indigo',
  merged_pdf: 'neutral',
}

const FILTER_CHIPS: ReadonlyArray<{ label: string; value: FilterValue }> = [
  { label: 'All', value: 'all' },
  { label: 'Master CV', value: 'master_cv' },
  { label: 'Tailored CV', value: 'tailored_cv' },
  { label: 'Cover Letter', value: 'cover_letter' },
  { label: 'Outreach', value: 'outreach' },
  { label: 'Interview Prep', value: 'interview_prep' },
  { label: 'LaTeX', value: 'latex' },
  { label: 'Merged', value: 'merged' },
]

function isLatexKind(kind: DocumentKind): boolean {
  return kind === 'latex_cv' || kind === 'latex_cover_letter'
}

export function DocumentsTable({ documents, currentFilter, scores = {} }: DocumentsTableProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<Document | null>(null)

  function setFilter(v: FilterValue): void {
    startTransition(() => {
      if (v === 'all') router.push('/documents')
      else router.push(`/documents?kind=${v}`)
    })
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

  const activeValue: FilterValue = currentFilter

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_CHIPS.map((chip) => {
            const active = chip.value === activeValue
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setFilter(chip.value)}
                disabled={pending}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet."
          description="Tailored CVs and cover letters start from your master CV in Settings › CV."
          action={
            <Button asChild size="sm">
              <Link href="/settings/cv">Set up your CV</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          {/* Columns fold away as the screen narrows (kind and date move under
              the title) so Title and Actions always fit without clipping. */}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="hidden md:table-cell">Kind</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden lg:table-cell">Application</TableHead>
                <TableHead className="hidden xl:table-cell">Version</TableHead>
                <TableHead className="hidden whitespace-nowrap sm:table-cell">CV score</TableHead>
                <TableHead className="hidden xl:table-cell">Freshness</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {documents.map((doc) => {
                  const kind = doc.kind as DocumentKind
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant={KIND_BADGE[kind]} className="whitespace-nowrap text-[10px]">
                          {KIND_LABELS[kind] ?? kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-full max-w-0">
                        <div className="truncate font-medium" title={doc.title}>
                          {doc.title}
                        </div>
                        <div className="truncate text-xs text-muted-foreground md:hidden">
                          {KIND_LABELS[kind] ?? kind} · {relativeFromNow(doc.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {doc.applicationId ? (
                          <Link
                            href={`/applications/${doc.applicationId}`}
                            className="text-primary hover:underline"
                          >
                            View
                          </Link>
                        ) : (
                          <span>—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs tabular-nums xl:table-cell">v{doc.version}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <CvScoreBadge
                          documentId={doc.id}
                          score={scores[doc.id]}
                          fallback={<span className="text-xs text-muted-foreground">—</span>}
                        />
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <StalenessBadge
                          documentId={doc.id}
                          fallback={<span className="text-xs text-muted-foreground">—</span>}
                        />
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                        {relativeFromNow(doc.createdAt)}
                      </TableCell>
                      <TableCell className="w-px whitespace-nowrap pl-0 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {isLatexKind(kind) ? (
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${doc.title}`}
                            >
                              <Link href={`/documents/${doc.id}/edit`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Rename ${doc.title}`}
                            onClick={() => setRenaming(doc)}
                          >
                            <TextCursorInput className="size-4" />
                          </Button>
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            aria-label={`Download ${doc.title} as PDF`}
                          >
                            <Link href={`/api/documents/${doc.id}/pdf`} target="_blank">
                              <Download className="size-4" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${doc.title}`}
                            onClick={() => setConfirmDelete(doc)}
                            disabled={deletingId === doc.id}
                          >
                            {deletingId === doc.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </Card>
      )}

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
    </div>
  )
}
