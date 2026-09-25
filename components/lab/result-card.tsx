'use client'
import { Check, Copy, Loader2, Trophy, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { fmtMs, fmtNum } from '@/lib/lab/format'
import type { ResultView } from '@/lib/lab/views'
import { cn } from '@/lib/utils'

interface ResultCardProps {
  result: ResultView
  /** Live streamed text while the model is still answering. */
  streamingText?: string
  pending: boolean
  blindUnrevealed: boolean
  hasSchema: boolean
  onVote?: (resultId: string) => void
  voting?: boolean
}

const ERROR_LABELS: Record<string, string> = {
  rate_limited: 'Rate limited',
  missing_key: 'No API key',
  auth: 'Key rejected',
  timeout: 'Timed out',
  error: 'Error',
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px] tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  )
}

export function ResultCard({
  result,
  streamingText,
  pending,
  blindUnrevealed,
  hasSchema,
  onVote,
  voting,
}: ResultCardProps) {
  const m = result.metrics
  const errorKind = m?.errorKind
  const text = result.output ?? streamingText ?? ''
  const pretty =
    result.outputJson !== null && result.outputJson !== undefined
      ? JSON.stringify(result.outputJson, null, 2)
      : null
  const title = blindUnrevealed
    ? `Model ${result.label ?? '?'}`
    : `${result.model ?? 'unknown'}`

  return (
    <Card
      className={cn(
        'flex min-w-0 flex-col',
        result.vote === 1 && 'border-emerald-500 ring-1 ring-emerald-500/40',
      )}
    >
      <CardHeader className="space-y-1.5 p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={title}>
              {title}
            </p>
            {!blindUnrevealed && result.provider ? (
              <p className="text-xs text-muted-foreground">
                {result.label ? `Model ${result.label} · ` : ''}
                {result.provider}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {result.vote === 1 ? (
              <Badge variant="emerald" className="gap-1">
                <Trophy className="size-3" /> Winner
              </Badge>
            ) : null}
            {text ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Copy output"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(pretty ?? text)
                    .then(() => toast.success('Copied'))
                    .catch(() => toast.error('Could not copy'))
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {m?.ttftMs !== undefined ? <Chip label="TTFT" value={fmtMs(m.ttftMs)} /> : null}
          {m && !pending ? <Chip label="Total" value={fmtMs(m.totalMs)} /> : null}
          {m?.tokensPerSec !== undefined ? <Chip label="tok/s" value={fmtNum(m.tokensPerSec)} /> : null}
          {m?.inputTokens !== undefined || m?.outputTokens !== undefined ? (
            <Chip label="tokens" value={`${fmtNum(m?.inputTokens)} → ${fmtNum(m?.outputTokens)}`} />
          ) : null}
          {hasSchema && result.schemaValid !== null ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                result.schemaValid
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
              )}
              title={m?.schemaErrors?.join('\n')}
            >
              {result.schemaValid ? <Check className="size-3" /> : <X className="size-3" />}
              schema
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-0">
        {result.error ? (
          <div
            role="alert"
            className={cn(
              'rounded-md border p-3 text-xs',
              errorKind === 'rate_limited'
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
                : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
            )}
          >
            <p className="font-semibold">{ERROR_LABELS[errorKind ?? 'error'] ?? 'Error'}</p>
            <p className="mt-1">{result.error}</p>
          </div>
        ) : pending && !text ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Waiting for first token…
          </div>
        ) : (
          <pre className="max-h-96 min-h-16 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {pretty ?? text}
          </pre>
        )}
        {m?.schemaErrors?.length ? (
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-rose-600">
            {m.schemaErrors.slice(0, 5).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {onVote && blindUnrevealed && !pending && !result.error ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-auto"
            disabled={voting}
            onClick={() => onVote(result.id)}
          >
            {voting ? <Loader2 className="animate-spin" /> : <Trophy />}
            {`Pick ${result.label ?? 'this'} as best`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
