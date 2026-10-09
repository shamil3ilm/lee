'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { undoLastImportAction } from '@/app/(authed)/settings/profile/reset-actions'
import type { ImportBatchView } from '@/lib/reset/types'
import { shortDate } from '@/lib/ui/date'
import { importSourceLabel } from '@/lib/import/labels'

/** One click: reverse the most recent import (within 7 days) from its provenance. */
export function UndoLastImport({ last }: { last: ImportBatchView | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!last) return <p className="text-xs text-muted-foreground">No import in the last 7 days to undo.</p>
  const undo = (): void =>
    start(async () => {
      const r = await undoLastImportAction()
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Import undone', {
        description: `${r.removed} removed, ${r.restored} restored${r.connections > 0 ? `, ${r.connections.toLocaleString('en-US')} connections removed` : ''}.`,
      })
      router.refresh()
    })
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3" data-testid="undo-last-import">
      <p className="text-sm">
        Last import: <span className="font-medium">{importSourceLabel(last.source)}</span>, {shortDate(last.importedAt)}
        <span className="block text-xs text-muted-foreground">Removes what it added and puts back what it replaced (where you have not changed it since).</span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={undo} disabled={pending}>
        <Undo2 className="size-3.5" aria-hidden="true" />
        {pending ? 'Undoing…' : 'Undo last import'}
      </Button>
    </div>
  )
}
