'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createCompileScheduler, type CompileScheduler } from '@/lib/latex/auto-compile'

export interface CompileError {
  message: string
  log: string
}

export interface CompileSnapshot {
  source: string
  draft: boolean
  /** Changes whenever the document's asset set changes. */
  assetKey: string
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

const keyOf = (s: CompileSnapshot): string => `${s.draft ? 'draft' : 'final'}\0${s.assetKey}\0${s.source}`

interface UseLatexCompileOptions {
  documentId: string
  initialError: CompileError | null
}

/**
 * Compile state for the LaTeX editor: auto-compile scheduling (debounce,
 * max wait, one in flight, unchanged sources skipped), the latest PDF as a
 * blob URL for the preview, and the latest compile error.
 */
export function useLatexCompile({ documentId, initialError }: UseLatexCompileOptions) {
  const [compiling, setCompiling] = useState(false)
  const [error, setError] = useState<CompileError | null>(initialError)
  const [problemsOpen, setProblemsOpen] = useState(initialError !== null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfIsDraft, setPdfIsDraft] = useState(false)
  const autoCompile = useSyncExternalStore(subscribePreference, readAutoCompilePreference, () => true)
  const schedulerRef = useRef<CompileScheduler<CompileSnapshot> | null>(null)
  const pdfUrlRef = useRef<string | null>(null)

  const runCompile = useCallback(
    async (snapshot: CompileSnapshot): Promise<void> => {
      setCompiling(true)
      try {
        const res = await fetch('/api/latex/compile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ documentId, source: snapshot.source, draft: snapshot.draft }),
        })
        if (res.ok) {
          // Show exactly the PDF this compile produced (draft or final)
          // instead of downloading it a second time from the PDF route.
          const url = URL.createObjectURL(await res.blob())
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
          pdfUrlRef.current = url
          setPdfUrl(url)
          setPdfIsDraft(snapshot.draft)
          setError(null)
          setProblemsOpen(false)
          return
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string; log?: string }
        setError({ message: body.error ?? 'Compile failed', log: body.log ?? '' })
        setProblemsOpen(true)
      } catch {
        setError({
          message: 'Network error while compiling.',
          log: 'The compile request did not reach the server. Check your connection and try again.',
        })
        setProblemsOpen(true)
      } finally {
        setCompiling(false)
      }
    },
    [documentId],
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

  const notifyChange = useCallback((snapshot: CompileSnapshot) => {
    schedulerRef.current?.change(snapshot)
  }, [])

  const compileNow = useCallback((snapshot: CompileSnapshot) => {
    schedulerRef.current?.compileNow(snapshot)
  }, [])

  const setAutoCompile = useCallback((on: boolean) => writeAutoCompilePreference(on), [])

  return {
    compiling,
    error,
    pdfUrl,
    pdfIsDraft,
    problemsOpen,
    setProblemsOpen,
    autoCompile,
    setAutoCompile,
    notifyChange,
    compileNow,
  }
}
