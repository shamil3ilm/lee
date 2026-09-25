'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { AlertTriangle, ChevronLeft, Download, Loader2, PlayCircle, Save } from 'lucide-react'
import { loader } from '@monaco-editor/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { saveLatexSource } from '@/app/(authed)/documents/[id]/edit/actions'

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
}

type CompileError = { message: string; log: string }

const DEBOUNCE_MS = 1500

export function LatexEditor({
  documentId,
  initialTitle,
  initialSource,
  initialError,
}: LatexEditorProps) {
  const [source, setSource] = useState(initialSource)
  const [title, setTitle] = useState(initialTitle)
  const [saving, setSaving] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [error, setError] = useState<CompileError | null>(initialError)
  const [previewKey, setPreviewKey] = useState(0)
  const [showErrorPanel, setShowErrorPanel] = useState<boolean>(initialError !== null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSource = useRef(initialSource)

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

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back to documents">
            <Link href="/documents">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-72"
            placeholder="Document title"
            aria-label="Document title"
          />
        </div>
        <div className="flex items-center gap-2">
          {compiling ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Compiling…
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualCompile}
            disabled={compiling}
          >
            <PlayCircle className="size-4" />
            Compile
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
          >
            <Download className="size-4" />
            Download .tex
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <div className="h-full min-h-[400px] border-b md:border-b-0 md:border-r">
          <MonacoEditor
            height="100%"
            language="latex"
            theme="vs-dark"
            value={source}
            onChange={(v) => setSource(v ?? '')}
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>

        <div className="relative h-full min-h-[400px] bg-muted/20">
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
