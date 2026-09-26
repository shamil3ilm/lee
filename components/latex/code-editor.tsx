'use client'
// CodeMirror 6 editor for LaTeX. Loaded with next/dynamic (ssr: false) from
// components/latex-editor.tsx, so CodeMirror is bundled into its own chunk
// that only the editor route downloads. No CDN, no workers.
import { useEffect, useRef, type MutableRefObject } from 'react'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  applyCompileDiagnostics,
  createExtensions,
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
}

export interface CodeEditorProps {
  initialValue: string
  handleRef: MutableRefObject<CodeEditorHandle | null>
  onChange: (value: string) => void
  onCompile: () => void
  onDropFiles: (files: FileList, pos: number | null) => void
  onDragActive: (active: boolean) => void
  completionData: CompletionData
  compileDiagnostics: readonly CompileDiagnostic[]
  onReady?: () => void
}

export default function CodeEditor(props: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Callbacks are read through a ref so the editor is created once.
  const callbacks = useRef<EditorCallbacks>({
    onChange: props.onChange,
    onCompile: props.onCompile,
    onDropFiles: props.onDropFiles,
    onDragActive: props.onDragActive,
    getCompletionData: () => props.completionData,
  })
  useEffect(() => {
    callbacks.current = {
      onChange: props.onChange,
      onCompile: props.onCompile,
      onDropFiles: props.onDropFiles,
      onDragActive: props.onDragActive,
      getCompletionData: () => props.completionData,
    }
  })

  const { handleRef, onReady } = props
  const initialValue = useRef(props.initialValue)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      parent: host,
      state: EditorState.create({ doc: initialValue.current, extensions: createExtensions(callbacks) }),
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
      focus() {
        view.focus()
      },
    }
    onReady?.()
    return () => {
      handleRef.current = null
      viewRef.current = null
      view.destroy()
    }
  }, [handleRef, onReady])

  useEffect(() => {
    const view = viewRef.current
    if (view) applyCompileDiagnostics(view, props.compileDiagnostics)
  }, [props.compileDiagnostics])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" data-testid="latex-code-editor" />
}
