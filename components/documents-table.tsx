'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, FileText, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Document } from '@/lib/db/queries/documents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

export function DocumentsTable({ documents, currentFilter }: DocumentsTableProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
        <Button asChild size="sm" variant="default">
          <Link href="/documents/new/latex">
            <Plus className="size-4" />
            LaTeX CV
          </Link>
        </Button>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <FileText className="size-6" />
            <p className="font-medium text-foreground">No documents yet.</p>
            <p>
              Populate your CV at{' '}
              <Link href="/settings/cv" className="text-primary hover:underline">
                Settings → CV
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Application</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Freshness</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const kind = doc.kind as DocumentKind
                  return (
                    <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Badge variant={KIND_BADGE[kind]} className="text-[10px]">
                          {KIND_LABELS[kind] ?? kind}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[26rem] truncate font-medium">{doc.title}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
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
                      </td>
                      <td className="px-4 py-3 text-xs">v{doc.version}</td>
                      <td className="px-4 py-3">
                        <StalenessBadge documentId={doc.id} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {relativeFromNow(doc.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isLatexKind(kind) ? (
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              aria-label="Edit"
                            >
                              <Link href={`/documents/${doc.id}/edit`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                          ) : null}
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            aria-label="Download PDF"
                          >
                            <Link href={`/api/documents/${doc.id}/pdf`} target="_blank">
                              <Download className="size-4" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
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
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
