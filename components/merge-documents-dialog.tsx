'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  FileText,
  GripVertical,
  Layers,
  Loader2,
  Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Document } from '@/lib/db/queries/documents'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'

interface MergeItem {
  key: string
  kind: 'document' | 'asset'
  id: string
  label: string
  hint?: string
}

interface MergeDocumentsDialogProps {
  documents: Document[]
  applicationId?: string
  defaultTitle?: string
  triggerLabel?: string
  triggerIcon?: React.ReactNode
  variant?: 'outline' | 'default' | 'ghost'
  size?: 'sm' | 'default'
}

/**
 * Kinds whose GET /api/documents/[id]/pdf endpoint produces a PDF that
 * pdf-lib can concatenate. Merging outreach text drafts makes no sense
 * (they are plain text) so we filter them out of the picker.
 */
const PDF_KINDS = new Set<string>([
  'master_cv',
  'tailored_cv',
  'cover_letter',
  'interview_prep_pack',
  'latex_cv',
  'latex_cover_letter',
  'merged_pdf',
])

function KIND_LABEL(kind: string): string {
  switch (kind) {
    case 'master_cv':
      return 'Master CV'
    case 'tailored_cv':
      return 'Tailored CV'
    case 'cover_letter':
      return 'Cover letter'
    case 'interview_prep_pack':
      return 'Prep pack'
    case 'latex_cv':
      return 'LaTeX CV'
    case 'latex_cover_letter':
      return 'LaTeX Letter'
    case 'merged_pdf':
      return 'Merged PDF'
    default:
      return kind
  }
}

function SortableRow({ item, onRemove }: { item: MergeItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.key })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm shadow-sm"
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {item.kind === 'document' ? (
        <FileText className="size-4 text-muted-foreground" />
      ) : (
        <Paperclip className="size-4 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.label}</div>
        {item.hint ? (
          <div className="truncate text-xs text-muted-foreground">{item.hint}</div>
        ) : null}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
        Remove
      </Button>
    </div>
  )
}

export function MergeDocumentsDialog({
  documents,
  applicationId,
  defaultTitle,
  triggerLabel = 'Merge documents',
  triggerIcon,
  variant = 'outline',
  size = 'sm',
}: MergeDocumentsDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState(defaultTitle ?? '')
  const [selected, setSelected] = useState<MergeItem[]>([])
  const [assetsByDoc, setAssetsByDoc] = useState<Map<string, AssetMetadata[]>>(new Map())
  const [loadingAssets, setLoadingAssets] = useState(false)

  const eligibleDocs = useMemo(
    () => documents.filter((d) => PDF_KINDS.has(d.kind)),
    [documents],
  )

  useEffect(() => {
    setTitle(defaultTitle ?? '')
  }, [defaultTitle])

  // Load assets for every document once the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function fetchAll(): Promise<void> {
      setLoadingAssets(true)
      const map = new Map<string, AssetMetadata[]>()
      await Promise.all(
        documents.map(async (d) => {
          try {
            const res = await fetch(`/api/documents/${d.id}/assets`)
            if (!res.ok) return
            const body = (await res.json()) as { assets?: AssetMetadata[] }
            if (body.assets) map.set(d.id, body.assets)
          } catch {
            // Ignore; the picker will still show the document itself.
          }
        }),
      )
      if (!cancelled) {
        setAssetsByDoc(map)
        setLoadingAssets(false)
      }
    }
    void fetchAll()
    return () => {
      cancelled = true
    }
  }, [open, documents])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function toggleDoc(doc: Document, checked: boolean): void {
    const key = `document:${doc.id}`
    if (checked) {
      setSelected((prev) =>
        prev.some((i) => i.key === key)
          ? prev
          : [
              ...prev,
              {
                key,
                kind: 'document',
                id: doc.id,
                label: doc.title,
                hint: KIND_LABEL(doc.kind),
              },
            ],
      )
    } else {
      setSelected((prev) => prev.filter((i) => i.key !== key))
    }
  }

  function toggleAsset(asset: AssetMetadata, checked: boolean): void {
    const key = `asset:${asset.id}`
    if (checked) {
      setSelected((prev) =>
        prev.some((i) => i.key === key)
          ? prev
          : [
              ...prev,
              {
                key,
                kind: 'asset',
                id: asset.id,
                label: asset.filename,
                hint: asset.mimeType,
              },
            ],
      )
    } else {
      setSelected((prev) => prev.filter((i) => i.key !== key))
    }
  }

  function onDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSelected((items) => {
      const oldIndex = items.findIndex((i) => i.key === active.id)
      const newIndex = items.findIndex((i) => i.key === over.id)
      if (oldIndex < 0 || newIndex < 0) return items
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  function submit(): void {
    if (selected.length === 0) {
      toast.error('Pick at least one document or asset to merge.')
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/documents/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sources: selected.map((i) => ({ kind: i.kind, id: i.id })),
            applicationId: applicationId ?? null,
            title: title.trim() || undefined,
          }),
        })
        const body = (await res.json()) as {
          documentId?: string
          downloadUrl?: string
          error?: string
        }
        if (!res.ok || !body.documentId || !body.downloadUrl) {
          toast.error(body.error ?? 'Could not merge documents.')
          return
        }
        toast.success('Merged PDF created')
        window.open(body.downloadUrl, '_blank')
        setOpen(false)
        setSelected([])
        router.refresh()
      } catch {
        toast.error('Network error — merge failed.')
      }
    })
  }

  const selectedKeys = new Set(selected.map((i) => i.key))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size}>
          {triggerIcon ?? <Layers className="size-4" />}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge documents</DialogTitle>
          <DialogDescription>
            Pick documents and assets to concatenate into a single PDF. Drag to reorder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="merge-title">Title</Label>
            <Input
              id="merge-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle ?? 'Application package'}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Available ({eligibleDocs.length} docs)
              </div>
              <div className="max-h-[16rem] space-y-2 overflow-y-auto rounded-md border p-2">
                {eligibleDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No PDF-producing documents available.
                  </p>
                ) : (
                  eligibleDocs.map((d) => {
                    const docKey = `document:${d.id}`
                    const docChecked = selectedKeys.has(docKey)
                    const assets = assetsByDoc.get(d.id) ?? []
                    return (
                      <div key={d.id} className="space-y-1">
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={docChecked}
                            onChange={(e) => toggleDoc(d, e.target.checked)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{d.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {KIND_LABEL(d.kind)} · v{d.version}
                            </span>
                          </span>
                        </label>
                        {assets.length > 0 ? (
                          <div className="ml-6 space-y-0.5 border-l pl-2">
                            {assets.map((a) => {
                              const assetKey = `asset:${a.id}`
                              return (
                                <label
                                  key={a.id}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedKeys.has(assetKey)}
                                    onChange={(e) => toggleAsset(a, e.target.checked)}
                                  />
                                  <Paperclip className="size-3 text-muted-foreground" />
                                  <span className="truncate">{a.filename}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {a.mimeType}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
                {loadingAssets ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Loading attachments…
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Order ({selected.length})
              </div>
              <div className="max-h-[16rem] overflow-y-auto rounded-md border p-2">
                {selected.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nothing selected yet. Pick items on the left.
                  </p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext
                      items={selected.map((i) => i.key)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {selected.map((item) => (
                          <SortableRow
                            key={item.key}
                            item={item}
                            onRemove={() =>
                              setSelected((prev) => prev.filter((i) => i.key !== item.key))
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending || selected.length === 0}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
            Merge & download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
