import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'pglite:memory://' },
  verbose: true,
  strict: true,
})
