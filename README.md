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

## Test

```
pnpm lint
pnpm test         # unit + integration
pnpm test:e2e     # playwright
```
