#!/usr/bin/env tsx
/**
 * compare-decision-providers.ts
 *
 * Dev-only CLI that runs a fixed set of hand-crafted expense samples
 * through every DecisionProvider implementation (heuristic, Groq, Laya
 * HTTP) and prints a side-by-side table plus a summary of pairwise
 * agreement rates and per-provider median latency.
 *
 * Usage:
 *   pnpm laya:compare
 *
 * Env inputs (same as the app — nothing new to configure):
 *   GROQ_API_KEY       Required to exercise the Groq column. If unset the
 *                      column shows SKIP.
 *   LAYA_ENDPOINT      Optional override for the Laya endpoint. Defaults
 *                      to the public demo at
 *                      https://convaiinnovations-laya-demo.hf.space.
 *   LAYA_API_KEY       Optional bearer token for a private Space.
 *
 * Nothing here writes to the DB or mutates app state. Every provider
 * error is caught locally and rendered as "ERROR: <msg>" in the offending
 * cell — the script always finishes and prints the summary.
 */

import { performance } from 'node:perf_hooks'
import { config as loadEnv } from 'dotenv'

// Load .env.local first, then .env — same order Next.js uses. Do this BEFORE
// importing lib/decisions/* so any transitive lib/env reads pick up the vars.
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

// Import providers directly by path, avoiding lib/decisions/index → lib/env
// which requires the full app env (DATABASE_URL etc) that a CLI doesn't need.
import { GroqDecisionProvider } from '@/lib/decisions/groq'
import { HeuristicDecisionProvider } from '@/lib/decisions/heuristic'
import { LayaHttpDecisionProvider } from '@/lib/decisions/laya-http'
import type { DecisionProvider } from '@/lib/decisions/types'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/expenses/categories'

interface Sample {
  description: string
  vendor: string
}

const SAMPLES: readonly Sample[] = [
  { description: 'Netflix monthly subscription', vendor: 'Netflix' },
  { description: 'Salary payment', vendor: 'ADCB' },
  { description: 'Grocery shopping', vendor: 'Carrefour' },
  { description: 'DEWA bill October', vendor: 'DEWA' },
  { description: 'Uber ride to office', vendor: 'Uber' },
  { description: 'Coffee', vendor: 'Starbucks' },
  { description: 'Domain renewal', vendor: 'Namecheap' },
  { description: 'Gym membership', vendor: 'Fitness First' },
  { description: 'Amazon Prime video', vendor: 'Amazon' },
  { description: 'Etisalat internet bill', vendor: 'Etisalat' },
]

interface CellOk {
  ok: true
  pick: ExpenseCategory
  confidence: number
  latencyMs: number
}

interface CellErr {
  ok: false
  error: string
  latencyMs: number
}

interface CellSkip {
  ok: false
  skip: true
  reason: string
}

type Cell = CellOk | CellErr | CellSkip

type ProviderKey = 'heuristic' | 'groq' | 'laya'

async function runOne(
  provider: DecisionProvider,
  sample: Sample,
): Promise<Cell> {
  const text = `${sample.description} — ${sample.vendor}`
  const start = performance.now()
  try {
    const res = await provider.choice<ExpenseCategory>({
      text,
      options: EXPENSE_CATEGORIES,
    })
    return {
      ok: true,
      pick: res.pick,
      confidence: res.confidence,
      latencyMs: performance.now() - start,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      latencyMs: performance.now() - start,
    }
  }
}

function fmtCell(cell: Cell): string {
  if (cell.ok) {
    return `${cell.pick} (${cell.confidence.toFixed(2)}) ${cell.latencyMs.toFixed(0)}ms`
  }
  if ('skip' in cell) return `SKIP (${cell.reason})`
  return `ERROR: ${cell.error.slice(0, 40)}`
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

async function main() {
  const heuristic: DecisionProvider = new HeuristicDecisionProvider()

  const groqKey = process.env.GROQ_API_KEY
  const groq: DecisionProvider | null = groqKey
    ? new GroqDecisionProvider(groqKey)
    : null

  const layaEndpoint = process.env.LAYA_ENDPOINT
  const layaKey = process.env.LAYA_API_KEY
  const laya: DecisionProvider = new LayaHttpDecisionProvider(layaEndpoint, layaKey)

  const providers: Record<ProviderKey, DecisionProvider | null> = {
    heuristic,
    groq,
    laya,
  }

  console.log('# Decision provider comparison')
  console.log(`# samples: ${SAMPLES.length}`)
  console.log(`# heuristic: local`)
  console.log(`# groq:      ${groq ? 'GROQ_API_KEY set' : 'SKIP (no GROQ_API_KEY)'}`)
  console.log(`# laya:      ${layaEndpoint ?? 'https://convaiinnovations-laya-demo.hf.space'} (public default)`)
  console.log('')

  // Header row.
  const cols = ['description', 'vendor', 'heuristic', 'groq', 'laya', 'agree']
  const widths = [30, 18, 30, 30, 30, 12]
  console.log(cols.map((c, i) => pad(c, widths[i]!)).join('| '))
  console.log(cols.map((_, i) => '-'.repeat(widths[i]!)).join('|-'))

  const rows: Array<Record<ProviderKey, Cell>> = []

  for (const sample of SAMPLES) {
    const results: Record<ProviderKey, Cell> = {
      heuristic: await runOne(heuristic, sample),
      groq: groq
        ? await runOne(groq, sample)
        : { ok: false, skip: true, reason: 'no GROQ_API_KEY' },
      laya: await runOne(laya, sample),
    }
    rows.push(results)

    const picks = (Object.values(results) as Cell[])
      .filter((c): c is CellOk => 'ok' in c && c.ok)
      .map((c) => c.pick)
    const distinct = new Set(picks).size
    const agree =
      picks.length < 2 ? 'n/a' : distinct === 1 ? 'ALL' : `${picks.length - distinct + 1}/${picks.length}`

    const row = [
      pad(sample.description, widths[0]!),
      pad(sample.vendor, widths[1]!),
      pad(fmtCell(results.heuristic), widths[2]!),
      pad(fmtCell(results.groq), widths[3]!),
      pad(fmtCell(results.laya), widths[4]!),
      pad(agree, widths[5]!),
    ]
    console.log(row.join('| '))
  }

  console.log('')
  console.log('# Pairwise agreement (fraction of samples where both succeeded and agreed)')
  const pairKeys: Array<[ProviderKey, ProviderKey]> = [
    ['heuristic', 'groq'],
    ['heuristic', 'laya'],
    ['groq', 'laya'],
  ]
  for (const [a, b] of pairKeys) {
    if (!providers[a] || !providers[b]) {
      console.log(`  ${a} vs ${b}: skipped (provider unavailable)`)
      continue
    }
    let agreed = 0
    let compared = 0
    for (const row of rows) {
      const ca = row[a]
      const cb = row[b]
      if ('ok' in ca && ca.ok && 'ok' in cb && cb.ok) {
        compared++
        if (ca.pick === cb.pick) agreed++
      }
    }
    const pct = compared === 0 ? 'n/a' : `${((agreed / compared) * 100).toFixed(0)}%`
    console.log(`  ${a} vs ${b}: ${agreed}/${compared} (${pct})`)
  }

  console.log('')
  console.log('# Median latency (successful calls only)')
  for (const key of ['heuristic', 'groq', 'laya'] as const) {
    const lat = rows
      .map((r) => r[key])
      .filter((c): c is CellOk => 'ok' in c && c.ok)
      .map((c) => c.latencyMs)
    if (lat.length === 0) {
      console.log(`  ${key}: no successful calls`)
    } else {
      console.log(`  ${key}: ${median(lat).toFixed(0)}ms (n=${lat.length})`)
    }
  }
}

main().catch((e) => {
  console.error('fatal:', e)
  process.exitCode = 1
})
