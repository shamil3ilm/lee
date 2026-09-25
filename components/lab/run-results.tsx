'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { ResultCard } from '@/components/lab/result-card'
import type { ResultView, RunView } from '@/lib/lab/views'

interface RunResultsProps {
  run: RunView
  /** Streamed text per result id (arena live view). */
  streaming?: Record<string, string>
  onRunChange?: (run: RunView) => void
}

export function isPending(r: ResultView): boolean {
  return r.output === null && r.error === null && r.metrics === null
}

/**
 * Results grid for one Arena run: one card per model; in blind mode each
 * card has a vote button and identities are revealed once a vote lands.
 * Stacks to one column on phones.
 */
export function RunResults({ run: initialRun, streaming, onRunChange }: RunResultsProps) {
  const [voted, setVoted] = useState<RunView | null>(null)
  const [voting, setVoting] = useState(false)
  // A newer run from the parent (e.g. a fresh stream) supersedes a stale vote result.
  const run = voted && voted.id === initialRun.id ? voted : initialRun
  const blindUnrevealed = run.blind && !run.revealed
  const anyPending = run.results.some(isPending)

  async function vote(resultId: string): Promise<void> {
    setVoting(true)
    try {
      const res = await fetch(`/api/lab/arena/${run.id}/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resultId }),
      })
      const json = (await res.json().catch(() => ({}))) as { run?: RunView; error?: string }
      if (!res.ok || !json.run) {
        toast.error(json.error ?? 'Could not record the vote.')
        return
      }
      setVoted(json.run)
      onRunChange?.(json.run)
      toast.success('Vote saved — models revealed.')
    } catch {
      toast.error('Network error — vote not saved.')
    } finally {
      setVoting(false)
    }
  }

  return (
    <div className="space-y-3">
      {blindUnrevealed && !anyPending ? (
        <p className="text-sm text-muted-foreground">
          Blind mode: pick the best answer to reveal which model wrote each one.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {run.results.map((r) => (
          <ResultCard
            key={r.id}
            result={r}
            streamingText={streaming?.[r.id]}
            pending={isPending(r)}
            blindUnrevealed={blindUnrevealed}
            hasSchema={Boolean(run.config.jsonSchema)}
            onVote={run.blind ? (id) => void vote(id) : undefined}
            voting={voting}
          />
        ))}
      </div>
    </div>
  )
}
