'use client'
import { FileUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PathBannerProps {
  fileName: string | null
  /** The banner came from a paste (offer to paste the text anyway). */
  fromPaste: boolean
  onImport: () => void
  onPasteAnyway?: () => void
  onDismiss: () => void
}

/**
 * Shown instead of compiling when main.tex (or a paste) is just a local file
 * path. Browsers can't read files by path, so lee says so and offers Import.
 */
export function PathBanner({ fileName, fromPaste, onImport, onPasteAnyway, onDismiss }: PathBannerProps) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">That&apos;s a file path, not LaTeX.</span> Browsers can&apos;t open files from your computer by
        their path. Import {fileName ? <code className="font-mono">{fileName}</code> : 'the file'} instead?
      </p>
      <Button type="button" size="sm" className="h-7" onClick={onImport}>
        <FileUp className="size-3.5" /> Import file
      </Button>
      {fromPaste && onPasteAnyway ? (
        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={onPasteAnyway}>
          Paste as text
        </Button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded p-0.5 hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
