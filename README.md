# Employ

Personal job-search tracker. Single-user Next.js 15 app deployed on Vercel with Neon Postgres, Auth.js, and Gemini for AI parsing.

Spec: `docs/superpowers/specs/2026-09-14-employ-core-tracker-design.md`
Plan: `docs/superpowers/plans/2026-09-14-employ-core-tracker.md`

## Local dev

```
pnpm install
cp .env.example .env.local   # fill in values
pnpm db:migrate
pnpm dev
```

Local dev and tests default to an in-memory pglite database via `DATABASE_URL=pglite:memory://` in `.env.local`. Point `DATABASE_URL` at a real Postgres/Neon URL to persist data.

## Test

```
pnpm lint
pnpm test         # unit + integration
pnpm test:e2e     # playwright
```

Before the first `pnpm test:e2e`, install the browser once:

```
pnpm playwright install chromium
```

On Linux CI use `pnpm playwright install --with-deps chromium` to also pull system libs.

## Deployment (Vercel)

1. Create a Neon project (free tier). Copy the pooled + direct connection strings.
2. Create a Google Cloud OAuth 2.0 client (Web application). Authorized redirect URI: `https://<your-vercel-app>.vercel.app/api/auth/callback/google`.
3. Get a Gemini API key from https://aistudio.google.com/apikey.
4. Import this repo in Vercel. In project settings -> Environment Variables:
   - `DATABASE_URL` = Neon pooled URL (production uses Neon; local dev uses `pglite:memory://` per `.env.local`)
   - `AUTH_SECRET` = `openssl rand -hex 32`
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
   - `NEXTAUTH_URL` = `https://<your-vercel-app>.vercel.app`
   - `ALLOWED_EMAIL` = your Google email
   - `AI_PROVIDER=gemini`, `GEMINI_API_KEY`
   - `CRON_SECRET` = `openssl rand -hex 32`
   - (optional) `FIRECRAWL_API_KEY`
5. Deploy. First build runs `pnpm db:migrate` automatically.
6. Sign in at `/signin`. Only `ALLOWED_EMAIL` can proceed.

## Data safety

- Neon free tier includes 7-day point-in-time recovery.
- Manual backup: `pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump`.
