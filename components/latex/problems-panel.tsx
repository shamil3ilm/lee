'use client'
import { useState } from 'react'
import { AlertTriangle, CircleAlert, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isMainFile, type LatexHint, type LogEntry, type ParsedLog } from '@/lib/latex/errors'

interface ProblemsPanelProps {
  title: string
  parsed: ParsedLog
  rawLog: string
  hint: LatexHint | null
  onJump: (line: number) => void
  onClose: () => void
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

function summary(parsed: ParsedLog): string {
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

/** Compile problems parsed from the log; click a problem to jump to its line. */
export function ProblemsPanel({ title, parsed, rawLog, hint, onJump, onClose }: ProblemsPanelProps) {
  const [showRaw, setShowRaw] = useState(parsed.all.length === 0)
  return (
    <section
      aria-label="Compile problems"
      className="flex max-h-[40%] min-h-0 flex-col border-t border-destructive/30 bg-background text-xs"
    >
      <header className="flex items-center justify-between gap-2 border-b bg-destructive/5 px-3 py-1.5">
        <p className="flex min-w-0 items-center gap-1.5 font-semibold text-destructive">
          <CircleAlert className="size-3.5 shrink-0" />
          <span className="truncate">{title}</span>
          {parsed.all.length > 0 ? (
            <span className="font-normal text-muted-foreground">· {summary(parsed)}</span>
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            aria-pressed={showRaw}
          >
            {showRaw ? 'Hide raw log' : 'Raw log'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close problems"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </header>
      <div className="min-h-0 overflow-y-auto">
        {hint ? (
          <p className="m-2 rounded border border-warning/40 bg-warning-soft px-2 py-1 font-medium text-warning">
            Suggestion: {hint.message}
          </p>
        ) : null}
        {parsed.all.length > 0 ? (
          <ul className="divide-y">
            {parsed.all.map((entry, i) => {
              const jumpable = entry.line !== null && isMainFile(entry.file)
              const body = (
                <>
                  <ProblemIcon severity={entry.severity} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium text-foreground">{entry.message}</span>
                    {entry.context ? (
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {entry.context.split('\n')[0]}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{fileLabel(entry)}</span>
                </>
              )
              return (
                <li key={`${i}-${entry.message}`}>
                  {jumpable ? (
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
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}
        {showRaw ? (
          <pre className={cn('whitespace-pre-wrap break-words border-t bg-muted/30 p-3 font-mono text-[11px]')}>
            {rawLog.slice(0, RAW_LOG_LIMIT) || 'No log output.'}
            {rawLog.length > RAW_LOG_LIMIT ? '\n…(truncated)' : ''}
          </pre>
        ) : null}
      </div>
    </section>
  )
}
