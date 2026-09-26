'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, HardDrive, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
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
import { DriveConnectButton } from '@/components/drive/drive-connect-button'
import {
  attachFromDrive,
  fetchDriveStatus,
  fetchPickerToken,
  uploadAsset,
  type DriveStatus,
} from '@/components/drive/asset-upload'
import { isPickerConfigured, pickDriveFiles } from '@/components/drive/google-picker'

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
  const [attaching, setAttaching] = useState(false)
  const [drive, setDrive] = useState<DriveStatus | null>(null)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname()

  // Drive status is only needed once the dialog opens (cheap, no Google call).
  useEffect(() => {
    if (!open || drive) return
    let live = true
    void fetchDriveStatus().then((s) => {
      if (live && s) setDrive(s)
    })
    return () => {
      live = false
    }
  }, [open, drive])

  const uploadFiles = useCallback(
    async (files: FileList | File[]): Promise<AssetMetadata[]> => {
      const list = Array.from(files)
      if (list.length === 0) return []
      setUploading(true)
      try {
        const created: AssetMetadata[] = []
        for (const file of list) {
          const out = await uploadAsset(documentId, file)
          if (out.asset) created.push(out.asset)
          else toast.error(`${file.name}: ${out.error ?? 'Upload failed.'}`)
          if (out.connect) setNeedsReconnect(true)
        }
        if (created.length > 0) {
          onAssetsChange([...assets, ...created])
          const first = created[0]
          toast.success(
            created.length === 1 && first ? `Uploaded ${first.filename}` : `Uploaded ${created.length} files`,
          )
        }
        return created
      } finally {
        setUploading(false)
      }
    },
    [assets, documentId, onAssetsChange],
  )

  async function handleAttachFromDrive(): Promise<void> {
    setAttaching(true)
    try {
      const token = await fetchPickerToken()
      if ('error' in token) {
        toast.error(token.error)
        if (token.connect) setNeedsReconnect(true)
        return
      }
      const fileIds = await pickDriveFiles(token.accessToken)
      if (fileIds.length === 0) return
      const res = await attachFromDrive(documentId, fileIds)
      for (const e of res.errors) toast.error(e)
      if (res.connect) setNeedsReconnect(true)
      if (res.assets.length > 0) {
        onAssetsChange([...assets, ...res.assets])
        toast.success(`Attached ${res.assets.length} file(s) from Google Drive`)
      }
    } catch {
      toast.error('Could not open Google Drive.')
    } finally {
      setAttaching(false)
    }
  }

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
            {drive?.backend === 'drive' ? ' · saved to your Google Drive' : ''}
          </p>
          <div className="flex items-center gap-2">
            {drive && (!drive.connected || needsReconnect) ? (
              <DriveConnectButton returnTo={pathname ?? '/documents'} reconnect={drive.connected} />
            ) : null}
            {drive?.connected && !needsReconnect && isPickerConfigured() ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={attaching}
                onClick={() => void handleAttachFromDrive()}
              >
                {attaching ? <Loader2 className="size-4 animate-spin" /> : <HardDrive className="size-4" />}
                Attach from Drive
              </Button>
            ) : null}
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
