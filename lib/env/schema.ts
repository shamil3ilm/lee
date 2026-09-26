import { z } from 'zod'

// Provider API keys (GEMINI / GROQ / FIRECRAWL / LAYA) are optional at boot:
// each user can save their own in Settings › AI (encrypted in the key store)
// and the env values are only fallback defaults. A missing key surfaces as a
// friendly "add a key in Settings › AI" error at call time, never as a boot
// failure that forces an env change.
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z
      .string()
      .refine(
        (v) =>
          v.startsWith('postgres://') ||
          v.startsWith('postgresql://') ||
          v.startsWith('pglite:'),
        { message: 'DATABASE_URL must be postgres://, postgresql:// or pglite:' },
      ),
    AUTH_SECRET: z.string().min(32),
    AUTH_GOOGLE_ID: z.string().min(1),
    AUTH_GOOGLE_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url(),
    ALLOWED_EMAIL: z.string().email(),
    AI_PROVIDER: z.enum(['gemini', 'groq', 'anthropic', 'openai']).default('gemini'),
    GEMINI_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    FIRECRAWL_API_KEY: z.string().optional(),
    GITHUB_TOKEN: z.string().optional(),
    CRON_SECRET: z.string().min(32),
    // v19 — shared HMAC secret for the optional GitHub Actions queue worker
    // (POST /api/internal/queue/drain). Unset = the endpoint is disabled.
    QUEUE_WORKER_SECRET: z.string().min(32).optional(),
    // v8 — decision provider selection. Default runs Groq (existing key)
    // with a heuristic-on-failure fallback. `laya` activates a self-hosted
    // Laya Space via HTTP; kept optional in v8 because the endpoint is
    // deferred to v8.1 and the composed provider handles Laya being absent.
    DECISION_PROVIDER: z.enum(['groq', 'heuristic', 'laya']).optional().default('groq'),
    LAYA_ENDPOINT: z.string().url().optional(),
    LAYA_API_KEY: z.string().optional(),
  })

export type Env = z.infer<typeof envSchema>

export function parseEnv(raw: Record<string, string | undefined>): Env {
  // Vercel's Neon integration injects DATABASE_URL_UNPOOLED (and PG* vars) but,
  // depending on the integration version, may omit DATABASE_URL itself. Fall
  // back so the app never boots with a missing primary URL when a valid one
  // exists under the unpooled name.
  const withFallback: Record<string, string | undefined> = { ...raw }
  if (!withFallback.DATABASE_URL && withFallback.DATABASE_URL_UNPOOLED) {
    withFallback.DATABASE_URL = withFallback.DATABASE_URL_UNPOOLED
  }
  return envSchema.parse(withFallback)
}
