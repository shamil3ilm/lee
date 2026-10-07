// Zoom and page arithmetic for the editor's PDF viewer (pure, testable).

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4

/** Fit modes recompute the scale from the pane size; a number is fixed. */
export type ZoomMode = 'fit-width' | 'fit-page' | number

/** Padding around each page in the viewer, in CSS px. */
export const PAGE_GUTTER = 16

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

export function zoomIn(scale: number): number {
  return ZOOM_STEPS.find((s) => s > scale + 0.001) ?? clampZoom(scale * 1.25)
}

export function zoomOut(scale: number): number {
  return [...ZOOM_STEPS].reverse().find((s) => s < scale - 0.001) ?? clampZoom(scale / 1.25)
}

export interface Size {
  width: number
  height: number
}

/** The scale (1 = 100%, 72 dpi PDF points to CSS px) for a mode in a pane. */
export function scaleFor(mode: ZoomMode, pane: Size, page: Size): number {
  if (typeof mode === 'number') return clampZoom(mode)
  if (page.width <= 0 || page.height <= 0 || pane.width <= 0) return 1
  const byWidth = (pane.width - PAGE_GUTTER * 2) / page.width
  if (mode === 'fit-width') return clampZoom(byWidth)
  const byHeight = (pane.height - PAGE_GUTTER * 2) / page.height
  return clampZoom(Math.min(byWidth, byHeight))
}

export function zoomLabel(scale: number): string {
  return `${Math.round(scale * 100)}%`
}

/** A typed page number, clamped to the document; NaN keeps the current page. */
export function clampPage(value: number, current: number, count: number): number {
  if (!Number.isFinite(value) || count < 1) return current
  return Math.min(count, Math.max(1, Math.round(value)))
}
