'use client'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  ChevronLeft,
  Download,
  Eye,
  FileCode2,
  ListTree,
  Loader2,
  MoreHorizontal,
  PlayCircle,
  Save,
  Zap,
  ImageOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PreviewPane } from '@/components/latex/preview-pane'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { saveLatexSource } from '@/app/(authed)/documents/[id]/edit/actions'
import { LatexAssetsDialog } from '@/components/latex-assets-dialog'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'
import { defaultSnippetForAsset } from '@/lib/latex/snippets'
import { extractLatexHint, isMainFile, parseLatexLog } from '@/lib/latex/errors'
import { extractOutline } from '@/lib/latex/outline'
import type { CodeEditorHandle } from '@/components/latex/code-editor'
import type { CompileDiagnostic } from '@/components/latex/cm-setup'
import { OutlinePanel } from '@/components/latex/outline-panel'
import { ProblemsPanel } from '@/components/latex/problems-panel'
import { useBibSources } from '@/components/latex/use-bib-sources'
import { useLatexCompile, type CompileError, type CompileSnapshot } from '@/components/latex/use-latex-compile'
import { CompileSettingsControl } from '@/components/latex/compile-settings-control'
import { BACKEND_NAMES, DEFAULT_COMPILE_SETTINGS, type CompileSettings } from '@/lib/latex/compile-settings'
import { packageLine } from '@/lib/latex/missing'

// CodeMirror 6 is bundled (no CDN) into its own chunk that only this route
// loads, after hydration. Until it arrives a plain textarea is editable, so
// slow phones can start typing at once. If the chunk cannot load (offline,
// blocked), the textarea simply stays: the editor degrades, never breaks.
const CodeEditor = dynamic(
  () => import('@/components/latex/code-editor').catch(() => ({ default: () => null })),
  { ssr: false, loading: () => null },
)

interface LatexEditorProps {
  documentId: string
  initialTitle: string
  initialSource: string
  initialError: CompileError | null
  initialAssets: AssetMetadata[]
  /** Saved compile service + engine (defaults: auto fallback, pdfLaTeX). */
  initialSettings?: CompileSettings
  /** Overrides the default full-viewport height (e.g. when a breadcrumb sits above). */
  className?: string
}

type UploadFn = (files: FileList | File[]) => Promise<AssetMetadata[]>

function ToggleButton({
  pressed,
  onClick,
  children,
  title,
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
        pressed
          ? 'border-primary/30 bg-primary/10 text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function LatexEditor({
  documentId,
  initialTitle,
  initialSource,
  initialError,
  initialAssets,
  initialSettings = DEFAULT_COMPILE_SETTINGS,
  className,
}: LatexEditorProps) {
  const [source, setSource] = useState(initialSource)
  const [title, setTitle] = useState(initialTitle)
  const [saving, setSaving] = useState(false)
  const [assets, setAssets] = useState<AssetMetadata[]>(initialAssets)
  const [dragActive, setDragActive] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const [draft, setDraft] = useState(false)
  const [settings, setSettings] = useState<CompileSettings>(initialSettings)
  const [outlineOpen, setOutlineOpen] = useState(false)
  // Narrow-editor pane toggle; wide editors always show source and preview side by side.
  const [mobilePane, setMobilePane] = useState<'source' | 'preview'>('source')
  const editorRef = useRef<CodeEditorHandle | null>(null)

  const compile = useLatexCompile({ documentId, initialError })
  const { notifyChange, compileNow } = compile
  const bibSources = useBibSources(documentId, assets)

  const assetKey = useMemo(
    () => assets.map((a) => `${a.id}:${a.filename}:${a.sizeBytes}`).join('|'),
    [assets],
  )
  const snapshot = useMemo<CompileSnapshot>(
    () => ({ source, draft, assetKey, settings }),
    [source, draft, assetKey, settings],
  )
  const snapshotRef = useRef(snapshot)
  const firstSnapshot = useRef(true)
  useEffect(() => {
    snapshotRef.current = snapshot
    // The saved source is already compiled (the preview loads it); only
    // changes after mount schedule an auto-compile.
    if (firstSnapshot.current) {
      firstSnapshot.current = false
      return
    }
    notifyChange(snapshot)
  }, [snapshot, notifyChange])

  const compileCurrent = useCallback(() => compileNow(snapshotRef.current), [compileNow])

  // Ctrl/Cmd+Enter and Ctrl/Cmd+S compile from anywhere on the page. Inside
  // CodeMirror its own keymap handles them first (and marks them handled).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key === 'Enter' || e.key.toLowerCase() === 's') {
        e.preventDefault()
        compileCurrent()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compileCurrent])

  /** Insert a snippet at the cursor (or `pos`); falls back to appending. */
  const insertAtCursor = useCallback((snippet: string, pos?: number | null): void => {
    const editor = editorRef.current
    if (editor) {
      editor.insertText(`${snippet}\n`, pos)
      return
    }
    setSource((s) => (s.endsWith('\n') ? `${s}${snippet}\n` : `${s}\n${snippet}\n`))
  }, [])

  const handleDropFiles = useCallback(
    async (files: FileList, pos: number | null) => {
      const uploader = (window as unknown as { __latexAssetsUpload?: UploadFn }).__latexAssetsUpload
      if (!uploader) {
        toast.error('Assets panel not ready — try again in a moment.')
        return
      }
      const uploaded = await uploader(files)
      uploaded.forEach((asset, i) => insertAtCursor(defaultSnippetForAsset(asset), i === 0 ? pos : null))
    },
    [insertAtCursor],
  )

  const jumpToLine = useCallback((line: number) => {
    setMobilePane('source')
    editorRef.current?.jumpTo(line)
  }, [])

  const onEditorReady = useCallback(() => setEditorReady(true), [])
  const onDropFiles = useCallback(
    (files: FileList, pos: number | null) => void handleDropFiles(files, pos),
    [handleDropFiles],
  )

  const parsedLog = useMemo(() => (compile.error ? parseLatexLog(compile.error.log) : null), [compile.error])
  const deferredSource = useDeferredValue(source)
  const hint = useMemo(
    () => (compile.error ? extractLatexHint(compile.error.log, deferredSource) : null),
    [compile.error, deferredSource],
  )
  const hintLine = hint?.kind === 'missing_package' && hint.subject ? packageLine(deferredSource, hint.subject) : null
  const switchToAuto = useCallback(() => setSettings((s) => ({ ...s, service: 'auto' })), [])
  // Say once (per distinct message) when a fallback or stand-in produced the PDF.
  const lastNotes = useRef('')
  useEffect(() => {
    const text = compile.outcome.notes.join(' ')
    if (text && text !== lastNotes.current) toast.info(text)
    lastNotes.current = text
  }, [compile.outcome])
  const compileDiagnostics = useMemo<CompileDiagnostic[]>(
    () =>
      (parsedLog?.all ?? [])
        .filter((e) => e.line !== null && isMainFile(e.file))
        .map((e) => ({
          line: e.line!,
          severity: e.severity === 'error' ? 'error' : e.severity === 'warning' ? 'warning' : 'info',
          message: e.message,
        })),
    [parsedLog],
  )
  const completionData = useMemo(
    () => ({ bibSources, assetFilenames: assets.map((a) => a.filename) }),
    [bibSources, assets],
  )
  const outline = useMemo(() => extractOutline(deferredSource), [deferredSource])

  async function handleSave(): Promise<void> {
    setSaving(true)
    try {
      const result = await saveLatexSource({ documentId, source, title })
      if ('error' in result) toast.error(result.error)
      else toast.success('Saved')
    } catch {
      toast.error('Could not save.')
    } finally {
      setSaving(false)
    }
  }

  function handleDownload(): void {
    const blob = new Blob([source], { type: 'application/x-tex' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9\-_. ]/gi, '_') || 'document'}.tex`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const outlinePanel = <OutlinePanel items={outline} onJump={jumpToLine} />

  return (
    // Layout responds to the editor's own width (container queries), not the
    // viewport: at tablet width the sidebar leaves ~480px, which is a phone
    // layout even though the viewport is "md".
    <div className={cn('@container/editor flex h-[calc(100vh-6rem)] flex-col', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
        <div className="flex min-w-[min(100%,14rem)] flex-1 items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back to documents">
            <Link href="/documents">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 flex-1 @4xl/editor:max-w-80"
            placeholder="Document title"
            aria-label="Document title"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {compile.compiling ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3 animate-spin" />
              <span className="hidden @lg/editor:inline">Compiling…</span>
            </span>
          ) : null}
          <div className="inline-flex items-center rounded-md border bg-muted p-0.5 @2xl/editor:hidden">
            {(['source', 'preview'] as const).map((pane) => (
              <button
                key={pane}
                type="button"
                onClick={() => setMobilePane(pane)}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                  mobilePane === pane ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                )}
                aria-pressed={mobilePane === pane}
              >
                {pane === 'source' ? <FileCode2 className="size-3.5" /> : <Eye className="size-3.5" />}
                {pane === 'source' ? 'Source' : 'Preview'}
              </button>
            ))}
          </div>
          <LatexAssetsDialog
            documentId={documentId}
            assets={assets}
            onAssetsChange={setAssets}
            onInsertSnippet={insertAtCursor}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={compileCurrent}
            disabled={compile.compiling}
            title="Compile (Ctrl/Cmd+Enter or Ctrl/Cmd+S)"
            aria-label="Compile"
          >
            <PlayCircle className="size-4" />
            <span className="hidden @lg/editor:inline">Compile</span>
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            aria-label="Save"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            <span className="hidden @lg/editor:inline">Save</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="More document actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleDownload}>
                <Download className="size-4" />
                Download .tex
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-3 py-1">
        <ToggleButton pressed={outlineOpen} onClick={() => setOutlineOpen((v) => !v)} title="Show the section outline">
          <ListTree className="size-3.5" />
          Outline
        </ToggleButton>
        <ToggleButton
          pressed={compile.autoCompile}
          onClick={() => compile.setAutoCompile(!compile.autoCompile)}
          title="Compile automatically when you stop typing"
        >
          <Zap className="size-3.5" />
          Auto-compile
        </ToggleButton>
        <ToggleButton
          pressed={draft}
          onClick={() => setDraft((v) => !v)}
          title="Draft mode: images are drawn as boxes for faster previews"
        >
          <ImageOff className="size-3.5" />
          Draft
        </ToggleButton>
        <CompileSettingsControl value={settings} onChange={setSettings} />
        <span className="ml-auto hidden text-[11px] text-muted-foreground @4xl/editor:inline">
          Ctrl/⌘+Enter to compile · Ctrl/⌘+F to find · Ctrl+Space for suggestions
        </span>
      </div>

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 overflow-hidden',
          outlineOpen ? '@2xl/editor:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)]' : '@2xl/editor:grid-cols-2',
        )}
      >
        {outlineOpen ? <aside className="hidden min-h-0 border-r @2xl/editor:block">{outlinePanel}</aside> : null}
        <div
          className={cn(
            'flex h-full min-h-[400px] flex-col border-b @2xl/editor:border-b-0 @2xl/editor:border-r',
            mobilePane === 'preview' && 'hidden @2xl/editor:flex',
          )}
        >
          {outlineOpen ? <div className="max-h-40 border-b @2xl/editor:hidden">{outlinePanel}</div> : null}
          <div className="relative min-h-0 flex-1">
            {!editorReady ? (
              <textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                aria-label="LaTeX source"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="absolute inset-0 z-10 h-full w-full resize-none bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
              />
            ) : null}
            <CodeEditor
              initialValue={source}
              handleRef={editorRef}
              onChange={setSource}
              onCompile={compileCurrent}
              onDropFiles={onDropFiles}
              onDragActive={setDragActive}
              completionData={completionData}
              compileDiagnostics={compileDiagnostics}
              onReady={onEditorReady}
            />
            {dragActive ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/10 ring-2 ring-inset ring-primary backdrop-blur-sm">
                <p className="rounded-md bg-background/90 px-4 py-2 text-sm font-medium shadow">Drop files to attach</p>
              </div>
            ) : null}
          </div>
          {compile.error && compile.problemsOpen && parsedLog ? (
            <ProblemsPanel
              title={compile.error.message}
              parsed={parsedLog}
              rawLog={compile.error.log}
              hint={hint}
              notes={compile.error.notes}
              hintLine={hintLine}
              onUseFallback={settings.service === 'auto' ? undefined : switchToAuto}
              onJump={jumpToLine}
              onClose={() => compile.setProblemsOpen(false)}
            />
          ) : null}
        </div>

        <div
          className={cn(
            'relative h-full min-h-[400px] bg-muted/20',
            mobilePane === 'source' && 'hidden @2xl/editor:block',
          )}
        >
          <PreviewPane
            state={compile.previewState}
            pdfUrl={compile.pdfUrl}
            compiling={compile.compiling}
            onCompile={compileCurrent}
          />
          {compile.error && !compile.problemsOpen ? (
            <button
              type="button"
              onClick={() => {
                compile.setProblemsOpen(true)
                setMobilePane('source')
              }}
              className="absolute bottom-3 left-3 rounded-md border border-destructive/40 bg-background px-2 py-1 text-xs font-medium text-destructive shadow"
            >
              Last compile failed · show problems
            </button>
          ) : null}
          {compile.outcome.service === 'ytotech' ? (
            <span
              className="pointer-events-none absolute left-3 top-3 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              title={compile.outcome.notes.join(' ')}
            >
              Compiled on {BACKEND_NAMES.ytotech}
            </span>
          ) : null}
          {compile.pdfIsDraft ? (
            <span className="pointer-events-none absolute right-3 top-3 rounded bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
              Draft preview
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
