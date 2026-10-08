/**
 * One-off live check of the "What's new" fetchers (network; never run in
 * tests or CI). Fetches every shared source once into a throwaway PGlite
 * database, then prints the counts per category, the top items per
 * category (names and links only) and, for a relevance context given as
 * JSON, the top "relevant to me" items with their reasons.
 *
 * Usage (the schema is applied to the in-memory database first):
 *   DATABASE_URL=pglite:memory:// pnpm tsx scripts/radar-new-live.ts [context.json]
 *
 * context.json: { readySkills: string[], studySkills: string[], roleFamilies: string[], releaseProjects: string[] }
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { db, getPgliteClient } from '@/lib/db/client'
import { radarNewEntries } from '@/lib/db/schema'
import { rankEntry } from '@/lib/radar/new/rank'
import { buildRelevanceTopics, relevanceMatcher } from '@/lib/radar/new/relevance'
import { runWhatsNewSource } from '@/lib/radar/new/run'
import { NEW_CATEGORIES, NEW_CATEGORY_LABELS, NEW_SOURCES, type NewMetrics } from '@/lib/radar/new/types'

interface Context {
  readySkills: string[]
  studySkills: string[]
  roleFamilies: string[]
  releaseProjects: string[]
}

async function applySchema(): Promise<void> {
  const client = getPgliteClient()
  if (!client) throw new Error('no pglite client')
  const folder = path.resolve(process.cwd(), 'lib/db/migrations')
  for (const file of readdirSync(folder).filter((f) => f.endsWith('.sql')).sort()) {
    for (const stmt of readFileSync(path.join(folder, file), 'utf8').split(/-->\s*statement-breakpoint\s*/g)) {
      if (stmt.trim()) await client.exec(stmt)
    }
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.startsWith('pglite:')) throw new Error('use a throwaway pglite database')
  await applySchema()
  const ctx: Context = process.argv[2]
    ? (JSON.parse(readFileSync(process.argv[2], 'utf8')) as Context)
    : { readySkills: [], studySkills: [], roleFamilies: [], releaseProjects: [] }
  const now = new Date()
  for (const source of NEW_SOURCES) {
    const r = await runWhatsNewSource(source, { now, projects: ctx.releaseProjects, deadline: Date.now() + 200_000 })
    process.stdout.write(`${source}: ${JSON.stringify(r)}\n`)
  }
  const rows = await db.select().from(radarNewEntries)
  const match = relevanceMatcher(buildRelevanceTopics(ctx))
  const ranked = rows
    .map((row) => {
      const rel = match({ category: row.category, name: row.name, excerpt: row.excerpt, tags: row.tags })
      const r = rankEntry({ sources: row.sources, group: row.grp, metrics: row.metrics as NewMetrics, createdAt: row.createdAt, firstSeenAt: row.firstSeenAt }, rel, now)
      return { row, ...r }
    })
    .sort((a, b) => b.score - a.score)
  process.stdout.write(`\nentries: ${rows.length}\n`)
  for (const c of NEW_CATEGORIES) {
    const list = ranked.filter((r) => r.row.category === c)
    const open = list.filter((r) => r.row.openness === 'open').length
    const prop = list.filter((r) => r.row.openness === 'proprietary').length
    process.stdout.write(`\n## ${NEW_CATEGORY_LABELS[c]}: ${list.length} (open ${open}, proprietary ${prop})\n`)
    const groups = c === 'model' ? [list.filter((r) => r.row.openness === 'open'), list.filter((r) => r.row.openness !== 'open')] : [list]
    for (const g of groups) {
      if (c === 'model') process.stdout.write(`### ${g[0]?.row.openness === 'open' ? 'open' : 'proprietary'}\n`)
      for (const r of g.slice(0, 5)) process.stdout.write(`- [${r.row.name}](${r.row.url}) score ${r.score} · ${r.chips.map((x) => x.label).join(' · ')}\n`)
    }
  }
  process.stdout.write('\n## Relevant to me\n')
  for (const r of ranked.filter((x) => x.relevance > 0).slice(0, 10)) {
    process.stdout.write(`- [${r.row.name}](${r.row.url}) score ${r.score} · ${r.chips.map((x) => x.label).join(' · ')}\n`)
  }
  process.exit(0)
}

main().catch((e: unknown) => {
  process.stdout.write(`failed: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
