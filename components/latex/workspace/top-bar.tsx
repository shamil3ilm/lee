'use client'
import Link from 'next/link'
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  Columns2,
  Download,
  ExternalLink,
  FileCode2,
  FileUp,
  Loader2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  TriangleAlert,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { EditorLayout } from '@/lib/latex/editor-prefs'
import { cn } from '@/lib/utils'
import type { SaveState } from './use-autosave'

interface TopBarProps {
  title: string
  onTitle: (title: string) => void
  saveState: SaveState
  onSave: () => void
  layout: EditorLayout
  onLayout: (layout: EditorLayout) => void
  onSwap: () => void
  narrow: boolean
  pdfUrl: string | null
  onImport: () => void
  onDownloadTex: () => void
}

const SAVE_TEXT: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
}

function SaveStatus({ state, onSave }: { state: SaveState; onSave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSave}
      title="Save now (Ctrl/⌘+S also compiles)"
      aria-live="polite"
      data-testid="save-state"
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        state === 'error' ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {state === 'saving' ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : state === 'error' ? (
        <TriangleAlert className="size-3.5" />
      ) : state === 'saved' ? (
        <Check className="size-3.5" />
      ) : null}
      <span className="hidden @md/editor:inline">{SAVE_TEXT[state]}</span>
      <span className="sr-only @md/editor:hidden">{SAVE_TEXT[state]}</span>
    </button>
  )
}

/**
 * One compact row: back, the inline-editable title (centred, like
 * Overleaf's project name), and on the right the Editor/PDF switch on
 * narrow screens, the save state, the Layout menu and More.
 */
export function TopBar(p: TopBarProps) {
  return (
    <div className="relative flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2">
      <Link
        href="/documents"
        aria-label="Back to documents"
        title="Back to documents"
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <div
        className={cn(
          'flex min-w-0 justify-center',
          p.narrow ? 'flex-1' : 'pointer-events-none absolute inset-x-0 px-28 @3xl/editor:px-40',
        )}
      >
        <input
          value={p.title}
          onChange={(e) => p.onTitle(e.target.value)}
          aria-label="Document title"
          placeholder="Untitled document"
          maxLength={200}
          className={cn(
            'pointer-events-auto h-7 w-full max-w-md truncate rounded-md border-0 bg-transparent px-2 text-sm font-semibold hover:bg-muted/70 focus:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            p.narrow ? 'text-left' : 'text-center',
          )}
        />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {p.narrow ? (
          <div className="inline-flex items-center rounded-md border bg-muted p-0.5" role="group" aria-label="Show">
            {(['editor', 'pdf'] as const).map((pane) => (
              <button
                key={pane}
                type="button"
                onClick={() => p.onLayout(pane)}
                aria-pressed={p.layout === pane}
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium',
                  p.layout === pane ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                )}
              >
                {pane === 'editor' ? 'Editor' : 'PDF'}
              </button>
            ))}
          </div>
        ) : null}
        <SaveStatus state={p.saveState} onSave={p.onSave} />
        {!p.narrow ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Layout"
                title="Layout"
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Columns2 className="size-4" />
                <span className="hidden @3xl/editor:inline">Layout</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Layout</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={p.layout} onValueChange={(v) => p.onLayout(v as EditorLayout)}>
                <DropdownMenuRadioItem value="split">
                  <Columns2 className="size-4" /> Editor &amp; PDF
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="editor">
                  <PanelLeft className="size-4" /> Editor only
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="pdf">
                  <PanelRight className="size-4" /> PDF only
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={p.onSwap}>
                <ArrowLeftRight className="size-4" /> Swap editor and PDF
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!p.pdfUrl} onSelect={() => p.pdfUrl && window.open(p.pdfUrl, '_blank', 'noopener')}>
                <ExternalLink className="size-4" /> PDF in a separate tab
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More document actions"
              title="More"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={p.onImport}>
              <FileUp className="size-4" /> Import file…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onDownloadTex}>
              <FileCode2 className="size-4" /> Download .tex
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!p.pdfUrl} onSelect={() => p.pdfUrl && window.open(p.pdfUrl, '_blank', 'noopener')}>
              <Download className="size-4" /> Open the PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={p.onSave}>
              Save now
              <DropdownMenuShortcut>Ctrl/⌘+S</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
