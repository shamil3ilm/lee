'use client'
// CodeMirror 6 editor for the coding workbench. Loaded with next/dynamic
// (ssr: false), so CodeMirror and the language modes stay out of every
// page's initial JavaScript; legacy stream modes keep it small.
import { useEffect, useRef } from 'react'
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { javascript, typescript } from '@codemirror/legacy-modes/mode/javascript'
import { python } from '@codemirror/legacy-modes/mode/python'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { clike } from '@codemirror/legacy-modes/mode/clike'
import { tags } from '@lezer/highlight'
import type { CodeLanguage } from '@/lib/academy/problems/schema'
import { editorHighlight, editorTheme } from './cm-theme'

const PHP_KEYWORDS =
  'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function global goto if implements include instanceof insteadof interface isset list match namespace new or print private protected public readonly require return static switch throw trait try unset use var while xor yield'

function words(s: string): Record<string, boolean> {
  return Object.fromEntries(s.split(' ').map((w) => [w, true]))
}

/** PHP via the C-like stream mode: keywords, $variables, # and // comments. */
const php = clike({
  name: 'php',
  keywords: words(PHP_KEYWORDS),
  types: words('int float string bool array object mixed void null iterable never self'),
  atoms: words('true false null TRUE FALSE NULL'),
  multiLineStrings: true,
  hooks: {
    $: (stream: { eatWhile: (re: RegExp) => boolean }) => {
      stream.eatWhile(/[\w$]/)
      return 'variableName.special'
    },
    '#': (stream: { skipToEnd: () => void }) => {
      stream.skipToEnd()
      return 'comment'
    },
    '<': (stream: { match: (s: string) => boolean }) => (stream.match('?php') ? 'meta' : false),
  },
})

const MODES: Readonly<Record<CodeLanguage, Parameters<typeof StreamLanguage.define>[0]>> = {
  javascript,
  typescript,
  python,
  php,
  sql: standardSQL,
}

const codeHighlight = HighlightStyle.define([
  { tag: tags.string, color: 'hsl(var(--success))' },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: 'hsl(var(--info))' },
  { tag: tags.typeName, color: 'hsl(var(--stage-screen))' },
  { tag: tags.propertyName, color: 'hsl(var(--foreground))' },
  { tag: tags.operator, color: 'hsl(var(--muted-foreground))' },
  { tag: tags.meta, color: 'hsl(var(--muted-foreground))' },
])

export interface CodeEditorProps {
  value: string
  language: CodeLanguage
  onChange: (value: string) => void
  onRun: () => void
  onSubmit: () => void
  label: string
}

function languageExtension(language: CodeLanguage): Extension {
  return [StreamLanguage.define(MODES[language]), indentUnit.of(language === 'python' || language === 'php' ? '    ' : '  ')]
}

export default function CodeEditor({ value, language, onChange, onRun, onSubmit, label }: CodeEditorProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const view = useRef<EditorView | null>(null)
  const lang = useRef(new Compartment())
  const callbacks = useRef({ onChange, onRun, onSubmit })
  useEffect(() => {
    callbacks.current = { onChange, onRun, onSubmit }
  })

  useEffect(() => {
    if (!host.current) return
    const run = (fn: () => void) => () => {
      fn()
      return true
    }
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(
            keymap.of([
              { key: 'Mod-Shift-Enter', run: run(() => callbacks.current.onSubmit()) },
              { key: 'Mod-Enter', run: run(() => callbacks.current.onRun()) },
            ]),
          ),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          indentOnInput(),
          lang.current.of(languageExtension(language)),
          syntaxHighlighting(codeHighlight),
          syntaxHighlighting(editorHighlight),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
          editorTheme,
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // Created once; value and language changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: lang.current.reconfigure(languageExtension(language)) })
  }, [language])

  useEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === value) return
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />
}
