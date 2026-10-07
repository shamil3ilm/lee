import type { BadgeProps } from '@/components/ui/badge'
import type { ProblemStatus } from '@/lib/academy/coding/list'
import type { Difficulty, Role, Topic } from '@/lib/academy/problems/schema'
import type { Verdict } from '@/lib/academy/runner/verdict'

/** Human labels and tones for the coding workbench. Client-safe. */

type Tone = NonNullable<BadgeProps['variant']>

export const DIFFICULTY_TONE: Readonly<Record<Difficulty, Tone>> = { easy: 'success', medium: 'warning', hard: 'danger' }

export const STATUS_LABELS: Readonly<Record<ProblemStatus, string>> = { todo: 'To do', attempted: 'Attempted', solved: 'Solved' }
export const STATUS_TONE: Readonly<Record<ProblemStatus, Tone>> = { todo: 'neutral', attempted: 'warning', solved: 'success' }

export const TOPIC_LABELS: Readonly<Record<Topic, string>> = {
  arrays: 'Arrays',
  hashing: 'Hashing',
  'two-pointers': 'Two pointers',
  'sliding-window': 'Sliding window',
  stack: 'Stack',
  trees: 'Trees',
  graphs: 'Graphs',
  dp: 'Dynamic programming',
  intervals: 'Intervals',
  strings: 'Strings',
  sorting: 'Sorting',
  'binary-search': 'Binary search',
  heap: 'Heap',
  greedy: 'Greedy',
  math: 'Math',
  design: 'Design',
  parsing: 'Parsing',
  sql: 'SQL',
  reliability: 'Reliability',
  security: 'Security',
}

export const ROLE_LABELS: Readonly<Record<Role, string>> = { backend: 'Backend', payments: 'Payments', apis: 'APIs', data: 'Data' }

export const VERDICT_TONE: Readonly<Record<Verdict, Tone>> = {
  accepted: 'success',
  wrong_answer: 'danger',
  time_limit: 'warning',
  runtime_error: 'danger',
  compile_error: 'warning',
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1) return '<1 ms'
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}

export function formatKb(kb: number | null): string {
  if (kb === null) return '—'
  return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`
}
