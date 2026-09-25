'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ChevronLeft,
  Download,
  Eye,
  FileCode2,
  Loader2,
  PlayCircle,
  Save,
} from 'lucide-react'
import { loader, type OnMount } from '@monaco-editor/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { saveLatexSource } from '@/app/(authed)/documents/[id]/edit/actions'
import { LatexAssetsDialog } from '@/components/latex-assets-dialog'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'
import { defaultSnippetForAsset } from '@/lib/latex/snippets'
import { extractLatexHint } from '@/lib/latex/errors'

// Pull Monaco's JS + workers from a CDN so we don't bundle ~2MB of editor
// assets into the client chunk for this route. This only loads when a user
// actually hits /documents/[id]/edit.
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs',
  },
})

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <Skeleton className="h-full w-full" />
      </div>
    ),
  },
)

interface LatexEditorProps {
  documentId: string
  initialTitle: string
  initialSource: string
  initialError: { message: string; log: string } | null
  initialAssets: AssetMetadata[]
}

type CompileError = { message: string; log: string }

const DEBOUNCE_MS = 1500

export function LatexEditor({
  documentId,
  initialTitle,
  initialSource,
  initialError,
  initialAssets,
}: LatexEditorProps) {
  const [source, setSource] = useState(initialSource)
  const [title, setTitle] = useState(initialTitle)
  const [saving, setSaving] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [error, setError] = useState<CompileError | null>(initialError)
  const [previewKey, setPreviewKey] = useState(0)
  const [showErrorPanel, setShowErrorPanel] = useState<boolean>(initialError !== null)
  const [assets, setAssets] = useState<AssetMetadata[]>(initialAssets)
  const [dragActive, setDragActive] = useState(false)
  // Mobile-only pane toggle. Desktop (md+) always shows both side-by-side, so
  // this state is ignored there; on mobile we swap between source and preview
  // via a segmented control so neither pane gets a useless ~50vw column.
  const [mobilePane, setMobilePane] = useState<'source' | 'preview'>('source')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSource = useRef(initialSource)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)

  const runCompile = useCallback(
    async (sourceToCompile: string) => {
      setCompiling(true)
      try {
        const res = await fetch('/api/latex/compile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ documentId, source: sourceToCompile }),
        })
        if (res.ok) {
          setError(null)
          setShowErrorPanel(false)
          // Bust the preview iframe cache so it re-fetches the newly compiled PDF.
          setPreviewKey((k) => k + 1)
        } else {
          const errJson = (await res.json().catch(() => ({}))) as {
            error?: string
            log?: string
          }
          const nextError = {
            message: errJson.error ?? 'Compile failed',
            log: errJson.log ?? '',
          }
          setError(nextError)
          setShowErrorPanel(true)
        }
      } catch (err) {
        setError({
          message: 'Network error while compiling.',
          log: err instanceof Error ? err.message : String(err),
        })
        setShowErrorPanel(true)
      } finally {
        setCompiling(false)
      }
    },
    [documentId],
  )

  // Auto-compile debounce on source change.
  useEffect(() => {
    if (source === initialSource && previewKey === 0) {
      // On first mount, kick off an initial compile so the preview isn't
      // blank if the last compile was stale/failed.
      return
    }
    latestSource.current = source
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      void runCompile(latestSource.current)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
    // We intentionally only re-run this effect when the source changes;
    // runCompile is stable per documentId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  /** Insert a snippet at the editor's current cursor and bring focus back. */
  const insertAtCursor = useCallback((snippet: string): void => {
    const editor = editorRef.current
    if (!editor) {
      // Fallback: append to the end of the source when Monaco isn't ready.
      setSource((s) => (s.endsWith('\n') ? s + snippet + '\n' : s + '\n' + snippet + '\n'))
      return
    }
    const monaco = monacoRef.current
    const selection = editor.getSelection()
    const position = editor.getPosition()
    const range =
      selection ??
      (monaco && position
        ? new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column,
          )
        : null)
    if (!range) {
      setSource((s) => (s.endsWith('\n') ? s + snippet + '\n' : s + '\n' + snippet + '\n'))
      return
    }
    editor.executeEdits('assets-insert', [
      { range, text: snippet + '\n', forceMoveMarkers: true },
    ])
    editor.focus()
  }, [])

  // Attach a native drop listener to the editor DOM node once Monaco mounts.
  // The dragover/dragleave handlers control the visible drop overlay; the
  // drop handler routes to the shared upload path exposed by the assets
  // dialog (see `__latexAssetsUpload`).
  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      const dom = editor.getDomNode()
      if (!dom) return
      const onDragEnter = (e: DragEvent) => {
        if (e.dataTransfer?.types.includes('Files')) {
          e.preventDefault()
          setDragActive(true)
        }
      }
      const onDragOver = (e: DragEvent) => {
        if (e.dataTransfer?.types.includes('Files')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }
      const onDragLeave = (e: DragEvent) => {
        // The relatedTarget is null when leaving the viewport entirely; use
        // that to distinguish "moved to a child" (ignore) from "left".
        if (!e.relatedTarget || !(dom.contains(e.relatedTarget as Node))) {
          setDragActive(false)
        }
      }
      const onDrop = async (e: DragEvent) => {
        e.preventDefault()
        setDragActive(false)
        const files = e.dataTransfer?.files
        if (!files || files.length === 0) return
        const uploader = (window as unknown as {
          __latexAssetsUpload?: (files: FileList | File[]) => Promise<AssetMetadata[]>
        }).__latexAssetsUpload
        if (!uploader) {
          toast.error('Assets panel not ready — try again in a moment.')
          return
        }
        const uploaded = await uploader(files)
        for (const asset of uploaded) {
          insertAtCursor(defaultSnippetForAsset(asset))
        }
      }
      dom.addEventListener('dragenter', onDragEnter)
      dom.addEventListener('dragover', onDragOver)
      dom.addEventListener('dragleave', onDragLeave)
      dom.addEventListener('drop', (e) => {
        void onDrop(e)
      })
    },
    [insertAtCursor],
  )

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

  function handleManualCompile(): void {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    void runCompile(source)
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

  const hint = error ? extractLatexHint(error.log) : null

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back to documents">
            <Link href="/documents">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            // Mobile: fill the row so the title is legible/edittable without
            // horizontal scrolling. md+: cap at 18rem so it doesn't push the
            // action cluster off-screen.
            className="min-w-0 flex-1 md:w-72 md:max-w-72 md:flex-none"
            placeholder="Document title"
            aria-label="Document title"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {compiling ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Compiling…
            </span>
          ) : null}
          {/* Mobile-only pane toggle. Segmented button pair mirrors iOS/Android
              conventions and lets the user swap views instead of squinting at
              a 200px-wide iframe. */}
          <div className="inline-flex items-center rounded-md border bg-muted p-0.5 md:hidden">
            <button
              type="button"
              onClick={() => setMobilePane('source')}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                mobilePane === 'source'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
              aria-pressed={mobilePane === 'source'}
            >
              <FileCode2 className="size-3.5" />
              Source
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('preview')}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                mobilePane === 'preview'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
              aria-pressed={mobilePane === 'preview'}
            >
              <Eye className="size-3.5" />
              Preview
            </button>
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
            onClick={handleManualCompile}
            disabled={compiling}
          >
            <PlayCircle className="size-4" />
            <span className="hidden sm:inline">Compile</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Download .tex</span>
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </div>

      {/*
        Layout:
        - Mobile (<md): single column; only the currently-selected pane mounts
          via the mobilePane toggle. Both are conditionally shown so Monaco
          keeps its state and the iframe doesn't reload on toggle.
        - md+: two-column split as before.
      */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <div
          className={cn(
            'relative h-full min-h-[400px] border-b md:border-b-0 md:border-r',
            mobilePane === 'preview' && 'hidden md:block',
          )}
        >
          <MonacoEditor
            height="100%"
            language="latex"
            theme="vs-dark"
            value={source}
            onChange={(v) => setSource(v ?? '')}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
          {dragActive ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/10 backdrop-blur-sm ring-2 ring-inset ring-primary">
              <p className="rounded-md bg-background/90 px-4 py-2 text-sm font-medium shadow">
                Drop files to attach
              </p>
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            'relative h-full min-h-[400px] bg-muted/20',
            mobilePane === 'source' && 'hidden md:block',
          )}
        >
          <iframe
            key={previewKey}
            src={`/api/documents/${documentId}/pdf?v=${previewKey}`}
            title="LaTeX PDF preview"
            className="h-full w-full bg-white"
          />
          {error && showErrorPanel ? (
            <div className="absolute inset-x-0 bottom-0 max-h-[45%] overflow-y-auto border-t border-destructive/40 bg-destructive/10 p-3 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <p className="flex items-center gap-1 font-semibold text-destructive">
                  <AlertTriangle className="size-3" />
                  {error.message}
                </p>
                <button
                  type="button"
                  onClick={() => setShowErrorPanel(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
              {hint ? (
                <p className="mb-2 rounded border border-amber-400/40 bg-amber-100/60 px-2 py-1 font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                  Suggestion: {hint.message}
                </p>
              ) : null}
              <pre className={cn('whitespace-pre-wrap break-words font-mono text-[11px]')}>
                {error.log.slice(0, 4000)}
                {error.log.length > 4000 ? '\n…(truncated)' : ''}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
