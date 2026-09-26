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

## Running evals

Deterministic regression check for AI outputs. Fixture JSON lives under
`tests/eval/fixtures/`; golden snapshots under `tests/eval/snapshots/`.

```
pnpm eval             # regress against snapshots (fails on any diff)
pnpm eval --update    # overwrite snapshots — run after an intentional
                      # prompt or model-version change, then commit the JSON
pnpm eval --live      # run against a real provider (needs GROQ_API_KEY or
                      # GEMINI_API_KEY). Never fails on diff — warn only.
```

On a fresh checkout with no snapshots yet, `pnpm eval` prints a friendly
message and exits 0. Bump a prompt's `VERSION` constant whenever you edit
the prompt so analytics can attribute rating deltas to the change.

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
   - `CRON_SECRET` = `openssl rand -hex 32`
   - (optional server defaults) `AI_PROVIDER`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
     `FIRECRAWL_API_KEY`, `DECISION_PROVIDER`, `LAYA_ENDPOINT`, `LAYA_API_KEY`.
     These can all be set per user in the app instead (Settings › AI: model,
     decision engine, and encrypted keys); a value saved there wins over the env
     default. Sign-in, database, cron secret and site URL stay env-only.
5. Deploy. First build runs `pnpm db:migrate` automatically.
6. Sign in at `/signin`. Only `ALLOWED_EMAIL` can proceed.

## Data safety

- Neon free tier includes 7-day point-in-time recovery.
- Manual backup: `pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump`.
