// CodeMirror 6 setup for the LaTeX editor (v17 §8.5 decisions 1–7). Only
// imported by components/latex/code-editor.tsx, which is lazy-loaded on the
// editor route, so none of this reaches any other route's bundle.
import { EditorState, Prec, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  snippet,
  snippetCompletion,
  type Completion,
  type CompletionContext as CMCompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { forceLinting, linter, lintGutter, lintKeymap, type Diagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { tags } from '@lezer/highlight'
import {
  buildCompletionIndex,
  completionContextAt,
  innermostOpenEnvironment,
  type CompletionIndex,
} from '@/lib/latex/completion-index'
import { lintLatex } from '@/lib/latex/lint'
import { sectionFoldRange } from '@/lib/latex/outline'
import {
  COMMANDS,
  ENVIRONMENTS,
  environmentTailTemplate,
  environmentTemplate,
  type EnvironmentSpec,
} from '@/lib/latex/vocabulary'

export interface CompletionData {
  bibSources: readonly string[]
  assetFilenames: readonly string[]
}

export interface EditorCallbacks {
  onChange: (doc: string) => void
  onCompile: () => void
  onDropFiles: (files: FileList, pos: number | null) => void
  onDragActive: (active: boolean) => void
  getCompletionData: () => CompletionData
}

export interface CompileDiagnostic {
  line: number
  severity: 'error' | 'warning' | 'info'
  message: string
}

// --- compile-log diagnostics ---------------------------------------------

const setCompileDiagnostics = StateEffect.define<Diagnostic[]>()

const compileDiagnosticsField = StateField.define<Diagnostic[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setCompileDiagnostics)) return e.value
    if (!tr.docChanged || value.length === 0) return value
    return value.map((d) => ({ ...d, from: tr.changes.mapPos(d.from), to: tr.changes.mapPos(d.to) }))
  },
})

function toDiagnostics(state: EditorState, problems: readonly CompileDiagnostic[]): Diagnostic[] {
  return problems
    .filter((p) => p.line >= 1 && p.line <= state.doc.lines)
    .map((p) => {
      const line = state.doc.line(p.line)
      const indent = line.text.length - line.text.trimStart().length
      return {
        from: line.from + indent,
        to: line.to,
        severity: p.severity,
        message: p.message,
        source: 'Compile',
      }
    })
}

export function applyCompileDiagnostics(view: EditorView, problems: readonly CompileDiagnostic[]): void {
  view.dispatch({ effects: setCompileDiagnostics.of(toDiagnostics(view.state, problems)) })
  forceLinting(view)
}

const latexLinter = linter(
  (view) => {
    const codeCheck: Diagnostic[] = lintLatex(view.state.doc.toString()).map((i) => ({
      from: i.from,
      to: Math.max(i.to, i.from + 1),
      severity: i.severity,
      message: i.message,
      source: 'Code Check',
    }))
    return [...view.state.field(compileDiagnosticsField), ...codeCheck]
  },
  { delay: 600 },
)

// --- autocomplete ----------------------------------------------------------

const COMMAND_OPTIONS: readonly Completion[] = [
  ...COMMANDS.map((c) =>
    c.template
      ? snippetCompletion(c.template, { label: `\\${c.name}`, detail: c.detail, type: 'function' })
      : { label: `\\${c.name}`, detail: c.detail, type: 'keyword' },
  ),
  ...ENVIRONMENTS.map((env) =>
    snippetCompletion(environmentTemplate(env), {
      label: `\\begin{${env.name}}`,
      detail: 'environment',
      type: 'class',
    }),
  ),
]

function userCommandOptions(index: CompletionIndex): Completion[] {
  return index.commands.map((c) => {
    const args = Array.from({ length: c.args }, () => '{${}}').join('')
    const label = `\\${c.name}`
    return c.args > 0
      ? snippetCompletion(`${label}${args}`, { label, detail: 'defined here', type: 'function', boost: 1 })
      : { label, detail: 'defined here', type: 'variable', boost: 1 }
  })
}

/** Environment name after `\begin{`: insert the rest, eating an auto-closed `}`. */
function environmentOption(env: EnvironmentSpec, detail: string): Completion {
  const apply = snippet(environmentTailTemplate(env))
  return {
    label: env.name,
    detail,
    type: 'class',
    apply: (view, completion, from, to) => {
      const end = view.state.sliceDoc(to, to + 1) === '}' ? to + 1 : to
      apply(view, completion, from, end)
    },
  }
}

function plainOptions(values: readonly string[], type: string, detail?: string): Completion[] {
  return values.map((label) => ({ label, type, detail }))
}

function makeCompletionSource(callbacks: { current: EditorCallbacks }) {
  return (ctx: CMCompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos)
    const found = completionContextAt(line.text, ctx.pos - line.from)
    if (!found) return null
    const data = callbacks.current.getCompletionData()
    const index = buildCompletionIndex({
      source: ctx.state.doc.toString(),
      bibSources: data.bibSources,
      assetFilenames: data.assetFilenames,
    })
    const from = line.from + found.from
    const userEnvs: EnvironmentSpec[] = index.environments.map((name) => ({ name }))
    switch (found.kind) {
      case 'command':
        return {
          from,
          options: [...userCommandOptions(index), ...COMMAND_OPTIONS],
          validFor: /^\\[A-Za-z@*]*$/,
        }
      case 'environment':
        return {
          from,
          options: [
            ...ENVIRONMENTS.map((e) => environmentOption(e, 'environment')),
            ...userEnvs.map((e) => environmentOption(e, 'defined here')),
          ],
          validFor: /^[A-Za-z*]*$/,
        }
      case 'end-environment': {
        const open = innermostOpenEnvironment(ctx.state.sliceDoc(0, ctx.pos))
        const names = [...new Set([...(open ? [open] : []), ...ENVIRONMENTS.map((e) => e.name), ...index.environments])]
        return {
          from,
          options: names.map((name) => ({ label: name, type: 'class', boost: name === open ? 2 : 0 })),
          validFor: /^[A-Za-z*]*$/,
        }
      }
      case 'ref':
        return { from, options: plainOptions(index.labels, 'constant', 'label'), validFor: /^[^{},\s]*$/ }
      case 'cite':
        return { from, options: plainOptions(index.citeKeys, 'constant', 'bib'), validFor: /^[^{},\s]*$/ }
      case 'graphics':
        return { from, options: plainOptions(index.graphicsFiles, 'text', 'asset'), validFor: /^[^{}\s]*$/ }
      case 'input':
        return { from, options: plainOptions(index.inputFiles, 'text', 'asset'), validFor: /^[^{}\s]*$/ }
    }
  }
}

// --- folding ------------------------------------------------------------------

const HEADING_LINE = /\\(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)\b/

const sectionFolding = foldService.of((state, lineStart, lineEnd) => {
  if (!HEADING_LINE.test(state.sliceDoc(lineStart, lineEnd))) return null
  return sectionFoldRange(state.doc.toString(), lineStart)
})

// --- look ---------------------------------------------------------------------

const highlight = HighlightStyle.define([
  { tag: tags.tagName, color: 'hsl(var(--info))' },
  { tag: tags.keyword, color: 'hsl(var(--stage-interview))' },
  { tag: tags.atom, color: 'hsl(var(--success))' },
  { tag: tags.number, color: 'hsl(var(--warning))' },
  { tag: tags.special(tags.variableName), color: 'hsl(var(--warning))' },
  { tag: tags.bracket, color: 'hsl(var(--muted-foreground))' },
  { tag: tags.comment, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
  { tag: tags.invalid, color: 'hsl(var(--destructive))' },
])

const theme = EditorView.theme({
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

// --- assembly -----------------------------------------------------------------

export function createExtensions(callbacks: { current: EditorCallbacks }): Extension[] {
  const run = (fn: () => void) => () => {
    fn()
    return true
  }
  return [
    Prec.highest(
      keymap.of([
        { key: 'Mod-Enter', run: run(() => callbacks.current.onCompile()) },
        { key: 'Mod-s', run: run(() => callbacks.current.onCompile()), preventDefault: true },
      ]),
    ),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    codeFolding(),
    foldGutter(),
    sectionFolding,
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    StreamLanguage.define(stex),
    EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['{', '['] } }]),
    syntaxHighlighting(highlight),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ override: [makeCompletionSource(callbacks)], icons: false }),
    highlightActiveLine(),
    highlightSelectionMatches(),
    compileDiagnosticsField,
    latexLinter,
    lintGutter(),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'LaTeX source' }),
    theme,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
    }),
    EditorView.domEventHandlers({
      dragenter(event) {
        if (!event.dataTransfer?.types.includes('Files')) return false
        event.preventDefault()
        callbacks.current.onDragActive(true)
        return true
      },
      dragover(event) {
        if (!event.dataTransfer?.types.includes('Files')) return false
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        return true
      },
      dragleave(event, view) {
        const related = event.relatedTarget as Node | null
        if (!related || !view.dom.contains(related)) callbacks.current.onDragActive(false)
        return false
      },
      drop(event, view) {
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        // Files are uploaded as assets, never read into the source as text.
        event.preventDefault()
        callbacks.current.onDragActive(false)
        callbacks.current.onDropFiles(files, view.posAtCoords({ x: event.clientX, y: event.clientY }))
        return true
      },
    }),
  ]
}
