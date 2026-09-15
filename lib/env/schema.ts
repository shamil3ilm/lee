import { z } from 'zod'

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
    AI_PROVIDER: z.enum(['gemini', 'anthropic', 'openai']).default('gemini'),
    GEMINI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    FIRECRAWL_API_KEY: z.string().optional(),
    CRON_SECRET: z.string().min(32),
  })
  .superRefine((data, ctx) => {
    if (data.AI_PROVIDER === 'gemini' && !data.GEMINI_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'GEMINI_API_KEY required when AI_PROVIDER=gemini' })
    }
    if (data.AI_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'ANTHROPIC_API_KEY required when AI_PROVIDER=anthropic' })
    }
    if (data.AI_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'OPENAI_API_KEY required when AI_PROVIDER=openai' })
    }
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
