import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from './schema'

type DbInstance = {
  db: ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>
  close: () => Promise<void>
  isPglite: boolean
  pglite?: PGlite
}

function makeDb(): DbInstance {
  const url = env.DATABASE_URL
  if (url.startsWith('pglite:')) {
    const path = url.slice('pglite:'.length)
    // 'pglite:memory://' -> pass 'memory://' (PGlite treats this as in-memory)
    // 'pglite:' or 'pglite:memory://' both default to in-memory
    const client = path === '' || path === 'memory://' ? new PGlite() : new PGlite(path)
    return {
      db: drizzlePglite(client, { schema }),
      close: async () => {
        await client.close()
      },
      isPglite: true,
      pglite: client,
    }
  }
  const client = postgres(url, { max: 1 })
  return {
    db: drizzlePg(client, { schema }),
    close: async () => {
      await client.end()
    },
    isPglite: false,
  }
}

const globalForDb = globalThis as unknown as { __employInstance?: DbInstance }
const instance = globalForDb.__employInstance ?? makeDb()
if (process.env.NODE_ENV !== 'production') globalForDb.__employInstance = instance

export const db = instance.db
export const closeDb = instance.close
export const isPglite = instance.isPglite
export const pgliteClient = instance.pglite
export type Db = typeof db
// Transaction argument type — the value passed into a `db.transaction(async (tx) => ...)` callback.
// Query functions accept `Db | Tx` so they can be composed inside a transaction.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbClient = Db | Tx
