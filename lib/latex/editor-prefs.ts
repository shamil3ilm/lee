// Per-viewer editor preferences (layout, pane sizes, font size, compile
// mode). Stored in localStorage by the editor; this module only parses and
// clamps, so a corrupt or hand-edited value can never break the layout.

export const EDITOR_PREFS_KEY = 'lee.latex.editorPrefs'

export type EditorLayout = 'split' | 'editor' | 'pdf'
export type SidePanel = 'files' | 'search' | null
export type PaneOrder = 'editor-first' | 'pdf-first'

export interface EditorPrefs {
  layout: EditorLayout
  order: PaneOrder
  sidePanel: SidePanel
  /** Side panel width in px. */
  sideWidth: number
  /** Editor's share of the editor+PDF split, 0..1. */
  editorFraction: number
  /** Code font size in px. */
  fontSize: number
  /** Fast compile: graphicx `draft`, images drawn as boxes. */
  fastMode: boolean
  /** Invert the PDF colours for dark rooms. */
  darkPdf: boolean
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  layout: 'split',
  order: 'editor-first',
  sidePanel: 'files',
  sideWidth: 240,
  editorFraction: 0.5,
  fontSize: 13,
  fastMode: false,
  darkPdf: false,
}

export const SIDE_WIDTH = { min: 180, max: 420 } as const
export const EDITOR_FRACTION = { min: 0.2, max: 0.8 } as const
export const FONT_SIZES = [11, 12, 13, 14, 16, 18] as const

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Parse a stored value; anything missing or invalid takes the default. */
export function parseEditorPrefs(raw: string | null): EditorPrefs {
  let v: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>
  } catch {
    v = {}
  }
  const d = DEFAULT_EDITOR_PREFS
  const side = v.sidePanel === null ? null : pick(v.sidePanel, ['files', 'search'] as const, 'files')
  const font = num(v.fontSize, d.fontSize)
  return {
    layout: pick(v.layout, ['split', 'editor', 'pdf'] as const, d.layout),
    order: pick(v.order, ['editor-first', 'pdf-first'] as const, d.order),
    sidePanel: v.sidePanel === undefined ? d.sidePanel : side,
    sideWidth: clamp(num(v.sideWidth, d.sideWidth), SIDE_WIDTH.min, SIDE_WIDTH.max),
    editorFraction: clamp(num(v.editorFraction, d.editorFraction), EDITOR_FRACTION.min, EDITOR_FRACTION.max),
    fontSize: (FONT_SIZES as readonly number[]).includes(font) ? font : d.fontSize,
    fastMode: v.fastMode === true,
    darkPdf: v.darkPdf === true,
  }
}

/** The next font size up or down the scale. */
export function stepFontSize(current: number, direction: 1 | -1): number {
  const i = FONT_SIZES.indexOf(current as (typeof FONT_SIZES)[number])
  const next = (i === -1 ? FONT_SIZES.indexOf(13) : i) + direction
  return FONT_SIZES[clamp(next, 0, FONT_SIZES.length - 1)]!
}

/** Width class of the workspace (container width, not the viewport). */
export type WorkspaceSize = 'wide' | 'medium' | 'narrow'

export function workspaceSize(width: number): WorkspaceSize {
  if (width >= 1100) return 'wide'
  if (width >= 720) return 'medium'
  return 'narrow'
}

/** "Compiled 2:41 PM · 1.8 s" (US time, as everywhere in lee). */
export function compiledLabel(at: Date, durationMs: number): string {
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `Compiled ${time} · ${(durationMs / 1000).toFixed(1)} s`
}
