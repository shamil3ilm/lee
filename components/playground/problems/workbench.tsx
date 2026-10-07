'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { toast } from 'sonner'
import { Play, RotateCcw, Send } from 'lucide-react'
import { beginSubmitAction, finishSubmitAction, unlockSolutionAction } from '@/app/(authed)/playground/problems/actions'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { argsToText, parseCustomArgs } from '@/lib/academy/coding/custom-input'
import { clearDraft, loadDraft, loadLanguage, openedAt, resetOpenedAt, saveDraft, saveLanguage } from '@/lib/academy/coding/drafts'
import type { CodingMode, CodingSubmitResult } from '@/lib/academy/coding/submit'
import type { SubmissionView, WorkbenchView } from '@/lib/academy/coding/workbench'
import type { SolutionView } from '@/lib/academy/problems/public'
import { LANGUAGE_LABELS, type CodeLanguage } from '@/lib/academy/problems/constants'
import { cn } from '@/lib/utils'
import { ConsolePanel, type ConsoleTab } from './console-panel'
import { MockTimer } from './mock-timer'
import type { RunView } from './result-view'
import { StatementPanel } from './statement-panel'

const CodeEditor = dynamic(() => import('@/components/code/code-editor'), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-[240px] w-full" />,
})

export interface WorkbenchContext {
  mode: CodingMode
  planItemId: string | null
  mockId: string | null
  mockEndsAt: string | null
}

type Pane = 'problem' | 'code' | 'result'
const PANES: ReadonlyArray<{ id: Pane; label: string }> = [
  { id: 'problem', label: 'Problem' },
  { id: 'code', label: 'Code' },
  { id: 'result', label: 'Result' },
]

const SAVE_DELAY_MS = 400

function initialCustom(view: WorkbenchView): string {
  const p = view.problem
  if (p.kind === 'sql') return p.samples[0]?.seed ?? ''
  return argsToText(p.samples[0]?.args ?? [])
}

const noSubscribe = () => () => undefined

export function Workbench({ view, context }: { view: WorkbenchView; context: WorkbenchContext }) {
  const problem = view.problem
  // Stored preferences are read as external stores: the server (and hydration) renders the
  // defaults, then the browser's saved language and draft apply without a mismatch.
  const preferred = useSyncExternalStore(noSubscribe, loadLanguage, () => null)
  const [chosen, setLanguage] = useState<CodeLanguage | null>(null)
  const fallback = problem.languages[0] ?? 'javascript'
  const language: CodeLanguage = chosen ?? (preferred && problem.languages.includes(preferred) ? preferred : fallback)
  const draft = useSyncExternalStore(
    noSubscribe,
    () => loadDraft(problem.slug, language),
    () => null,
  )
  const [edits, setEdits] = useState<Partial<Record<CodeLanguage, string>>>({})
  const code = edits[language] ?? draft ?? problem.starters[language] ?? ''
  const setCode = useCallback((lang: CodeLanguage, next: string) => setEdits((e) => ({ ...e, [lang]: next })), [])
  const [leftTab, setLeftTab] = useState('description')
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('testcase')
  const [pane, setPane] = useState<Pane>('problem')
  const [custom, setCustom] = useState(() => initialCustom(view))
  const [useCustom, setUseCustom] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<RunView | null>(null)
  const [submit, setSubmit] = useState<{ result: CodingSubmitResult; stdout: string } | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionView[]>(view.submissions)
  const [solution, setSolution] = useState<SolutionView | null>(view.solution)
  const [solved, setSolved] = useState(view.status === 'solved')
  const busy = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const opened = useRef<number | null>(null)

  useEffect(() => {
    opened.current = openedAt(problem.slug)
  }, [problem.slug])

  const onCode = useCallback(
    (next: string) => {
      setCode(language, next)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => saveDraft(problem.slug, language, next), SAVE_DELAY_MS)
    },
    [problem.slug, language, setCode],
  )

  const switchLanguage = (next: CodeLanguage) => {
    saveDraft(problem.slug, language, code)
    saveLanguage(next)
    setLanguage(next)
  }

  const resetCode = () => {
    clearDraft(problem.slug, language)
    setCode(language, problem.starters[language] ?? '')
  }

  const showResult = () => {
    setConsoleTab('result')
    setPane('result')
  }

  const doRun = useCallback(async () => {
    if (busy.current) return
    let customInput: unknown[] | string | null = null
    if (useCustom) {
      if (problem.kind === 'sql') customInput = custom
      else {
        const parsed = parseCustomArgs(custom, problem.fn)
        if (!parsed.ok) {
          toast.error(parsed.error)
          setConsoleTab('testcase')
          return
        }
        customInput = parsed.args
      }
    }
    busy.current = true
    setError(null)
    setSubmit(null)
    setStatus('Running samples…')
    showResult()
    try {
      const session = await import('@/lib/academy/runner/session')
      const out = await session.runSamples({ problem, language, code, custom: customInput, onStatus: setStatus })
      setRun(out)
    } catch {
      setError('The runner could not start. Reload the page and try again.')
    } finally {
      setStatus(null)
      busy.current = false
    }
  }, [problem, language, code, custom, useCustom])

  const doSubmit = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setError(null)
    setRun(null)
    setStatus('Preparing the hidden tests…')
    showResult()
    try {
      const begun = await beginSubmitAction({
        slug: problem.slug,
        language,
        mode: context.mode,
        planItemId: context.planItemId,
        openedAt: opened.current,
      })
      if ('error' in begun) {
        setError(begun.error)
        return
      }
      setStatus('Running every test…')
      const session = await import('@/lib/academy/runner/session')
      const ran = await session.runSubmission(problem, language, code, begun.pack, setStatus)
      if (!ran.report) {
        setError(ran.fatal ?? 'The runner stopped unexpectedly.')
        return
      }
      setStatus('Scoring…')
      const done = await finishSubmitAction(begun.attemptId, ran.report, context.mockId)
      if ('error' in done) {
        setError(done.error)
        return
      }
      setSubmit({ result: done.result, stdout: ran.stdout })
      setSubmissions(done.submissions)
      if (done.result.judgement.verdict === 'accepted') {
        setSolved(true)
        resetOpenedAt(problem.slug)
        if (!solution) {
          const s = await unlockSolutionAction(problem.slug)
          if (!('error' in s)) setSolution(s.solution)
        }
      }
    } catch {
      setError('Something went wrong while submitting. Your code is saved; try again.')
    } finally {
      setStatus(null)
      busy.current = false
    }
  }, [problem, language, code, context, solution])

  // Ctrl/Cmd+Enter runs, Ctrl/Cmd+Shift+Enter submits (the editor handles its own focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (e.shiftKey) void doSubmit()
      else void doRun()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doRun, doSubmit])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    void import('@/lib/academy/runner/client').then((c) => c.terminateAll()).catch(() => undefined)
  }, [])

  const running = status !== null
  const paneClass = (id: Pane) => cn('min-h-0 min-w-0 flex-col', pane === id ? 'flex' : 'hidden', '@4xl/main:flex')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {context.mockEndsAt && context.mockId ? <MockTimer endsAt={context.mockEndsAt} mockId={context.mockId} /> : null}
        <div className="flex rounded-lg border p-0.5 @4xl/main:hidden" role="tablist" aria-label="Workbench panes">
          {PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pane === p.id}
              onClick={() => setPane(p.id)}
              className={cn('rounded-md px-3 py-1 text-sm', pane === p.id ? 'bg-secondary font-medium' : 'text-muted-foreground')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 @4xl/main:h-[calc(100dvh-13rem)] @4xl/main:min-h-[600px] @4xl/main:grid-cols-2">
        <section aria-label="Problem" className={cn(paneClass('problem'), 'rounded-xl border bg-card p-3')}>
          <StatementPanel
            problem={problem}
            skillName={view.skillName}
            hints={view.hints}
            submissions={submissions}
            solution={solution}
            solved={solved}
            tab={leftTab}
            onTab={setLeftTab}
            onSolution={setSolution}
            onLoadSubmission={(s) => {
              const lang = problem.languages.includes(s.language as CodeLanguage) ? (s.language as CodeLanguage) : language
              saveLanguage(lang)
              setLanguage(lang)
              setCode(lang, s.code)
              saveDraft(problem.slug, lang, s.code)
              setPane('code')
            }}
          />
        </section>
        <div className={cn('min-h-0 min-w-0 flex-col gap-3', pane === 'problem' ? 'hidden' : 'flex', '@4xl/main:flex')}>
          <section aria-label="Code" className={cn(paneClass('code'), 'min-h-[60vh] flex-1 rounded-xl border bg-card @4xl/main:min-h-0')}>
            <div className="flex flex-wrap items-center gap-2 border-b p-2">
              <NativeSelect
                aria-label="Language"
                value={language}
                onChange={(e) => switchLanguage(e.target.value as CodeLanguage)}
                className="h-8 w-36"
                disabled={problem.languages.length === 1}
              >
                {problem.languages.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </option>
                ))}
              </NativeSelect>
              <Button type="button" size="sm" variant="ghost" onClick={resetCode} aria-label="Reset to starter code">
                <RotateCcw aria-hidden />
                <span className="hidden sm:inline">Reset</span>
              </Button>
              <div className="ml-auto flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void doRun()} disabled={running} title="Ctrl+Enter">
                  <Play aria-hidden />
                  Run
                </Button>
                <Button type="button" size="sm" onClick={() => void doSubmit()} disabled={running} title="Ctrl+Shift+Enter">
                  <Send aria-hidden />
                  Submit
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <CodeEditor
                value={code}
                language={language}
                onChange={onCode}
                onRun={() => void doRun()}
                onSubmit={() => void doSubmit()}
                label={`${LANGUAGE_LABELS[language]} solution`}
              />
            </div>
          </section>
          <section
            aria-label="Console"
            className={cn(paneClass('result'), 'rounded-xl border bg-card p-3 @4xl/main:h-[40%] @4xl/main:flex-none')}
          >
            <ConsolePanel
              problem={problem}
              tab={consoleTab}
              onTab={setConsoleTab}
              custom={custom}
              useCustom={useCustom}
              onCustom={setCustom}
              onUseCustom={setUseCustom}
              status={status}
              run={run}
              submit={submit}
              error={error}
            />
          </section>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Code runs only in your browser, in a sandboxed worker with no network.{' '}
        <Link href="/playground/problems" className="text-primary underline-offset-4 hover:underline">
          All problems
        </Link>
      </p>
    </div>
  )
}
