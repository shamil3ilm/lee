'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createCompileScheduler, type CompileScheduler } from '@/lib/latex/auto-compile'
import {
  COMPILE_NOTES_HEADER,
  COMPILE_SERVICE_HEADER,
  decodeNotesHeader,
  type CompileBackend,
  type CompileSettings,
} from '@/lib/latex/compile-settings'

export interface CompileError {
  message: string
  log: string
  /** Why a fallback / stand-in ran (from the server), if any. */
  notes?: string[]
  /** True when a PDF was still produced ("try to compile anyway"). */
  withPdf?: boolean
}

/** Which service produced the shown PDF, and the notes that came with it. */
export interface CompileOutcome {
  service: CompileBackend | null
  notes: string[]
}

export interface CompileSnapshot {
  source: string
  draft: boolean
  /** Changes whenever the document's asset set changes. */
  assetKey: string
  settings: CompileSettings
}

export interface LastCompile {
  at: Date
  durationMs: number
}

const AUTO_COMPILE_STORAGE_KEY = 'lee.latex.autoCompile'

// Per-viewer preference in localStorage, with an in-memory fallback when
// storage is blocked (private mode), read through useSyncExternalStore so
// the server render (always "on") hydrates without a mismatch.
let memoryPreference = true
const preferenceListeners = new Set<() => void>()

function readAutoCompilePreference(): boolean {
  try {
    const stored = window.localStorage.getItem(AUTO_COMPILE_STORAGE_KEY)
    return stored === null ? memoryPreference : stored !== 'off'
  } catch {
    return memoryPreference
  }
}

function writeAutoCompilePreference(on: boolean): void {
  memoryPreference = on
  try {
    window.localStorage.setItem(AUTO_COMPILE_STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Storage blocked: the in-memory value still applies for this visit.
  }
  for (const listener of preferenceListeners) listener()
}

function subscribePreference(listener: () => void): () => void {
  preferenceListeners.add(listener)
  return () => preferenceListeners.delete(listener)
}

const keyOf = (s: CompileSnapshot): string =>
  `${s.draft ? 'draft' : 'final'}\0${s.settings.service}/${s.settings.engine}/${s.settings.stopOnError}\0${s.assetKey}\0${s.source}`

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((n): n is string => typeof n === 'string') : []
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

interface UseLatexCompileOptions {
  documentId: string
  initialError: CompileError | null
  /**
   * Runs before every compile; returning false cancels it (e.g. the source
   * is a pasted file path). Also where edited text assets are saved.
   */
  beforeCompile?: (snapshot: CompileSnapshot) => Promise<boolean>
}

interface CompileRunOptions {
  /** Skip the server's PDF cache ("Clear cache and recompile"). */
  fresh?: boolean
}

/**
 * Compile state for the LaTeX editor: auto-compile scheduling (debounce,
 * max wait, one in flight, unchanged sources skipped), the latest PDF (bytes
 * for the in-page viewer, a blob URL for download), the latest compile
 * error or warnings, and when it last compiled.
 */
export function useLatexCompile({ documentId, initialError, beforeCompile }: UseLatexCompileOptions) {
  const [compiling, setCompiling] = useState(false)
  const [error, setError] = useState<CompileError | null>(initialError)
  const [problemsOpen, setProblemsOpen] = useState(initialError !== null)
  const [pdf, setPdf] = useState<{ bytes: Uint8Array<ArrayBuffer>; url: string } | null>(null)
  const [pdfIsDraft, setPdfIsDraft] = useState(false)
  const [outcome, setOutcome] = useState<CompileOutcome>({ service: null, notes: [] })
  const [lastCompile, setLastCompile] = useState<LastCompile | null>(null)
  const autoCompile = useSyncExternalStore(subscribePreference, readAutoCompilePreference, () => true)
  const schedulerRef = useRef<CompileScheduler<CompileSnapshot> | null>(null)
  const pdfUrlRef = useRef<string | null>(null)
  const nextRun = useRef<CompileRunOptions>({})
  const beforeRef = useRef(beforeCompile)
  useEffect(() => {
    beforeRef.current = beforeCompile
  }, [beforeCompile])

  const showPdf = useCallback((bytes: Uint8Array<ArrayBuffer>) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    pdfUrlRef.current = url
    setPdf({ bytes, url })
  }, [])

  const runCompile = useCallback(
    async (snapshot: CompileSnapshot): Promise<void> => {
      const options = nextRun.current
      nextRun.current = {}
      if (beforeRef.current && !(await beforeRef.current(snapshot))) return
      setCompiling(true)
      const started = performance.now()
      try {
        const res = await fetch('/api/latex/compile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            documentId,
            source: snapshot.source,
            draft: snapshot.draft,
            settings: snapshot.settings,
            ...(options.fresh ? { fresh: true } : {}),
          }),
        })
        const type = res.headers.get('content-type') ?? ''
        if (res.ok && type.includes('pdf')) {
          // Show exactly the PDF this compile produced (draft or final)
          // instead of downloading it a second time from the PDF route.
          showPdf(new Uint8Array(await res.arrayBuffer()))
          setPdfIsDraft(snapshot.draft)
          const service = res.headers.get(COMPILE_SERVICE_HEADER)
          setOutcome({
            service: service === 'latexonline' || service === 'ytotech' ? service : null,
            notes: decodeNotesHeader(res.headers.get(COMPILE_NOTES_HEADER)),
          })
          setError(null)
          setProblemsOpen(false)
          return
        }
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
          log?: string
          notes?: unknown
          service?: unknown
          pdfBase64?: unknown
        }
        if (res.ok && typeof body.pdfBase64 === 'string') {
          // Compiled anyway despite errors: show the PDF and the errors.
          showPdf(base64ToBytes(body.pdfBase64))
          setPdfIsDraft(snapshot.draft)
          setOutcome({ service: body.service === 'ytotech' ? 'ytotech' : null, notes: strings(body.notes) })
          setError({ message: 'Compiled with errors', log: body.log ?? '', notes: strings(body.notes), withPdf: true })
          setProblemsOpen(true)
          return
        }
        setError({ message: body.error ?? 'Compile failed', log: body.log ?? '', notes: strings(body.notes) })
        setProblemsOpen(true)
      } catch {
        setError({
          message: 'Network error while compiling.',
          log: 'The compile request did not reach the server. Check your connection and try again.',
        })
        setProblemsOpen(true)
      } finally {
        setLastCompile({ at: new Date(), durationMs: performance.now() - started })
        setCompiling(false)
      }
    },
    [documentId, showPdf],
  )

  const runRef = useRef(runCompile)
  useEffect(() => {
    runRef.current = runCompile
  }, [runCompile])

  useEffect(() => {
    const scheduler = createCompileScheduler<CompileSnapshot>({
      keyOf,
      run: (snapshot) => runRef.current(snapshot),
    })
    schedulerRef.current = scheduler
    return () => {
      scheduler.dispose()
      schedulerRef.current = null
    }
  }, [])

  useEffect(() => {
    schedulerRef.current?.setEnabled(autoCompile)
  }, [autoCompile])

  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    },
    [],
  )

  const hasInitialError = initialError !== null
  // Load the saved PDF once. Until it (or a compile) arrives the preview
  // shows a themed empty state, and a document that has never compiled
  // keeps showing that guidance.
  const [savedPdfState, setSavedPdfState] = useState<'loading' | 'done'>(hasInitialError ? 'done' : 'loading')
  useEffect(() => {
    if (hasInitialError) return
    const controller = new AbortController()
    void (async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/pdf`, { signal: controller.signal })
        const isPdf = res.ok && (res.headers.get('content-type') ?? '').includes('pdf')
        if (!isPdf || pdfUrlRef.current) return
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (pdfUrlRef.current || controller.signal.aborted) return
        showPdf(bytes)
      } catch {
        // No saved PDF (or offline): the empty state explains how to compile.
      } finally {
        if (!controller.signal.aborted) setSavedPdfState('done')
      }
    })()
    return () => controller.abort()
  }, [documentId, hasInitialError, showPdf])

  /** What the preview pane should show right now. */
  const previewState: 'loading' | 'pdf' | 'empty' = pdf
    ? 'pdf'
    : savedPdfState === 'loading' || compiling
      ? 'loading'
      : 'empty'

  const notifyChange = useCallback((snapshot: CompileSnapshot) => {
    schedulerRef.current?.change(snapshot)
  }, [])

  const compileNow = useCallback((snapshot: CompileSnapshot, options: CompileRunOptions = {}) => {
    nextRun.current = options
    schedulerRef.current?.compileNow(snapshot)
  }, [])

  const setAutoCompile = useCallback((on: boolean) => writeAutoCompilePreference(on), [])

  return {
    compiling,
    error,
    pdfBytes: pdf?.bytes ?? null,
    pdfUrl: pdf?.url ?? null,
    pdfIsDraft,
    outcome,
    lastCompile,
    previewState,
    problemsOpen,
    setProblemsOpen,
    autoCompile,
    setAutoCompile,
    notifyChange,
    compileNow,
  }
}
