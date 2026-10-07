// The CodeMirror look shared by the LaTeX editor and the coding workbench:
// token-based colours, so light and dark themes follow the app. Only
// imported by lazily loaded editor modules.
import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const editorHighlight = HighlightStyle.define([
  { tag: tags.tagName, color: 'hsl(var(--info))' },
  { tag: tags.keyword, color: 'hsl(var(--stage-interview))' },
  { tag: tags.atom, color: 'hsl(var(--success))' },
  { tag: tags.number, color: 'hsl(var(--warning))' },
  { tag: tags.special(tags.variableName), color: 'hsl(var(--warning))' },
  { tag: tags.bracket, color: 'hsl(var(--muted-foreground))' },
  { tag: tags.comment, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
  { tag: tags.invalid, color: 'hsl(var(--destructive))' },
])

export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.55',
  },
  '.cm-content': { caretColor: 'hsl(var(--foreground))' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'hsl(var(--ring) / 0.25) !important',
  },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--muted) / 0.6)',
    color: 'hsl(var(--muted-foreground))',
    borderRight: '1px solid hsl(var(--border))',
  },
  '.cm-activeLine': { backgroundColor: 'hsl(var(--muted) / 0.45)' },
  '.cm-activeLineGutter': { backgroundColor: 'hsl(var(--muted))' },
  '.cm-matchingBracket': { backgroundColor: 'hsl(var(--success) / 0.18)', outline: 'none' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'hsl(var(--muted))',
    border: '1px solid hsl(var(--border))',
    color: 'hsl(var(--muted-foreground))',
  },
  '.cm-tooltip': {
    backgroundColor: 'hsl(var(--popover))',
    color: 'hsl(var(--popover-foreground))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '6px',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'hsl(var(--accent))',
    color: 'hsl(var(--accent-foreground))',
  },
  '.cm-completionDetail': { color: 'hsl(var(--muted-foreground))', marginLeft: '0.75em' },
  '.cm-panels': { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' },
  '.cm-panel input, .cm-panel button': { fontSize: '12px' },
  '.cm-searchMatch': { backgroundColor: 'hsl(var(--warning) / 0.25)' },
  '.cm-diagnostic-error': { borderLeftColor: 'hsl(var(--destructive))' },
  '.cm-diagnostic-warning': { borderLeftColor: 'hsl(var(--warning))' },
})
