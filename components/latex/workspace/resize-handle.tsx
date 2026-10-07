'use client'
import { useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ResizeHandleProps {
  label: string
  /** Current value for assistive tech (0–100). */
  valueNow: number
  /** Called with the pointer's x, in px from the left of the viewport. */
  onDrag: (clientX: number) => void
  /** Arrow keys: -1 / +1 steps. */
  onStep: (direction: -1 | 1) => void
  onDragEnd?: () => void
  /** Small controls on the handle (collapse / swap arrows). */
  children?: ReactNode
  className?: string
}

/**
 * A vertical split handle: drag with mouse, touch or pen, or focus it and
 * use the arrow keys. Pointer capture keeps the drag smooth over iframes
 * and the code editor.
 */
export function ResizeHandle({ label, valueNow, onDrag, onStep, onDragEnd, children, className }: ResizeHandleProps) {
  const dragging = useRef(false)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(valueNow)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (dragging.current) onDrag(e.clientX)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        onDragEnd?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onStep(-1)
        else if (e.key === 'ArrowRight') onStep(1)
        else return
        e.preventDefault()
      }}
      className={cn(
        'group relative z-10 flex w-1.5 shrink-0 cursor-col-resize touch-none flex-col items-center justify-center gap-1 bg-border/60 transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none',
        className,
      )}
    >
      {children}
    </div>
  )
}
