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

## Google Drive file storage

Document assets (and the compiled-PDF cache, and optional CV copies) live in the
user's own Google Drive under `Employ/` once they click **Connect Google Drive**
(Settings › Integrations, the LaTeX Assets dialog, or the CV score upload).
Neon keeps only the Drive file id, name, size, MIME type and sha256. Without
Drive, files stay in Postgres, capped at 150 MB per user. The app requests the
non-sensitive `drive.file` scope, which only covers files Employ creates or the
user picks in the Google Picker.

One-time Google Cloud console setup (same project as the OAuth client):

1. **APIs & Services › Library**: enable **Google Drive API** and **Google Picker API**.
2. **Google Auth Platform › Data Access › Add or remove scopes**: add
   `https://www.googleapis.com/auth/drive.file` (listed as non-sensitive, so no
   extra verification), then **Save**.
3. **APIs & Services › Credentials › Create credentials › API key** (for the Picker):
   - Application restrictions: **Websites**, add `https://<your-vercel-app>.vercel.app/*`,
     `http://localhost:3000/*` for dev, **and** `https://docs.google.com/*` (the
     Picker runs in an iframe there; without it the key is rejected).
   - API restrictions: **Restrict key** › **Google Picker API**.
4. Note the **project number** (IAM & Admin › Settings, or the console home
   dashboard). It is the Picker's app id and must be the project that owns the
   OAuth client.

Vercel › Settings › Environment Variables (Production + Preview, **not**
marked Sensitive, because `NEXT_PUBLIC_*` values are inlined at build time),
then redeploy without the build cache:

- `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` = the restricted API key
- `NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER` = the project number

Both are optional: without them "Attach from Drive" is hidden, and uploads,
downloads and moving files to Drive still work. Existing users keep their
session; they click **Connect Google Drive** once to grant the new scope, then
**Move existing files to Drive** in Settings › Integrations.

## Background jobs

Background work (reminders, follow-ups, Gmail sync, digest, discovery, the
discovery email, Scam Shield re-checks) runs as small jobs in the `queue_jobs`
table (`lib/queue/`). Vercel Hobby crons (UTC, each may fire up to 59 min late):

| Cron | Path | What it does |
|---|---|---|
| 09:00 | `/api/cron/schedule` | enqueue the day's jobs (idempotent per UTC day), then drain for 240 s |
| 12:00, 16:00, 21:00 | `/api/cron/drain` | drain due jobs and retries for 240 s |
| 03:30 | `/api/cron/retention` | storage retention (also deletes done jobs after 14 days, dead after 30) |

Authed page views also drain up to 2 of the visitor's due jobs after the
response (at most once per 10 min). Settings › Background jobs shows counts,
failures, **Retry** and **Run now**. `/api/cron/sync-all` still works as an
alias (enqueue + drain).

### Optional GitHub Actions worker

`.github/workflows/queue-drain.yml` calls the signed endpoint
`POST /api/internal/queue/drain` (HMAC-SHA256 over `timestamp.body`, 5-minute
window). It is off by default. To enable it:

1. Generate a secret: `openssl rand -hex 32`.
2. Vercel env: `QUEUE_WORKER_SECRET=<secret>` (redeploy). Unset = endpoint returns 404.
3. GitHub repo › Settings › Secrets and variables › Actions: secrets
   `QUEUE_WORKER_SECRET=<secret>` and `APP_URL=https://<your-app>.vercel.app`,
   and variable `QUEUE_DRAIN_ENABLED=true`.
4. Run it from the Actions tab (workflow_dispatch). To run it on a timer, add a
   `schedule:` trigger to the workflow.

## Data safety

- Neon free tier includes 7-day point-in-time recovery.
- Manual backup: `pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump`.
