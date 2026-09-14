// Runs before every test file so `lib/env` can parse successfully.
// Only fills placeholders; do NOT put real secrets here.
const p = process.env as Record<string, string | undefined>
p.NODE_ENV ??= 'test'
p.DATABASE_URL ??= 'pglite:memory://'
p.AUTH_SECRET ??= 'x'.repeat(32)
p.AUTH_GOOGLE_ID ??= 'test-google-id'
p.AUTH_GOOGLE_SECRET ??= 'test-google-secret'
p.NEXTAUTH_URL ??= 'http://localhost:3000'
p.ALLOWED_EMAIL ??= 'test@example.com'
p.AI_PROVIDER ??= 'gemini'
p.GEMINI_API_KEY ??= 'test-gemini-key'
p.CRON_SECRET ??= 'x'.repeat(32)
