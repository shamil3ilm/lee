'use client'
import { useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { FileText, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { BACKEND_NAMES, type CompileBackend } from '@/lib/latex/compile-settings'
import { compiledLabel } from '@/lib/latex/editor-prefs'
import type { ZoomMode } from '@/lib/latex/pdf-zoom'
import type { LastCompile } from '@/components/latex/use-latex-compile'
import { CompileMenu, type CompileMenuProps } from './compile-menu'
import { DownloadButton, LogsButton, PdfNav } from './pdf-toolbar'

const PdfViewer = dynamic(() => import('./pdf-viewer'), {
  ssr: false,
  loading: () => <PaneMessage busy>Loading the PDF viewer…</PaneMessage>,
})

function PaneMessage({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 bg-muted/60 text-xs text-muted-foreground" role="status">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {children}
    </div>
  )
}

export interface PdfPaneProps {
  compile: CompileMenuProps
  previewState: 'loading' | 'pdf' | 'empty'
  pdfBytes: Uint8Array | null
  pdfUrl: string | null
  pdfIsDraft: boolean
  service: CompileBackend | null
  serviceNote: string
  lastCompile: LastCompile | null
  downloadName: string
  errors: number
  warnings: number
  logsOpen: boolean
  onLogs: (open: boolean) => void
  /** The logs view (problems panel), shown in place of the PDF. */
  logs: ReactNode
  dark: boolean
  onDark: (on: boolean) => void
}

/**
 * The PDF column: the Recompile split button, logs and download on the left
 * of its toolbar, page navigation and zoom on the right; below, the PDF, the
 * logs view, or an empty / loading state. A thin bar shows a compile in
 * progress without moving anything.
 */
export function PdfPane(p: PdfPaneProps) {
  const [zoom, setZoom] = useState<ZoomMode>('fit-width')
  const [scale, setScale] = useState(1)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [goTo, setGoTo] = useState({ page: 1, seq: 0 })
  const [viewerError, setViewerError] = useState<string | null>(null)
  const hasPdf = p.previewState === 'pdf' && p.pdfBytes !== null

  return (
    <section aria-label="PDF preview" className="@container/pdf flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <CompileMenu {...p.compile} />
        {p.compile.autoCompile ? (
          <span
            data-testid="auto-compile-badge"
            title="Auto compile is on: recompiles a moment after you stop typing"
            className="hidden rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary @sm/pdf:inline"
          >
            Auto
          </span>
        ) : null}
        <LogsButton errors={p.errors} warnings={p.warnings} open={p.logsOpen} onToggle={() => p.onLogs(!p.logsOpen)} />
        <DownloadButton url={p.pdfUrl} filename={p.downloadName} />
        {p.lastCompile ? (
          <span className="hidden truncate text-[11px] text-muted-foreground @2xl/pdf:inline" data-testid="last-compiled">
            {compiledLabel(p.lastCompile.at, p.lastCompile.durationMs)}
          </span>
        ) : null}
        <div className="ml-auto" />
        <PdfNav
          page={page}
          pages={pages}
          scale={scale}
          dark={p.dark}
          hasPdf={hasPdf}
          onPage={(n) => {
            setPage(n)
            setGoTo((g) => ({ page: n, seq: g.seq + 1 }))
          }}
          onZoom={setZoom}
          onDark={p.onDark}
        />
      </div>
      <div className="relative min-h-0 flex-1">
        {p.compile.compiling ? (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/20" role="progressbar" aria-label="Compiling">
            <div className="h-full w-1/3 animate-[lee-indeterminate_1.1s_ease-in-out_infinite] bg-primary" />
          </div>
        ) : null}
        {p.logsOpen ? (
          p.logs
        ) : hasPdf && p.pdfBytes ? (
          viewerError ? (
            <PaneMessage>The PDF could not be displayed: {viewerError}</PaneMessage>
          ) : (
            <PdfViewer
              bytes={p.pdfBytes}
              zoom={zoom}
              dark={p.dark}
              goTo={goTo}
              onPages={(n) => {
                setPages(n)
                setPage((cur) => Math.min(cur, n))
                setViewerError(null)
              }}
              onPageChange={setPage}
              onScale={setScale}
              onError={setViewerError}
            />
          )
        ) : p.previewState === 'loading' ? (
          <PaneMessage busy>{p.compile.compiling ? 'Compiling…' : 'Loading preview…'}</PaneMessage>
        ) : (
          <div className="flex h-full items-center justify-center bg-muted/60 p-6">
            <EmptyState
              icon={FileText}
              title="Compile to see the PDF"
              description="Press Recompile or Ctrl/⌘+Enter. With Auto compile on, the preview refreshes a moment after you stop typing."
              className="w-full max-w-sm border-border bg-card"
              action={
                <Button type="button" size="sm" onClick={p.compile.onCompile} disabled={p.compile.compiling}>
                  <RefreshCw className="size-4" />
                  Compile now
                </Button>
              }
            />
          </div>
        )}
        {!p.logsOpen && hasPdf && (p.service === 'ytotech' || p.pdfIsDraft) ? (
          <div className="pointer-events-none absolute right-3 top-2 flex gap-1">
            {p.service === 'ytotech' ? (
              <span className="rounded bg-background/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm" title={p.serviceNote}>
                Compiled on {BACKEND_NAMES.ytotech}
              </span>
            ) : null}
            {p.pdfIsDraft ? (
              <span className="rounded bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning shadow-sm">Draft preview</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
