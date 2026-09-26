import { config as loadEnv } from 'dotenv'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import postgres from 'postgres'
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator'
import { resolveMigrationTarget } from './migration-target'

// Load env from .env.local (dev override) then .env (defaults). Missing files
// are silently ignored — this matches Next.js/Vercel loading order.
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'lib/db/migrations')

async function runPgMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1 })
  const db = drizzlePg(client)
  await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER })
  await client.end()
}

async function runPgliteMigrations(url: string): Promise<void> {
  const target = url.slice('pglite:'.length)
  const isInMemory = target === '' || target === 'memory://'
  const client = isInMemory ? new PGlite() : new PGlite(target)

  // PGlite has no built-in drizzle migrator (it accepts a fully qualified fs
  // path shape that differs from postgres-js). We manually apply every
  // migration file in sorted order — safe here because each run against
  // in-memory PGlite starts from a fresh database. For file-backed PGlite we
  // maintain a lightweight `__drizzle_migrations` table to avoid re-applying.
  await client.exec(`
    create table if not exists __drizzle_migrations (
      id serial primary key,
      hash text not null unique,
      created_at timestamptz not null default now()
    )
  `)

  let entries: string[]
  try {
    entries = await readdir(MIGRATIONS_FOLDER)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('no migrations folder — nothing to apply')
      await client.close()
      return
    }
    throw error
  }
  const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort()

  const applied = (await client.query<{ hash: string }>('select hash from __drizzle_migrations')).rows
  const appliedHashes = new Set(applied.map((r) => r.hash))

  for (const file of sqlFiles) {
    if (appliedHashes.has(file)) {
      console.log(`skip (already applied): ${file}`)
      continue
    }
    const sqlText = await readFile(path.join(MIGRATIONS_FOLDER, file), 'utf8')
    // Drizzle uses `--> statement-breakpoint` as a separator; split on it and
    // execute each fragment. Some drivers reject multi-statement blocks in
    // one call; PGlite's `exec` handles them, but this is safer for large
    // migrations that mix DDL with data statements.
    const statements = sqlText
      .split(/-->\s*statement-breakpoint\s*/g)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      await client.exec(stmt)
    }
    await client.query('insert into __drizzle_migrations (hash) values ($1)', [file])
    console.log(`applied: ${file}`)
  }

  await client.close()
}

async function main(): Promise<void> {
  const plan = resolveMigrationTarget({
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
  })
  if (plan.action === 'skip') {
    console.log(`migrations skipped — ${plan.reason}`)
    return
  }
  const { url } = plan

  if (url.startsWith('pglite:')) {
    await runPgliteMigrations(url)
  } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    await runPgMigrations(url)
  } else {
    throw new Error(`Unsupported DATABASE_URL scheme: ${url}`)
  }

  console.log('migrations complete')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
