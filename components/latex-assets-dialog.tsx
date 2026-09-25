'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'
import { buildAssetSnippet, insertVariants, type SnippetVariant } from '@/lib/latex/snippets'

interface AssetsDialogProps {
  documentId: string
  assets: AssetMetadata[]
  onAssetsChange: (assets: AssetMetadata[]) => void
  /**
   * Called with a LaTeX snippet to insert at the current cursor position.
   * The editor owns cursor state; this component only produces text.
   */
  onInsertSnippet: (snippet: string) => void
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/')
}

function isPdf(mime: string): boolean {
  return mime === 'application/pdf'
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function LatexAssetsDialog({
  documentId,
  assets,
  onAssetsChange,
  onInsertSnippet,
}: AssetsDialogProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = useCallback(
    async (files: FileList | File[]): Promise<AssetMetadata[]> => {
      const list = Array.from(files)
      if (list.length === 0) return []
      setUploading(true)
      try {
        const form = new FormData()
        for (const f of list) form.append('file', f)
        const res = await fetch(`/api/documents/${documentId}/assets`, {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          toast.error(body.error ?? 'Upload failed.')
          return []
        }
        const body = (await res.json()) as {
          assets: AssetMetadata[]
          errors?: { filename: string; error: string }[]
        }
        for (const e of body.errors ?? []) {
          toast.error(`${e.filename}: ${e.error}`)
        }
        if (body.assets.length > 0) {
          onAssetsChange([...assets, ...body.assets])
          const first = body.assets[0]
          toast.success(
            body.assets.length === 1 && first
              ? `Uploaded ${first.filename}`
              : `Uploaded ${body.assets.length} files`,
          )
        }
        return body.assets
      } catch (err) {
        toast.error('Upload failed.')
        // Swallow — the toast already told the user; logging happens server-side.
        void err
        return []
      } finally {
        setUploading(false)
      }
    },
    [assets, documentId, onAssetsChange],
  )

  // Expose the uploader to the outer editor via a ref-like escape hatch so
  // drag-drop on the editor surface can reuse this component's upload path.
  useEffect(() => {
    ;(window as unknown as { __latexAssetsUpload?: typeof uploadFiles }).__latexAssetsUpload =
      uploadFiles
    return () => {
      delete (window as unknown as { __latexAssetsUpload?: typeof uploadFiles })
        .__latexAssetsUpload
    }
  }, [uploadFiles])

  async function handleDelete(filename: string): Promise<void> {
    const res = await fetch(
      `/api/documents/${documentId}/assets/${encodeURIComponent(filename)}`,
      { method: 'DELETE' },
    )
    if (!res.ok) {
      toast.error('Could not delete asset.')
      return
    }
    onAssetsChange(assets.filter((a) => a.filename !== filename))
    toast.success(`Deleted ${filename}`)
  }

  function handleInsert(asset: AssetMetadata, variant: SnippetVariant): void {
    onInsertSnippet(buildAssetSnippet(asset, variant))
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Paperclip className="size-4" />
          Assets{assets.length > 0 ? ` (${assets.length})` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Document assets</DialogTitle>
          <DialogDescription>
            Images, PDFs, or other files attached to this document. Drop files onto the editor to
            upload, or use the button below. Files are bundled with the .tex source at compile
            time.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b pb-2">
          <p className="text-xs text-muted-foreground">
            {assets.length} of 20 assets · 5 MB max per file
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload
            </Button>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {assets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No assets yet. Drop files onto the editor or click Upload.
            </p>
          ) : (
            <ul className="divide-y">
              {assets.map((asset) => (
                <li key={asset.id} className="flex items-center gap-3 py-2">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
                    {isImage(asset.mimeType) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/documents/${documentId}/assets/${encodeURIComponent(asset.filename)}`}
                        alt={asset.filename}
                        className="size-full object-cover"
                      />
                    ) : isPdf(asset.mimeType) ? (
                      <FileText className="size-5 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{asset.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {asset.mimeType} · {humanBytes(asset.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {insertVariants(asset).map((variant) => (
                      <Button
                        key={variant.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleInsert(asset, variant.id)}
                        title={variant.description}
                      >
                        {variant.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleDelete(asset.filename)}
                      title="Delete"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
