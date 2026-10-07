'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { variantDocumentAction } from '@/app/(authed)/settings/profile/variants/actions'
import { fetchVariantPdf, PDF_MESSAGES } from '@/lib/variants/pdf-client'

/**
 * "Make PDF": write the variant's LaTeX document (server action, database
 * only), then compile it through the document's PDF route with a client
 * deadline. Every phase is visible: preparing → compiling (elapsed seconds,
 * Cancel) → ready (download / editor links) or failed (message, Try again).
 */
export type VariantPdfState =
  | { phase: 'idle' }
  | { phase: 'preparing' }
  | { phase: 'compiling'; documentId: string; startedAt: number }
  | { phase: 'ready'; documentId: string; bytes: number }
  | { phase: 'failed'; documentId: string | null; message: string; canRetry: boolean }

export interface VariantPdf {
  state: VariantPdfState
  /** Whole seconds since the compile started (0 outside 'compiling'). */
  elapsed: number
  busy: boolean
  make: () => Promise<void>
  cancel: () => void
}

export function useVariantPdf(variantId: string): VariantPdf {
  const [state, setState] = useState<VariantPdfState>({ phase: 'idle' })
  const [now, setNow] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const compiling = state.phase === 'compiling'
  useEffect(() => {
    if (!compiling) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [compiling])
  const elapsed = state.phase === 'compiling' ? Math.max(0, Math.floor((now - state.startedAt) / 1000)) : 0

  const make = useCallback(async (): Promise<void> => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ phase: 'preparing' })
    let documentId: string | null = null
    try {
      const r = await variantDocumentAction(variantId)
      if ('error' in r) {
        setState({ phase: 'failed', documentId: null, message: r.error, canRetry: true })
        return
      }
      documentId = r.documentId
    } catch {
      setState({ phase: 'failed', documentId: null, message: PDF_MESSAGES.other, canRetry: true })
      return
    }
    if (controllerRef.current !== controller) return
    if (controller.signal.aborted) {
      controllerRef.current = null
      setState({ phase: 'failed', documentId, message: PDF_MESSAGES.cancelled, canRetry: true })
      return
    }
    setState({ phase: 'compiling', documentId, startedAt: Date.now() })
    const result = await fetchVariantPdf(documentId, { signal: controller.signal })
    if (controllerRef.current !== controller) return // superseded by a newer Make PDF
    controllerRef.current = null
    setState(
      result.ok
        ? { phase: 'ready', documentId, bytes: result.bytes }
        : { phase: 'failed', documentId, message: result.message, canRetry: result.reason !== 'compile' },
    )
  }, [variantId])

  const cancel = useCallback((): void => {
    controllerRef.current?.abort()
  }, [])

  return { state, elapsed, busy: state.phase === 'preparing' || state.phase === 'compiling', make, cancel }
}
