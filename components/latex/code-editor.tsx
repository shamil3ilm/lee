'use client'
// CodeMirror 6 editor for LaTeX. Loaded with next/dynamic (ssr: false) from
// the LaTeX workspace, so CodeMirror is bundled into its own chunk that only
// the editor route downloads. No CDN, no workers.
//
// One EditorView serves every open file: each file keeps its own
// EditorState (text, undo history, selection), swapped in when its tab is
// activated.
import { useEffect, useRef, type MutableRefObject } from 'react'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { redo, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import type { TextEdit } from '@/lib/latex/editor-commands'
import {
  applyCompileDiagnostics,
  createExtensions,
  fontSizeCompartment,
  fontSizeTheme,
  type CompileDiagnostic,
  type CompletionData,
  type EditorCallbacks,
} from './cm-setup'

export interface CodeEditorHandle {
  /** Insert text at the cursor (or at `pos`), replacing the selection. */
  insertText: (text: string, pos?: number | null) => void
  /** Move the cursor to the start of a 1-based line and scroll it into view. */
  jumpTo: (line: number) => void
  focus: () => void
  undo: () => void
  redo: () => void
  openSearch: () => void
  /** Apply a toolbar edit computed from the current text and selection. */
  edit: (make: (doc: string, from: number, to: number) => TextEdit) => void
  /** Replace the whole active file (e.g. an imported main.tex), undoable. */
  replaceAll: (text: string) => void
  /** 1-based line of the cursor. */
  cursorLine: () => number
}

export interface CodeEditorProps {
  /** The open file; switching it swaps in that file's own state. */
  fileId: string
  /** Text used the first time a file is opened. */
  initialValue: string
  fontSize: number
  handleRef: MutableRefObject<CodeEditorHandle | null>
  onChange: (fileId: string, value: string) => void
  onCompile: () => void
  onDropFiles: (files: FileList, pos: number | null) => void
  onDragActive: (active: boolean) => void
  onPathPaste: (text: string) => boolean
  completionData: CompletionData
  compileDiagnostics: readonly CompileDiagnostic[]
  onReady?: () => void
}

export default function CodeEditor(props: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const states = useRef(new Map<string, EditorState>())
  const activeFile = useRef(props.fileId)
  // Callbacks are read through a ref so the editor is created once.
  const callbacks = useRef<EditorCallbacks>({
    onChange: (doc) => props.onChange(activeFile.current, doc),
    onCompile: props.onCompile,
    onDropFiles: props.onDropFiles,
    onDragActive: props.onDragActive,
    onPathPaste: props.onPathPaste,
    getCompletionData: () => props.completionData,
  })
  useEffect(() => {
    callbacks.current = {
      onChange: (doc) => props.onChange(activeFile.current, doc),
      onCompile: props.onCompile,
      onDropFiles: props.onDropFiles,
      onDragActive: props.onDragActive,
      onPathPaste: props.onPathPaste,
      getCompletionData: () => props.completionData,
    }
  })

  const { handleRef, onReady, fileId, fontSize } = props
  const initial = useRef({ value: props.initialValue, fontSize: props.fontSize })
  const latestInitial = useRef(props.initialValue)
  useEffect(() => {
    latestInitial.current = props.initialValue
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: createExtensions(callbacks, initial.current.fontSize),
      }),
    })
    viewRef.current = view
    handleRef.current = {
      insertText(text, pos) {
        const range = pos == null ? view.state.selection.main : EditorSelection.cursor(pos)
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: text },
          selection: { anchor: range.from + text.length },
          scrollIntoView: true,
          userEvent: 'input',
        })
        view.focus()
      },
      jumpTo(line) {
        const n = Math.min(Math.max(1, line), view.state.doc.lines)
        const target = view.state.doc.line(n)
        view.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
        })
        view.focus()
      },
      focus: () => view.focus(),
      undo: () => {
        undo(view)
        view.focus()
      },
      redo: () => {
        redo(view)
        view.focus()
      },
      openSearch: () => {
        openSearchPanel(view)
      },
      edit(make) {
        const { from, to } = view.state.selection.main
        const e = make(view.state.doc.toString(), from, to)
        view.dispatch({
          changes: { from: e.from, to: e.to, insert: e.insert },
          selection: { anchor: e.anchor, head: e.head },
          scrollIntoView: true,
          userEvent: 'input',
        })
        view.focus()
      },
      replaceAll(text) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: 0 },
          userEvent: 'input.paste',
        })
        view.focus()
      },
      cursorLine: () => view.state.doc.lineAt(view.state.selection.main.head).number,
    }
    onReady?.()
    return () => {
      handleRef.current = null
      viewRef.current = null
      view.destroy()
    }
  }, [handleRef, onReady])

  // Swap file states when the active tab changes.
  useEffect(() => {
    const view = viewRef.current
    if (!view || activeFile.current === fileId) return
    states.current.set(activeFile.current, view.state)
    activeFile.current = fileId
    const saved = states.current.get(fileId)
    view.setState(
      saved ??
        EditorState.create({ doc: latestInitial.current, extensions: createExtensions(callbacks, fontSize) }),
    )
    if (saved) view.dispatch({ effects: fontSizeCompartment.reconfigure(fontSizeTheme(fontSize)) })
  }, [fileId, fontSize])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: fontSizeCompartment.reconfigure(fontSizeTheme(fontSize)) })
  }, [fontSize])

  useEffect(() => {
    const view = viewRef.current
    if (view) applyCompileDiagnostics(view, props.compileDiagnostics)
  }, [props.compileDiagnostics])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" data-testid="latex-code-editor" />
}
