'use client'
import { useRef, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { clamp, EDITOR_FRACTION, SIDE_WIDTH, type EditorPrefs, type WorkspaceSize } from '@/lib/latex/editor-prefs'
import { ResizeHandle } from './resize-handle'

interface WorkspaceLayoutProps {
  size: WorkspaceSize
  prefs: EditorPrefs
  onPrefs: (patch: Partial<EditorPrefs>) => void
  /** Pane shown on narrow screens (Editor / PDF tabs). */
  narrowPane: 'editor' | 'pdf'
  rail: ReactNode
  panel: ReactNode | null
  onClosePanel: () => void
  editor: ReactNode
  pdf: ReactNode
}

const FRACTION_STEP = 0.05
const SIDE_STEP = 20

function EdgeButton({ side, label, onClick }: { side: 'left' | 'right'; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex w-5 shrink-0 items-center justify-center border-x bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {side === 'left' ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
    </button>
  )
}

/**
 * Rail + side panel + editor/PDF split, by workspace width:
 *   wide    the side panel sits inline (resizable);
 *   medium  the side panel overlays the editor from the rail;
 *   narrow  one pane at a time (Editor / PDF tabs in the top bar).
 * The split handle resizes (drag or arrow keys) and its arrows collapse
 * either pane; sizes are remembered per viewer.
 */
export function WorkspaceLayout(p: WorkspaceLayoutProps) {
  const splitRef = useRef<HTMLDivElement | null>(null)
  const sideRef = useRef<HTMLDivElement | null>(null)
  const { prefs } = p
  const narrow = p.size === 'narrow'
  const layout = narrow ? p.narrowPane : prefs.layout
  const showEditor = layout !== 'pdf'
  const showPdf = layout !== 'editor'
  const pdfFirst = prefs.order === 'pdf-first'
  const inlinePanel = p.size === 'wide' && p.panel !== null

  // The two panes in display order; the first one carries the split size.
  const first = pdfFirst ? { node: p.pdf, show: showPdf } : { node: p.editor, show: showEditor }
  const last = pdfFirst ? { node: p.editor, show: showEditor } : { node: p.pdf, show: showPdf }
  const both = first.show && last.show
  const firstShare = pdfFirst ? 1 - prefs.editorFraction : prefs.editorFraction

  return (
    <div className="relative flex min-h-0 flex-1">
      {p.rail}
      {inlinePanel ? (
        <>
          <div ref={sideRef} className="flex min-h-0 shrink-0 flex-col border-r bg-background" style={{ width: prefs.sideWidth }}>
            {p.panel}
          </div>
          <ResizeHandle
            label="Resize the side panel"
            valueNow={((prefs.sideWidth - SIDE_WIDTH.min) / (SIDE_WIDTH.max - SIDE_WIDTH.min)) * 100}
            onDrag={(x) => {
              const left = sideRef.current?.getBoundingClientRect().left ?? 0
              p.onPrefs({ sideWidth: clamp(x - left, SIDE_WIDTH.min, SIDE_WIDTH.max) })
            }}
            onStep={(d) => p.onPrefs({ sideWidth: clamp(prefs.sideWidth + d * SIDE_STEP, SIDE_WIDTH.min, SIDE_WIDTH.max) })}
          />
        </>
      ) : null}
      {!inlinePanel && p.panel !== null ? (
        <>
          {/* Click outside (or Escape) closes the overlaid panel. */}
          <div className="absolute inset-0 left-10 z-20 bg-black/10" aria-hidden="true" onClick={p.onClosePanel} />
          <div
            className="absolute inset-y-0 left-10 z-30 flex w-72 max-w-[calc(100%-2.5rem)] flex-col border-r bg-background shadow-xl"
            onKeyDown={(e) => {
              if (e.key === 'Escape') p.onClosePanel()
            }}
          >
            {p.panel}
          </div>
        </>
      ) : null}
      <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1">
        {!narrow && !first.show ? <EdgeButton side="left" label={pdfFirst ? 'Show the PDF' : 'Show the editor'} onClick={() => p.onPrefs({ layout: 'split' })} /> : null}
        {first.show ? (
          <div className="flex min-w-0 flex-col" style={both ? { flex: `0 0 ${firstShare * 100}%` } : { flex: '1 1 0%' }}>
            {first.node}
          </div>
        ) : null}
        {both ? (
          <ResizeHandle
            label="Resize the editor and PDF"
            valueNow={prefs.editorFraction * 100}
            onDrag={(x) => {
              const rect = splitRef.current?.getBoundingClientRect()
              if (!rect || rect.width === 0) return
              const f = (x - rect.left) / rect.width
              p.onPrefs({ editorFraction: clamp(pdfFirst ? 1 - f : f, EDITOR_FRACTION.min, EDITOR_FRACTION.max) })
            }}
            onStep={(d) =>
              p.onPrefs({
                editorFraction: clamp(prefs.editorFraction + (pdfFirst ? -d : d) * FRACTION_STEP, EDITOR_FRACTION.min, EDITOR_FRACTION.max),
              })
            }
            className="w-2"
          >
            <button
              type="button"
              onClick={() => p.onPrefs({ layout: pdfFirst ? 'editor' : 'pdf' })}
              aria-label={pdfFirst ? 'Hide the PDF' : 'Hide the editor'}
              title={pdfFirst ? 'Hide the PDF' : 'Hide the editor'}
              className="flex h-6 w-3 items-center justify-center rounded-sm bg-background text-muted-foreground shadow ring-1 ring-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => p.onPrefs({ layout: pdfFirst ? 'pdf' : 'editor' })}
              aria-label={pdfFirst ? 'Hide the editor' : 'Hide the PDF'}
              title={pdfFirst ? 'Hide the editor' : 'Hide the PDF'}
              className="flex h-6 w-3 items-center justify-center rounded-sm bg-background text-muted-foreground shadow ring-1 ring-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="size-3" />
            </button>
          </ResizeHandle>
        ) : null}
        {last.show ? <div className="flex min-w-0 flex-1 flex-col">{last.node}</div> : null}
        {!narrow && !last.show ? <EdgeButton side="right" label={pdfFirst ? 'Show the editor' : 'Show the PDF'} onClick={() => p.onPrefs({ layout: 'split' })} /> : null}
      </div>
    </div>
  )
}
