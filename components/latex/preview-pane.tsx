'use client'
import { FileText, Loader2, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'

interface PreviewPaneProps {
  state: 'loading' | 'pdf' | 'empty'
  pdfUrl: string | null
  compiling: boolean
  onCompile: () => void
}

/**
 * The PDF side of the LaTeX editor. Until there is a PDF to show, it renders
 * a token-coloured placeholder (never a blank white iframe, which glared in
 * dark mode) with guidance and a Compile button.
 */
export function PreviewPane({ state, pdfUrl, compiling, onCompile }: PreviewPaneProps) {
  if (state === 'pdf' && pdfUrl) {
    return <iframe src={pdfUrl} title="LaTeX PDF preview" className="h-full w-full bg-white" />
  }
  if (state === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" />
        {compiling ? 'Compiling…' : 'Loading preview…'}
      </div>
    )
  }
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={FileText}
        title="Compile to see the PDF"
        description="Press Compile or Ctrl/⌘+Enter. With Auto-compile on, the preview refreshes whenever you stop typing."
        className="w-full max-w-sm border-border bg-card"
        action={
          <Button type="button" size="sm" onClick={onCompile} disabled={compiling}>
            <PlayCircle className="size-4" />
            Compile now
          </Button>
        }
      />
    </div>
  )
}
