'use client'
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, CircleAlert, FileUp, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isMainFile, type LatexHint, type LogEntry, type ParsedLog } from '@/lib/latex/errors'

interface ProblemsPanelProps {
  title: string
  parsed: ParsedLog
  rawLog: string
  hint: LatexHint | null
  /** Server notes: which fallback / stand-in ran and why. */
  notes?: readonly string[]
  /** Line of the \usepackage the hint suggests removing, when found. */
  hintLine?: number | null
  /** Offered when the hint suggests the full-TeX-Live fallback. */
  onUseFallback?: () => void
  /** Offered when the source is a pasted file path. */
  onImport?: () => void
  onJump: (line: number) => void
  onClose: () => void
  className?: string
}

const RAW_LOG_LIMIT = 4000

function fileLabel(entry: LogEntry): string {
  const file = entry.file ? entry.file.split('/').pop() : 'main.tex'
  return entry.line ? `${file}:${entry.line}` : (file ?? '')
}

function ProblemIcon({ severity }: { severity: LogEntry['severity'] }) {
  if (severity === 'error') return <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-label="Error" />
  if (severity === 'warning') return <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-label="Warning" />
  return <Info className="size-3.5 shrink-0 text-muted-foreground" aria-label="Typesetting" />
}

export function problemSummary(parsed: ParsedLog): string {
  const parts = [
    [parsed.errors.length, 'error'],
    [parsed.warnings.length, 'warning'],
    [parsed.typesetting.length, 'box warning'],
  ] as const
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}${n === 1 ? '' : 's'}`)
    .join(', ')
}

interface HintBoxProps {
  hint: LatexHint
  hintLine: number | null
  onUseFallback?: () => void
  onImport?: () => void
  onJump: (line: number) => void
}

function HintBox({ hint, hintLine, onUseFallback, onImport, onJump }: HintBoxProps) {
  const actions = hint.actions ?? []
  const showFallback = onUseFallback !== undefined && actions.includes('use_fallback')
  const showLine = hintLine !== null && actions.includes('remove_package')
  const showImport = onImport !== undefined && actions.includes('import_file')
  return (
    <div className="m-2 rounded-md border border-warning/40 bg-warning-soft px-2.5 py-1.5 text-warning">
      <p className="font-medium">Suggestion: {hint.message}</p>
      {showFallback || showLine || showImport ? (
        <div className="mt-1 flex flex-wrap gap-3">
          {showImport ? (
            <button type="button" onClick={onImport} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
              <FileUp className="size-3.5" /> Import the file
            </button>
          ) : null}
          {showFallback ? (
            <button type="button" onClick={onUseFallback} className="font-semibold underline underline-offset-2">
              Compile with full TeX Live
            </button>
          ) : null}
          {showLine ? (
            <button type="button" onClick={() => onJump(hintLine)} className="font-semibold underline underline-offset-2">
              Go to the \usepackage line ({hintLine})
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ProblemRow({ entry, onJump }: { entry: LogEntry; onJump: (line: number) => void }) {
  const jumpable = entry.line !== null && isMainFile(entry.file)
  const body = (
    <>
      <ProblemIcon severity={entry.severity} />
      <span className="min-w-0 flex-1">
        <span className="block break-words font-medium text-foreground">{entry.message}</span>
        {entry.context ? (
          <span className="block truncate font-mono text-[11px] text-muted-foreground">{entry.context.split('\n')[0]}</span>
        ) : null}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{fileLabel(entry)}</span>
    </>
  )
  return jumpable ? (
    <button
      type="button"
      onClick={() => onJump(entry.line!)}
      className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      title={`Go to line ${entry.line}`}
    >
      {body}
    </button>
  ) : (
    <div className="flex items-start gap-2 px-3 py-1.5">{body}</div>
  )
}

/** Compile problems parsed from the log; click a problem to jump to its line. */
export function ProblemsPanel({
  title,
  parsed,
  rawLog,
  hint,
  notes = [],
  hintLine = null,
  onUseFallback,
  onImport,
  onJump,
  onClose,
  className,
}: ProblemsPanelProps) {
  const [showRaw, setShowRaw] = useState(parsed.all.length === 0 && hint === null)
  return (
    <section aria-label="Compile problems" className={cn('flex min-h-0 flex-col bg-background text-xs', className)}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-3">
        <p className="flex min-w-0 items-center gap-1.5 font-semibold">
          <CircleAlert className="size-3.5 shrink-0 text-destructive" />
          <span className="truncate">{title}</span>
          {parsed.all.length > 0 ? <span className="font-normal text-muted-foreground">· {problemSummary(parsed)}</span> : null}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close logs"
          title="Back to the PDF"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {notes.map((note) => (
          <p key={note} className="mx-2 mt-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-muted-foreground">
            {note}
          </p>
        ))}
        {hint ? <HintBox hint={hint} hintLine={hintLine} onUseFallback={onUseFallback} onImport={onImport} onJump={onJump} /> : null}
        {parsed.all.length > 0 ? (
          <ul className="divide-y">
            {parsed.all.map((entry, i) => (
              <li key={`${i}-${entry.message}`}>
                <ProblemRow entry={entry} onJump={onJump} />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="border-t">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {showRaw ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Raw log
          </button>
          {showRaw ? (
            <pre className="whitespace-pre-wrap break-words bg-muted/30 p-3 font-mono text-[11px]">
              {rawLog.slice(0, RAW_LOG_LIMIT) || 'No log output.'}
              {rawLog.length > RAW_LOG_LIMIT ? '\n…(truncated)' : ''}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  )
}
