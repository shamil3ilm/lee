'use client'
// The editor's own PDF viewer: pdf.js (the full build unpdf ships, loaded
// lazily with this component) renders each page to a crisp canvas with a
// selectable text layer, in a continuous scroll. A recompile paints the new
// pages over the old ones in place, so there is no blank flash and no
// layout shift. Never the browser's native viewer.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'unpdf/pdfjs'
import { PAGE_GUTTER, scaleFor, type Size, type ZoomMode } from '@/lib/latex/pdf-zoom'
import { cn } from '@/lib/utils'

type PdfJs = typeof import('unpdf/pdfjs')

let pdfjsPromise: Promise<PdfJs> | null = null
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('unpdf/pdfjs')
  return pdfjsPromise
}

export interface PdfViewerProps {
  bytes: Uint8Array
  zoom: ZoomMode
  dark: boolean
  /** Bumped to scroll to `page`. */
  goTo: { page: number; seq: number }
  onPages: (count: number) => void
  onPageChange: (page: number) => void
  onScale: (scale: number) => void
  onError: (message: string) => void
}

interface PageProps {
  pdfjs: PdfJs
  doc: PDFDocumentProxy
  pageNumber: number
  scale: number
  size: Size
  registerRef: (page: number, el: HTMLDivElement | null) => void
}

function PdfPage({ pdfjs, doc, pageNumber, scale, size, registerRef }: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null
    let textLayer: { cancel: () => void } | null = null
    void (async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      // Paint offscreen, then copy over the visible canvas in one go.
      const off = document.createElement('canvas')
      off.width = Math.floor(viewport.width * dpr)
      off.height = Math.floor(viewport.height * dpr)
      const ctx = off.getContext('2d')
      if (!ctx) return
      const render = page.render({
        canvas: off,
        canvasContext: ctx,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      })
      task = render
      try {
        await render.promise
      } catch {
        return // cancelled by a newer render
      }
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      canvas.width = off.width
      canvas.height = off.height
      canvas.getContext('2d')?.drawImage(off, 0, 0)
      const container = textRef.current
      if (!container) return
      container.replaceChildren()
      container.style.setProperty('--total-scale-factor', String(scale))
      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport,
      })
      textLayer = layer
      await layer.render().catch(() => undefined)
    })()
    return () => {
      cancelled = true
      task?.cancel()
      textLayer?.cancel()
    }
  }, [pdfjs, doc, pageNumber, scale])

  const width = size.width * scale
  const height = size.height * scale
  return (
    <div
      ref={(el) => registerRef(pageNumber, el)}
      data-page={pageNumber}
      aria-label={`Page ${pageNumber}`}
      role="img"
      className="relative mx-auto bg-white shadow-md ring-1 ring-black/10"
      style={{ width, height }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" aria-hidden="true" />
      <div ref={textRef} className="lee-pdf-text-layer" />
    </div>
  )
}

export default function PdfViewer({ bytes, zoom, dark, goTo, onPages, onPageChange, onScale, onError }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pageEls = useRef(new Map<number, HTMLDivElement>())
  const [pdfjs, setPdfjs] = useState<PdfJs | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  // The loading task owns the document; destroying it frees pdf.js memory.
  const taskRef = useRef<{ destroy: () => Promise<void> } | null>(null)
  const [pageSize, setPageSize] = useState<Size>({ width: 612, height: 792 })
  const [pane, setPane] = useState<Size>({ width: 0, height: 0 })
  const callbacks = useRef({ onPages, onPageChange, onScale, onError })
  useEffect(() => {
    callbacks.current = { onPages, onPageChange, onScale, onError }
  })

  // Load pdf.js, then each new PDF. The old document stays on screen
  // until the new one is ready.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const lib = await loadPdfJs()
        // pdf.js takes ownership of the buffer: hand it a copy.
        const task = lib.getDocument({ data: bytes.slice() })
        const proxy = await task.promise
        const first = await proxy.getPage(1)
        const vp = first.getViewport({ scale: 1 })
        if (cancelled) {
          void task.destroy()
          return
        }
        setPdfjs(() => lib)
        setPageSize({ width: vp.width, height: vp.height })
        // Destroy the old document only after the new pages replace it.
        const prev = taskRef.current
        taskRef.current = task
        setDoc(proxy)
        if (prev) setTimeout(() => void prev.destroy(), 2000)
        callbacks.current.onPages(proxy.numPages)
      } catch (err) {
        if (!cancelled) callbacks.current.onError(err instanceof Error ? err.message : 'Could not open the PDF.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bytes])

  useEffect(() => () => void taskRef.current?.destroy(), [])

  // Pane size drives the fit-width / fit-page scale.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setPane({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = useMemo(() => scaleFor(zoom, pane, pageSize), [zoom, pane, pageSize])
  useEffect(() => callbacks.current.onScale(scale), [scale])

  // Current page: the page covering most of the pane.
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !doc) return
    const ratios = new Map<number, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio)
        let best = 1
        let bestRatio = -1
        for (const [p, r] of ratios) if (r > bestRatio) [best, bestRatio] = [p, r]
        callbacks.current.onPageChange(best)
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    for (const el of pageEls.current.values()) io.observe(el)
    return () => io.disconnect()
  }, [doc, scale])

  useEffect(() => {
    if (goTo.seq === 0) return
    pageEls.current.get(goTo.page)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [goTo])

  const registerRef = useMemo(
    () => (page: number, el: HTMLDivElement | null) => {
      if (el) pageEls.current.set(page, el)
      else pageEls.current.delete(page)
    },
    [],
  )

  const pages = doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : []
  return (
    <div
      ref={scrollRef}
      className={cn('h-full overflow-auto bg-muted/60', dark && 'lee-pdf-dark')}
      style={{ padding: PAGE_GUTTER }}
      data-testid="pdf-viewer"
    >
      <div className="flex flex-col items-center" style={{ gap: PAGE_GUTTER }}>
        {pdfjs && doc
          ? pages.map((n) => (
              <PdfPage key={n} pdfjs={pdfjs} doc={doc} pageNumber={n} scale={scale} size={pageSize} registerRef={registerRef} />
            ))
          : null}
      </div>
    </div>
  )
}
