#!/usr/bin/env tsx
/**
 * v10.1 — eval runner. Reads every JSON fixture under
 * `tests/eval/fixtures/<task>/*.json`, dispatches to the matching AI provider
 * method, and compares the output against the on-disk snapshot for that
 * fixture.
 *
 * Modes:
 *   default   — fail on any diff between fresh output and snapshot.
 *   --update  — overwrite snapshots with the current output. Use after
 *               intentional prompt or model-version changes.
 *   --live    — run against the real Gemini/Groq/Laya provider (requires an
 *               API key in the env). Never fails on diff; the goal is
 *               observability, not gate. Otherwise the deterministic
 *               FixtureAIProvider is used, which is safe for CI.
 *
 * First-run ergonomics: if no snapshot exists for any fixture the runner
 * prints a friendly "no snapshots yet" message and exits 0 so CI stays
 * green on a fresh checkout. Snapshot creation is a deliberate act via
 * `pnpm eval --update`.
 *
 * Provider imports are done by direct path (not through lib/ai/index.ts →
 * lib/env) so the runner doesn't need the full app env — same pattern as
 * scripts/compare-decision-providers.ts.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { FixtureAIProvider } from '@/lib/ai/fixtures'
import type { AIProvider } from '@/lib/ai/types'
import type { DecisionProvider } from '@/lib/decisions/types'
import { HeuristicDecisionProvider } from '@/lib/decisions/heuristic'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/expenses/categories'
import {
  makeApplication,
  makeMasterCV,
  makeStage,
} from './factories'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/eval/fixtures')
const SNAPSHOTS_DIR = path.resolve(process.cwd(), 'tests/eval/snapshots')

type Task =
  | 'parse-job'
  | 'tailor-cv'
  | 'cover-letter'
  | 'outreach'
  | 'prep-pack'
  | 'debrief'
  | 'expense-classify'

const TASKS: readonly Task[] = [
  'parse-job',
  'tailor-cv',
  'cover-letter',
  'outreach',
  'prep-pack',
  'debrief',
  'expense-classify',
]

interface Fixture {
  file: string
  name: string
  notes?: string
  inputs: unknown
}

interface Result {
  fixture: string
  ok: boolean
  latencyMs: number
  message?: string
}

interface Summary {
  task: Task
  fixtures: number
  passed: number
  failed: number
  avgLatencyMs: number
}

// ---------------------------------------------------------------------------
// Fixture loading + input rehydration
// ---------------------------------------------------------------------------

async function loadFixtures(task: Task): Promise<Fixture[]> {
  const dir = path.join(FIXTURES_DIR, task)
  if (!existsSync(dir)) return []
  const entries = await readdir(dir)
  const jsonFiles = entries.filter((f) => f.endsWith('.json'))
  const fixtures: Fixture[] = []
  for (const file of jsonFiles.sort()) {
    const raw = await readFile(path.join(dir, file), 'utf8')
    const parsed = JSON.parse(raw)
    fixtures.push({
      file,
      name: parsed.name ?? file,
      notes: parsed.notes,
      inputs: parsed.inputs,
    })
  }
  return fixtures
}

/**
 * Rehydrate `@factory:x` sentinel strings into real objects, and expand any
 * `{ "@factory": "x", "overrides": { ... } }` blocks. Keeps fixture JSON
 * short and human-readable while letting each task exercise the same base
 * inputs deterministically.
 */
function rehydrate(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value === '@factory:masterCV') return makeMasterCV()
    if (value === '@factory:application') return makeApplication()
    if (value === '@factory:stage') return makeStage()
    return value
  }
  if (Array.isArray(value)) return value.map(rehydrate)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj['@factory'] === 'string') {
      const kind = obj['@factory'] as string
      const overrides = (obj.overrides ?? {}) as Record<string, unknown>
      if (kind === 'masterCV') return makeMasterCV(overrides as never)
      if (kind === 'application') return makeApplication(overrides as never)
      if (kind === 'stage') return makeStage(overrides as never)
      throw new Error(`Unknown @factory kind: ${kind}`)
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = rehydrate(v)
    return out
  }
  return value
}

// ---------------------------------------------------------------------------
// Task dispatch
// ---------------------------------------------------------------------------

async function runFixture(
  task: Task,
  fixture: Fixture,
  ai: AIProvider,
  decision: DecisionProvider,
): Promise<unknown> {
  const inputs = rehydrate(fixture.inputs) as Record<string, unknown>
  switch (task) {
    case 'parse-job':
      return ai.parseJob(inputs.text as string)
    case 'tailor-cv':
      return ai.tailorCV({
        master: inputs.master as never,
        application: inputs.application as never,
      })
    case 'cover-letter':
      return ai.draftCoverLetter({
        master: inputs.master as never,
        application: inputs.application as never,
      })
    case 'outreach':
      return ai.draftOutreach({
        master: inputs.master as never,
        application: inputs.application as never,
        kind: inputs.kind as never,
        tone: inputs.tone as never,
        daysSince: inputs.daysSince as number | undefined,
      })
    case 'prep-pack':
      return ai.generateInterviewPrepPack({
        master: inputs.master as never,
        application: inputs.application as never,
        stageKind: inputs.stageKind as string,
      })
    case 'debrief':
      return ai.generateInterviewDebrief({
        master: inputs.master as never,
        application: inputs.application as never,
        stage: inputs.stage as never,
        quickNotes: inputs.quickNotes as string,
      })
    case 'expense-classify': {
      const description = inputs.description as string | undefined
      const vendor = inputs.vendor as string | undefined
      const text = [vendor, description].filter(Boolean).join(' — ')
      return decision.choice<ExpenseCategory>({
        text,
        options: EXPENSE_CATEGORIES,
        context:
          'You are classifying a personal expense into a single category. ' +
          'The vendor is the merchant name; the description is a short note.',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Snapshot management
// ---------------------------------------------------------------------------

function snapshotPath(task: Task, fixtureFile: string): string {
  const name = fixtureFile.replace(/\.json$/, '.json')
  return path.join(SNAPSHOTS_DIR, task, name)
}

async function readSnapshot(task: Task, fixtureFile: string): Promise<unknown | null> {
  const p = snapshotPath(task, fixtureFile)
  try {
    const raw = await readFile(p, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function writeSnapshot(
  task: Task,
  fixtureFile: string,
  data: unknown,
  meta: { modelLabel: string },
): Promise<void> {
  const p = snapshotPath(task, fixtureFile)
  await mkdir(path.dirname(p), { recursive: true })
  const wrapped = {
    _meta: {
      generatedAt: new Date().toISOString(),
      model: meta.modelLabel,
    },
    output: data,
  }
  await writeFile(p, JSON.stringify(wrapped, null, 2) + '\n', 'utf8')
}

function normalizeForCompare(v: unknown): unknown {
  // Strip _meta from snapshot wrappers so only the output payload is diffed.
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>
    if ('output' in obj) return obj.output
  }
  return v
}

function diffJson(a: unknown, b: unknown): string | null {
  const sa = JSON.stringify(a, null, 2)
  const sb = JSON.stringify(b, null, 2)
  if (sa === sb) return null
  // Minimal unified-style diff for logging.
  const la = sa.split('\n')
  const lb = sb.split('\n')
  const out: string[] = []
  const len = Math.max(la.length, lb.length)
  for (let i = 0; i < len; i++) {
    if (la[i] !== lb[i]) {
      if (la[i] !== undefined) out.push(`- ${la[i]}`)
      if (lb[i] !== undefined) out.push(`+ ${lb[i]}`)
    }
  }
  return out.slice(0, 40).join('\n') + (out.length > 40 ? `\n... (${out.length - 40} more diff lines)` : '')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const update = args.has('--update')
  const live = args.has('--live')

  const modelLabel = live ? liveModelLabel() : 'fixture'

  // Pre-count snapshots so we can print the friendly first-run message.
  let existingSnapshots = 0
  for (const task of TASKS) {
    const dir = path.join(SNAPSHOTS_DIR, task)
    if (!existsSync(dir)) continue
    const entries = await readdir(dir)
    existingSnapshots += entries.filter((f) => f.endsWith('.json')).length
  }
  if (existingSnapshots === 0 && !update) {
    console.log('No eval snapshots found yet.')
    console.log('Run `pnpm eval --update` locally to seed the snapshots directory,')
    console.log('then commit the resulting JSON files. Subsequent runs will regress-check.')
    process.exit(0)
  }

  const ai: AIProvider = live ? await makeLiveAIProvider() : new FixtureAIProvider()
  const decision: DecisionProvider = live
    ? await makeLiveDecisionProvider()
    : new HeuristicDecisionProvider()

  console.log(`# Eval mode: ${live ? 'LIVE' : 'FIXTURE'}${update ? ' (writing snapshots)' : ''}`)
  console.log(`# Model:     ${modelLabel}`)
  console.log('')

  const summaries: Summary[] = []
  let totalFailed = 0

  for (const task of TASKS) {
    const fixtures = await loadFixtures(task)
    if (fixtures.length === 0) continue
    const results: Result[] = []
    for (const f of fixtures) {
      const start = performance.now()
      let output: unknown
      let error: string | undefined
      try {
        output = await runFixture(task, f, ai, decision)
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
      }
      const latencyMs = performance.now() - start
      if (error) {
        results.push({ fixture: f.file, ok: false, latencyMs, message: `threw: ${error}` })
        continue
      }
      if (update) {
        await writeSnapshot(task, f.file, output, { modelLabel })
        results.push({ fixture: f.file, ok: true, latencyMs, message: 'snapshot updated' })
        continue
      }
      const snapshot = await readSnapshot(task, f.file)
      if (snapshot == null) {
        // First time for this fixture: write and mark ok.
        await writeSnapshot(task, f.file, output, { modelLabel })
        results.push({ fixture: f.file, ok: true, latencyMs, message: 'seeded snapshot' })
        continue
      }
      const diff = diffJson(normalizeForCompare(snapshot), output)
      if (diff == null) {
        results.push({ fixture: f.file, ok: true, latencyMs })
      } else if (live) {
        // Live provider is non-deterministic — warn but never fail.
        results.push({ fixture: f.file, ok: true, latencyMs, message: `LIVE-DIFF (warn only):\n${diff}` })
      } else {
        results.push({ fixture: f.file, ok: false, latencyMs, message: `DIFF:\n${diff}` })
        totalFailed += 1
      }
    }
    const passed = results.filter((r) => r.ok).length
    const failed = results.length - passed
    const avgLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, results.length)
    summaries.push({ task, fixtures: results.length, passed, failed, avgLatencyMs })

    console.log(`## ${task} (${passed}/${results.length} passed)`)
    for (const r of results) {
      const status = r.ok ? 'OK ' : 'FAIL'
      const note = r.message ? ` — ${r.message.split('\n')[0]}` : ''
      console.log(`  [${status}] ${r.fixture} (${r.latencyMs.toFixed(0)}ms)${note}`)
      if (!r.ok && r.message) {
        // Print full diff for failures so the CI log has enough to act on.
        console.log(r.message.split('\n').slice(1).map((l) => '    ' + l).join('\n'))
      }
    }
    console.log('')
  }

  console.log('# Summary')
  console.log('task              | fixtures | passed | failed | avg_latency_ms')
  console.log('------------------|----------|--------|--------|----------------')
  for (const s of summaries) {
    console.log(
      `${padRight(s.task, 18)}| ${padLeft(String(s.fixtures), 8)} | ${padLeft(String(s.passed), 6)} | ${padLeft(String(s.failed), 6)} | ${padLeft(s.avgLatencyMs.toFixed(0), 14)}`,
    )
  }

  process.exit(totalFailed > 0 && !live ? 1 : 0)
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s
}

function padRight(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

// ---------------------------------------------------------------------------
// Live provider construction (lazy — only used with --live)
// ---------------------------------------------------------------------------

function liveModelLabel(): string {
  if (process.env.GEMINI_API_KEY) return `gemini:${process.env.GEMINI_MODEL ?? 'default'}`
  if (process.env.GROQ_API_KEY) return `groq:${process.env.GROQ_MODEL ?? 'default'}`
  return 'unknown-live'
}

async function makeLiveAIProvider(): Promise<AIProvider> {
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    const { GroqProvider } = await import('@/lib/ai/groq')
    return new GroqProvider(groqKey)
  }
  const geminiKey = process.env.GEMINI_API_KEY
  if (geminiKey) {
    const { GeminiProvider } = await import('@/lib/ai/gemini')
    return new GeminiProvider(geminiKey)
  }
  console.error('--live requires GROQ_API_KEY or GEMINI_API_KEY in the env.')
  process.exit(2)
}

async function makeLiveDecisionProvider(): Promise<DecisionProvider> {
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    const { GroqDecisionProvider } = await import('@/lib/decisions/groq')
    return new GroqDecisionProvider(groqKey)
  }
  // Fall back to heuristic for expense-classify when no key is present in
  // --live mode; better than aborting the whole run for one task.
  return new HeuristicDecisionProvider()
}

main().catch((e) => {
  console.error('eval runner fatal:', e)
  process.exit(2)
})
